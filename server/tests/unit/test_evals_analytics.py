# server/tests/unit/test_evals_analytics.py
"""Unit tests for the analytics helpers that don't require a database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from agentproof_server.api.analytics import (
    _analytics_payload,
    _ci_block_by_metric,
    _eval_timeline_stmt,
    _evaluated_traces_stmt,
    _metric_health_stmt,
    _metric_runs_stmt,
    _score_buckets_stmt,
    _trace_totals_stmt,
    _trace_volume_stmt,
    _window_start,
    cluster_eval_runs,
    is_degraded,
    metric_group,
)

T0 = datetime(2026, 8, 8, 6, 39, 0, tzinfo=UTC)
SINCE = datetime(2026, 7, 9, 0, 0, 0, tzinfo=UTC)


def _tick(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def _tl(
    seconds: float,
    trace_ids: list[str],
    score_sum: float = 8.0,
    score_count: int = 8,
    degraded: int = 0,
    metric_type: str = "llm_judge",
) -> tuple:
    """A timeline row as ``_eval_timeline_stmt`` selects it."""
    return (_tick(seconds), metric_type, trace_ids, score_sum, score_count, degraded)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


# ---------------------------------------------------------------------------
# Degraded derivation
# ---------------------------------------------------------------------------
#
# "Degraded" means the *measurement* failed, not that the agent did. It is
# derived from the per-span judge records in ``details`` -- there is no column
# for it, and adding one would need a migration this repo cannot currently run.


def test_a_judge_error_marks_the_row_degraded():
    details = {"per_span": [{"span_id": "s1", "error": "APIError: 500"}]}
    assert is_degraded(details) is True


def test_a_judge_refusal_marks_the_row_degraded():
    details = {"per_span": [{"span_id": "s1", "refusal": True}]}
    assert is_degraded(details) is True


def test_one_bad_record_among_good_ones_still_degrades_the_row():
    details = {
        "per_span": [
            {"span_id": "s1", "score": 1.0},
            {"span_id": "s2", "refusal": True},
        ]
    }
    assert is_degraded(details) is True


def test_clean_judge_records_are_not_degraded():
    details = {"per_span": [{"span_id": "s1", "score": 0.9, "reasoning": "..."}]}
    assert is_degraded(details) is False


def test_a_deterministic_metric_with_no_per_span_is_not_degraded():
    # Deterministic evaluators write flat details and never call a judge, so
    # they can never be degraded -- a low score there is a real finding.
    assert is_degraded({"latency_ms": 1820, "limit": 2000}) is False


def test_missing_details_is_not_degraded():
    assert is_degraded(None) is False


# -- nested judge records ---------------------------------------------------
#
# A security metric in ``dual`` mode writes ``{"heuristic": {...}, "llm":
# {"per_span": [...]}, "combine": "min"}`` (``security.py:180``), so the judge
# records sit one level down. Reading only the top-level ``per_span`` missed
# them, and ``combine: min`` turns a failed-closed 0.0 into the trace's score
# -- measured on the demo corpus: an ``injection_resistance`` row reading
# 0.0/failed whose judge had returned 529 Overloaded on one span, while the
# heuristic scored every span 1.0 with ``injection_attempted: false``. An API
# outage rendered as "the agent gave ground under attack".


def test_a_judge_error_nested_under_dual_mode_is_degraded():
    details = {
        "heuristic": {"mode": "heuristic", "per_span": [{"span_id": "s1", "score": 1.0}]},
        "llm": {
            "mode": "llm",
            "per_span": [
                {"span_id": "s1", "score": 1.0},
                {"span_id": "s2", "error": "OverloadedError: 529"},
            ],
        },
        "combine": "min",
        "detection_mode": "dual",
    }
    assert is_degraded(details) is True


def test_a_clean_dual_mode_blob_is_not_degraded():
    details = {
        "heuristic": {"mode": "heuristic", "per_span": [{"span_id": "s1", "score": 1.0}]},
        "llm": {"mode": "llm", "per_span": [{"span_id": "s1", "score": 1.0}]},
        "combine": "min",
    }
    assert is_degraded(details) is False


def test_an_error_outside_a_per_span_record_does_not_degrade():
    # Precision guard. The judge writes these markers only inside per-span
    # records; matching an ``error`` key anywhere would let an unrelated blob
    # silently erase a real finding from the mean.
    assert is_degraded({"error": "trace failed", "violations": []}) is False


# ---------------------------------------------------------------------------
# Eval-run gap clustering
# ---------------------------------------------------------------------------
#
# ``runner.py`` stamps ``evaluated_at`` once per *trace*, not per batch, so
# grouping by timestamp equality reports one run per trace. Rows separated by
# less than the gap belong to the same run.


def test_thirteen_traces_evaluated_back_to_back_are_one_run():
    # The measured case: one batch of 13 traces, each stamped a few seconds
    # apart. Equality grouping would report 13 runs; there were 2 batches.
    rows = [_tl(i * 4, [f"tr-{i}"]) for i in range(13)]

    runs = cluster_eval_runs(rows)

    assert len(runs) == 1
    assert runs[0]["trace_count"] == 13


def test_a_trace_evaluated_twice_in_one_run_counts_once():
    # Measured against the live demo data: 13 traces evaluated twice inside a
    # single window reported trace_count 26 for a project holding 25 traces.
    # A run's trace count is distinct traces, not eval events.
    rows = [
        _tl(0, ["tr-a"]),
        _tl(4, ["tr-b"]),
        _tl(8, ["tr-a"]),
        _tl(12, ["tr-b"]),
    ]

    runs = cluster_eval_runs(rows)

    assert len(runs) == 1
    assert runs[0]["trace_count"] == 2


def test_one_trace_measured_by_two_metric_types_counts_once():
    # SQL now emits one row per (instant, metric_type), so a single trace
    # arrives split across groups. Summing those rows' trace ids without a set
    # would report two traces where one was evaluated.
    rows = [
        _tl(0, ["tr-a"], metric_type="llm_judge"),
        _tl(0, ["tr-a"], metric_type="security"),
    ]

    assert cluster_eval_runs(rows)[0]["trace_count"] == 1


def test_the_same_trace_in_two_runs_counts_in_each():
    # Re-evaluating a trace next week is a real data point for that run;
    # deduping across runs would erase it.
    rows = [_tl(0, ["tr-a"]), _tl(4000, ["tr-a"])]

    assert [r["trace_count"] for r in cluster_eval_runs(rows)] == [1, 1]


def test_a_gap_longer_than_the_threshold_starts_a_new_run():
    rows = [_tl(0, ["a"]), _tl(4, ["b"]), _tl(604, ["c"]), _tl(608, ["d"])]

    runs = cluster_eval_runs(rows)

    assert len(runs) == 2
    assert [r["trace_count"] for r in runs] == [2, 2]


def test_a_gap_exactly_at_the_threshold_stays_in_the_same_run():
    assert len(cluster_eval_runs([_tl(0, ["a"]), _tl(120, ["b"])], gap_seconds=120)) == 1


def test_run_at_is_the_earliest_timestamp_in_the_cluster():
    assert cluster_eval_runs([_tl(0, ["a"]), _tl(30, ["b"])])[0]["run_at"] == T0


def test_degraded_measurements_are_summed_across_the_run():
    rows = [_tl(0, ["a"], degraded=1), _tl(5, ["b"], degraded=2)]

    assert cluster_eval_runs(rows)[0]["degraded"] == 3


def test_no_eval_rows_yield_no_runs():
    assert cluster_eval_runs([]) == []


def test_zero_gap_tolerance_reproduces_the_thirteen_run_miscount():
    # Pins what the gap is actually buying: the same 13 rows split into 13
    # runs the moment tolerance goes away, which is what equality grouping did.
    rows = [_tl(i * 4, [f"tr-{i}"]) for i in range(13)]

    assert len(cluster_eval_runs(rows, gap_seconds=0)) == 13


# ---------------------------------------------------------------------------
# Metric groups and per-group run means
# ---------------------------------------------------------------------------
#
# A judge score, a 0/1 breach flag and a budget-compliance bit are three
# different units. Pooling them was measured on the synthetic corpus: a
# -0.15 drift in the judged metrics came out as a flat 0.974 -> 0.929 line
# because six metrics pinned at 1.000 diluted it.


def test_judge_metrics_group_as_answer_quality():
    assert metric_group("llm_judge") == "quality"


def test_security_metrics_group_as_adversarial_safety():
    assert metric_group("security") == "safety"


def test_deterministic_metrics_group_as_budgets_and_contracts():
    assert metric_group("deterministic") == "budgets"


def test_an_unrecognised_metric_type_gets_its_own_bucket():
    # ``composite`` is in the type system with no members and no defined chart
    # form, so it lands here alongside anything else unrecognised rather than
    # being silently averaged into a group it does not share units with.
    assert metric_group("composite") == "other"
    assert metric_group("something-new") == "other"


def test_run_means_are_reported_per_group_never_pooled():
    rows = [
        _tl(0, ["a"], score_sum=1.6, score_count=2, metric_type="llm_judge"),
        _tl(4, ["a"], score_sum=3.0, score_count=3, metric_type="deterministic"),
    ]

    run = cluster_eval_runs(rows)[0]

    assert run["group_means"]["quality"] == 0.8
    assert run["group_means"]["budgets"] == 1.0
    # The pooled 0.92 is the number the design brief removed.
    assert "mean_score" not in run


def test_a_group_mean_is_row_weighted_within_the_group():
    # One trace scored 1.0 on 8 rows, the next 0.0 on 2. Row-weighted is 0.8;
    # averaging the two per-trace means would give 0.5.
    rows = [_tl(0, ["a"], 8.0, 8), _tl(5, ["b"], 0.0, 2)]

    assert cluster_eval_runs(rows)[0]["group_means"]["quality"] == 0.8


def test_a_group_absent_from_a_run_reports_null_not_zero():
    # Series have to stay aligned across runs, so every group seen anywhere
    # gets a key in every run -- but a group nobody measured is unknown, not
    # zero, and a zero would draw a cliff that never happened.
    rows = [
        _tl(0, ["a"], metric_type="llm_judge"),
        _tl(0, ["a"], metric_type="security"),
        _tl(4000, ["b"], metric_type="llm_judge"),
    ]

    runs = cluster_eval_runs(rows)

    assert runs[1]["group_means"]["safety"] is None
    assert set(runs[0]["group_means"]) == set(runs[1]["group_means"])


def test_a_run_whose_rows_all_degraded_reports_a_null_mean_not_zero():
    # "Nothing to average" and "everything scored zero" are different facts,
    # and the judge fails closed to 0.0 -- so this is the difference between
    # "six API calls broke" and "quality collapsed".
    rows = [_tl(0, ["a"], score_sum=0.0, score_count=0, degraded=6)]

    run = cluster_eval_runs(rows)[0]

    assert run["group_means"]["quality"] is None
    assert run["degraded"] == 6


# ---------------------------------------------------------------------------
# SQL statement builders
# ---------------------------------------------------------------------------
#
# Every figure is aggregated in SQL. The dashboard must never receive rows it
# then reduces itself -- the results endpoint caps at 200, so a client-side
# mean would describe a sample while implying full history.


def test_trace_totals_sums_tokens_and_cost_alongside_the_count():
    sql = _sql(_trace_totals_stmt("demo", SINCE))
    assert "count(" in sql
    assert "sum(traces.total_tokens)" in sql
    assert "sum(traces.total_cost_usd)" in sql


def test_every_statement_scopes_to_the_time_window():
    for stmt in (
        _trace_totals_stmt("demo", SINCE),
        _trace_volume_stmt("demo", SINCE),
        _eval_timeline_stmt("demo", SINCE),
        _metric_health_stmt("demo", SINCE),
        _score_buckets_stmt("demo", SINCE),
        _evaluated_traces_stmt("demo", SINCE),
    ):
        assert "2026-07-09" in _sql(stmt)


def test_a_null_window_means_all_history():
    # ``days=None`` is "everything", and must not silently drop rows.
    assert "2026-07-09" not in _sql(_trace_totals_stmt("demo", None))


def test_every_statement_scopes_by_project():
    for stmt in (
        _trace_totals_stmt("demo", SINCE),
        _trace_volume_stmt("demo", SINCE),
        _eval_timeline_stmt("demo", SINCE),
        _metric_health_stmt("demo", SINCE),
        _score_buckets_stmt("demo", SINCE),
        _evaluated_traces_stmt("demo", SINCE),
    ):
        assert "traces.project = 'demo'" in _sql(stmt)


def test_eval_statements_reach_the_project_through_the_traces_join():
    # Eval rows carry no project of their own.
    for stmt in (
        _eval_timeline_stmt("demo", SINCE),
        _metric_health_stmt("demo", SINCE),
        _score_buckets_stmt("demo", SINCE),
    ):
        assert "join traces" in _sql(stmt)


def test_no_project_neither_joins_nor_filters():
    for stmt in (_metric_health_stmt(None, None), _eval_timeline_stmt(None, None)):
        sql = _sql(stmt)
        assert "join traces" not in sql
        assert "traces.project" not in sql


def test_trace_volume_buckets_by_day_and_splits_ok_from_error():
    sql = _sql(_trace_volume_stmt("demo", SINCE))
    assert "date_trunc" in sql
    assert "group by" in sql
    assert "case" in sql
    assert "'error'" in sql


def test_eval_timeline_returns_one_row_per_instant_per_metric_type():
    # The clustering fold runs over this, so SQL must have already collapsed
    # every eval row down to its timestamp. The metric type rides along
    # because run means are per group -- pooling a judge score with a breach
    # flag is the defect this split exists to remove.
    sql = _sql(_eval_timeline_stmt("demo", SINCE))
    assert (
        "group by eval_results.evaluated_at, eval_results.metric_type" in sql
    )
    assert "array_agg(distinct eval_results.trace_id)" in sql


def test_eval_timeline_excludes_degraded_rows_from_the_score_sum():
    # metric_health already excludes them. A run of six failed judge calls
    # read as a 0.750 quality score because this statement did not.
    sql = _sql(_eval_timeline_stmt("demo", SINCE))
    assert "sum(eval_results.score)" not in sql
    assert "jsonb_path_exists" in sql
    assert "sum(case when" in sql


def test_eval_timeline_is_ordered_oldest_first():
    # cluster_eval_runs walks forward and splits on gaps; unordered input
    # would fabricate runs out of nothing.
    sql = _sql(_eval_timeline_stmt("demo", SINCE))
    assert "order by eval_results.evaluated_at asc" in sql


def test_degraded_is_derived_from_the_details_json_not_a_column():
    # There is no degraded column and no working migration path to add one.
    sql = _sql(_metric_health_stmt("demo", SINCE))
    assert "jsonb_path_exists" in sql
    assert "per_span" in sql


def test_the_degraded_predicate_finds_per_span_at_any_depth():
    # ``dual`` mode nests the judge records under ``llm``. The recursive
    # accessor is what makes the SQL agree with is_degraded() -- without it
    # the two disagreed on every dual-mode security row.
    sql = _sql(_metric_health_stmt("demo", SINCE))
    assert "$.**.per_span[*].error" in sql
    assert "$.**.per_span[*].refusal" in sql


def test_metric_health_reports_the_spread_not_just_the_mean():
    # A mean of 0.911 must not hide a run that scored 0.20.
    sql = _sql(_metric_health_stmt("demo", SINCE))
    assert "stddev_samp(" in sql
    assert "avg(" in sql


def test_metric_health_avoids_avg_over_a_boolean():
    # Postgres rejects avg(boolean); the pass rate goes through a CASE.
    sql = _sql(_metric_health_stmt("demo", SINCE))
    assert "avg(eval_results.passed)" not in sql
    assert "case" in sql


def test_metric_health_groups_by_name_and_type():
    sql = _sql(_metric_health_stmt("demo", SINCE))
    assert "group by eval_results.metric_name, eval_results.metric_type" in sql


def test_score_buckets_are_computed_in_sql_at_tenth_width():
    sql = _sql(_score_buckets_stmt("demo", SINCE))
    assert "floor" in sql
    assert "10.0" in sql
    assert "group by" in sql


def test_score_buckets_clamp_the_top_bin_so_a_perfect_score_is_visible():
    # floor(1.0 * 10) / 10 opens a zero-width bin at 1.0, whose bar renders
    # off the end of a 0->1 track.
    sql = _sql(_score_buckets_stmt("demo", SINCE))
    assert "least(" in sql
    assert "0.9" in sql


def test_the_judge_only_writes_these_keys_on_failure():
    """Pins the contract the SQL degraded predicate relies on.

    ``is_degraded`` tests truthiness; the SQL tests key presence, because
    jsonpath filter syntax needs a ``?`` that is awkward to inline safely.
    The two agree only while a healthy judge record carries neither key --
    so assert that directly rather than assume it.
    """
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from agentproof_server.eval_engine.llm_judge import (
        JudgeResponse,
        run_structured_judge,
    )

    client = MagicMock()
    client.messages.parse.return_value = SimpleNamespace(
        parsed_output=JudgeResponse(reasoning="grounded", score=0.9),
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=100, output_tokens=20),
    )

    _parsed, record = run_structured_judge(
        client, "claude-sonnet-4-6", "sys", "prompt", JudgeResponse
    )

    assert "error" not in record
    assert "refusal" not in record


def test_evaluated_traces_counts_traces_not_eval_rows():
    # 31 traces x 8 metrics is 248 rows; measurement health is about traces.
    sql = _sql(_evaluated_traces_stmt("demo", SINCE))
    assert "count(distinct eval_results.trace_id)" in sql


# ---------------------------------------------------------------------------
# Per-metric run history
# ---------------------------------------------------------------------------
#
# Runs are gap-clusters of per-trace timestamps, which only Python knows. So
# the boundaries computed by the fold are pushed back into SQL as a CASE,
# keeping the aggregate at (runs x metrics) rows instead of returning one row
# per eval row for the client to reduce.


def test_metric_runs_buckets_rows_by_the_run_boundaries():
    sql = _sql(_metric_runs_stmt("demo", SINCE, [T0, _tick(4000)]))
    assert "case" in sql
    assert "group by" in sql
    assert "eval_results.metric_name" in sql


def test_metric_runs_excludes_degraded_rows_from_the_mean():
    sql = _sql(_metric_runs_stmt("demo", SINCE, [T0]))
    assert "jsonb_path_exists" in sql
    assert "avg(case when" in sql


def test_metric_runs_needs_no_query_when_nothing_ran():
    # No runs means no boundaries, and a CASE with no branches is not valid
    # SQL -- the caller must be able to skip the round trip entirely.
    assert _metric_runs_stmt("demo", SINCE, []) is None


# ---------------------------------------------------------------------------
# Payload assembly
# ---------------------------------------------------------------------------


def _metric_row(
    name="faithfulness",
    metric_type="llm_judge",
    mean=0.911,
    std=0.218,
    pass_rate=0.85,
    threshold=0.7,
    count=13,
    failed=2,
    degraded=0,
):
    return (name, metric_type, mean, std, pass_rate, threshold, count, failed, degraded)


def _payload(**overrides):
    kwargs = {
        "project": "demo",
        "days": 30,
        "generated_at": T0,
        "trace_totals": (31, 9478, 0.31),
        "volume_rows": [(T0, 13, 12, 1)],
        "timeline_rows": [_tl(i * 4, [f"tr-{i}"]) for i in range(13)],
        "metric_rows": [_metric_row()],
        "bucket_rows": [("faithfulness", 0.2, 1)],
        "evaluated_row": (30, 1),
        "ci_block_by_metric": {"faithfulness": True},
        "metric_run_rows": [],
    }
    kwargs.update(overrides)
    return _analytics_payload(**kwargs)


def test_a_metric_pinned_at_one_point_zero_reports_no_variance():
    # Six of eight metrics sit at 1.000 with std 0.000 because no scenario
    # stresses them. Rendering that as healthy launders untested into passing.
    payload = _payload(
        metric_rows=[_metric_row(name="pii_leakage", mean=1.0, std=0.0, failed=0)]
    )

    assert payload["metric_health"][0]["has_variance"] is False


def test_a_single_observation_reports_no_variance_rather_than_zero():
    # stddev_samp is NULL at n=1. That is "cannot tell", not "perfectly stable".
    payload = _payload(metric_rows=[_metric_row(std=None, count=1)])

    row = payload["metric_health"][0]
    assert row["has_variance"] is False
    assert row["std"] is None


def test_a_metric_that_moves_reports_variance():
    assert _payload()["metric_health"][0]["has_variance"] is True


def test_ci_block_comes_from_the_config():
    payload = _payload(ci_block_by_metric={"faithfulness": False})

    assert payload["metric_health"][0]["ci_block"] is False


def test_a_metric_missing_from_the_config_keeps_the_blocking_default():
    # MetricConfig.ci_block defaults True; an unknown metric must not silently
    # become non-blocking.
    payload = _payload(ci_block_by_metric={})

    assert payload["metric_health"][0]["ci_block"] is True


def test_eval_runs_are_clustered_not_counted_by_timestamp():
    payload = _payload()

    assert payload["totals"]["eval_runs"] == 1
    assert len(payload["eval_runs"]) == 1


def test_metric_health_carries_the_group_so_the_client_re_derives_nothing():
    payload = _payload(
        metric_rows=[
            _metric_row(name="faithfulness", metric_type="llm_judge"),
            _metric_row(name="injection_resistance", metric_type="security"),
            _metric_row(name="cost_budget", metric_type="deterministic"),
        ]
    )

    assert [m["group"] for m in payload["metric_health"]] == [
        "quality",
        "safety",
        "budgets",
    ]


def test_run_rows_carry_each_metric_that_ran_in_them():
    # The strip's "delta vs the previous run" and the per-metric history both
    # read this. Rows arrive as (run_index, metric_name, mean, count, failed).
    payload = _payload(
        timeline_rows=[_tl(0, ["a"]), _tl(4000, ["b"])],
        metric_run_rows=[
            (0, "faithfulness", 0.95, 8, 0),
            (0, "cost_budget", 1.0, 8, 0),
            (1, "faithfulness", 0.71, 8, 2),
        ],
    )

    assert payload["eval_runs"][0]["metric_means"] == {
        "faithfulness": 0.95,
        "cost_budget": 1.0,
    }
    assert payload["eval_runs"][1]["metric_means"] == {"faithfulness": 0.71}


def test_a_metric_absent_from_a_run_is_simply_not_there():
    # Not zero, and not a null placeholder either: the strip reads "no
    # previous value" from the key being missing, and a null would have to be
    # distinguished from a real null mean anyway.
    payload = _payload(
        timeline_rows=[_tl(0, ["a"]), _tl(4000, ["b"])],
        metric_run_rows=[(0, "faithfulness", 0.95, 8, 0)],
    )

    assert payload["eval_runs"][1]["metric_means"] == {}


def test_run_rows_carry_per_group_means_and_no_pooled_one():
    payload = _payload(
        timeline_rows=[
            _tl(0, ["a"], 1.6, 2, metric_type="llm_judge"),
            _tl(4, ["a"], 3.0, 3, metric_type="deterministic"),
        ]
    )

    run = payload["eval_runs"][0]
    assert run["group_means"] == {"quality": 0.8, "budgets": 1.0}
    assert "mean_score" not in run


def test_measurement_health_splits_scored_degraded_and_pending():
    # 31 traces, 30 evaluated of which 1 degraded -> 29 scored, 1 pending.
    payload = _payload(trace_totals=(31, 9478, 0.31), evaluated_row=(30, 1))

    totals = payload["totals"]
    assert totals["scored"] == 29
    assert totals["degraded"] == 1
    assert totals["pending"] == 1
    assert totals["scored"] + totals["degraded"] + totals["pending"] == 31


def test_a_degraded_row_is_not_counted_as_a_failure():
    # The whole point: a judge that timed out is a broken measurement, not a
    # finding. 13 scored (2 failed) plus 1 degraded = 14 rows.
    payload = _payload(
        metric_rows=[_metric_row(count=13, failed=2, degraded=1)]
    )

    assert payload["outcome_split"] == {"passed": 11, "failed": 2, "degraded": 1}


def test_status_split_is_summed_from_the_daily_volume():
    payload = _payload(volume_rows=[(T0, 13, 12, 1), (_tick(86400), 18, 18, 0)])

    assert payload["status_split"] == {"ok": 30, "error": 1}


def test_days_are_serialised_as_dates():
    payload = _payload()

    assert payload["trace_volume"][0]["day"] == "2026-08-08"


def test_run_timestamps_are_serialised_as_iso_strings():
    payload = _payload()

    assert payload["eval_runs"][0]["run_at"] == T0.isoformat()
    assert payload["generated_at"] == T0.isoformat()


def test_the_window_is_echoed_back_so_every_figure_carries_its_scope():
    payload = _payload(days=7)

    assert payload["days"] == 7
    assert payload["project"] == "demo"


def test_an_empty_project_renders_zeroes_rather_than_erroring():
    payload = _payload(
        trace_totals=(0, None, None),
        volume_rows=[],
        timeline_rows=[],
        metric_rows=[],
        bucket_rows=[],
        evaluated_row=(0, 0),
    )

    assert payload["totals"] == {
        "traces": 0,
        "eval_runs": 0,
        "scored": 0,
        "degraded": 0,
        "pending": 0,
        "tokens": None,
        "cost_usd": None,
    }
    assert payload["metric_health"] == []
    assert payload["outcome_split"] == {"passed": 0, "failed": 0, "degraded": 0}


def test_score_buckets_pass_through_per_metric():
    payload = _payload(
        bucket_rows=[("faithfulness", 0.2, 1), ("faithfulness", 1.0, 9)]
    )

    assert payload["score_buckets"] == [
        {"metric_name": "faithfulness", "bucket": 0.2, "count": 1},
        {"metric_name": "faithfulness", "bucket": 1.0, "count": 9},
    ]


# ---------------------------------------------------------------------------
# Endpoint plumbing
# ---------------------------------------------------------------------------


def test_the_window_is_measured_back_from_now():
    assert _window_start(30, T0) == T0 - timedelta(days=30)


def test_zero_days_means_all_history():
    # The demo project holds traces from June; a caller must be able to ask
    # for everything rather than silently lose them to a 30-day default.
    assert _window_start(0, T0) is None


def test_ci_block_is_read_from_the_active_config(tmp_path, monkeypatch):
    from agentproof_server import config as config_module

    cfg = tmp_path / "agentproof.yaml"
    cfg.write_text(
        "project: demo\n"
        "metrics:\n"
        "  - name: faithfulness\n"
        "    type: llm_judge\n"
        "    applies_to: llm_call\n"
        "    rubric: grounded?\n"
        "    ci_block: false\n"
        "  - name: latency_budget\n"
        "    type: deterministic\n"
        "    applies_to: trace\n"
        "    max_latency_ms: 2000\n"
    )
    monkeypatch.setattr(config_module.settings, "eval_config_path", str(cfg))

    assert _ci_block_by_metric() == {
        "faithfulness": False,
        "latency_budget": True,
    }


def test_an_unreadable_config_does_not_blank_the_overview(monkeypatch):
    # ci_block is a decoration on the page, not its subject. A missing config
    # must degrade to the blocking default rather than 500 the whole screen.
    from agentproof_server import config as config_module

    monkeypatch.setattr(
        config_module.settings, "eval_config_path", "/nonexistent/agentproof.yaml"
    )

    assert _ci_block_by_metric() == {}


# ---------------------------------------------------------------------------
# Gate verdict, computed on the fly
# ---------------------------------------------------------------------------
#
# Regression results are never persisted: there is no RegressionResult in
# db/models.py, and the ORM Baseline has no readers anywhere in the app. The
# CLI computes verdicts against JSON files, prints them and discards them. So
# the largest card on the page has to recompute from baselines/*.json plus
# candidate scores out of Postgres.

# Measured with detect_regression's own defaults (alpha 0.05, min d 0.5).
STEADY = [1.0, 1.0, 0.95, 1.0, 0.9, 1.0, 1.0, 0.95, 1.0]
SLIPPED = [1.0, 0.2, 0.9, 1.0, 0.95, 1.0, 0.85, 0.9, 1.0]  # d=0.607, p=0.116
BROKEN = [0.2, 0.2, 0.2, 0.3, 0.4, 0.2, 0.3, 0.2, 0.3]


def _baseline_doc(project="demo", metric="faithfulness", scores=None, created="2026-08-08T06:39:21Z"):
    scores = STEADY if scores is None else scores
    return {
        "project": project,
        "metric_name": metric,
        "scores": scores,
        "mean": sum(scores) / len(scores),
        "std": 0.04,
        "sample_size": len(scores),
        "created_at": created,
    }


def _baseline(**kwargs):
    from agentproof_server.eval_engine.models import Baseline

    return Baseline.model_validate(_baseline_doc(**kwargs))


def _write_baselines(tmp_path, name, docs):
    import json

    path = tmp_path / name
    path.write_text(json.dumps({"baselines": docs}))
    return path


def test_the_gate_holds_back_when_the_effect_is_large_but_not_significant():
    """The restraint case. A system that explains its silence is trustworthy.

    d=0.607 clears the effect-size guard; p=0.116 does not clear alpha. The
    verdict is "not flagged", and both numbers must reach the screen so the
    card can say why rather than just going quiet.
    """
    from agentproof_server.api.analytics import _gate_payload

    gate = _gate_payload(
        {"faithfulness": _baseline()},{"faithfulness": SLIPPED}
    )

    row = gate[0]
    assert row["is_regression"] is False
    assert row["comparable"] is True
    assert row["cohens_d"] == pytest.approx(0.607, abs=0.01)
    assert row["p_value"] == pytest.approx(0.116, abs=0.01)
    assert row["baseline_n"] == 9
    assert row["candidate_n"] == 9
    assert "d=0.607" in row["reason"]


def test_the_gate_fires_when_both_guards_clear():
    from agentproof_server.api.analytics import _gate_payload

    gate = _gate_payload(
        {"faithfulness": _baseline()},{"faithfulness": BROKEN}
    )

    row = gate[0]
    assert row["is_regression"] is True
    assert row["p_value"] < 0.05
    assert row["cohens_d"] >= 0.5


def test_a_baseline_with_no_candidate_scores_is_not_comparable():
    """The CLI skips these. Treating a missing sample as a 0.0 drop would
    invent a regression out of a metric the config no longer evaluates."""
    from agentproof_server.api.analytics import _gate_payload

    gate = _gate_payload({"faithfulness": _baseline()}, {})

    row = gate[0]
    assert row["comparable"] is False
    assert row["is_regression"] is False
    assert row["candidate_n"] == 0
    assert row["p_value"] is None


def test_a_metric_with_no_baseline_produces_no_verdict():
    # "Regressed" is a claim about change over time and needs a baseline
    # behind it. Without one there is nothing to say.
    from agentproof_server.api.analytics import _gate_payload

    gate = _gate_payload({}, {"faithfulness": BROKEN})

    assert gate == []


def test_the_newest_baseline_file_wins(tmp_path):
    from agentproof_server.api.analytics import _load_baselines

    _write_baselines(
        tmp_path, "old.json",
        [_baseline_doc(scores=[0.5] * 9, created="2026-06-22T21:36:00Z")],
    )
    _write_baselines(
        tmp_path, "new.json",
        [_baseline_doc(scores=STEADY, created="2026-08-08T06:39:21Z")],
    )

    baselines = _load_baselines("demo", tmp_path)

    assert baselines["faithfulness"].sample_size == 9
    assert baselines["faithfulness"].mean == pytest.approx(
        sum(STEADY) / len(STEADY)
    )


def test_baselines_for_other_projects_are_ignored(tmp_path):
    from agentproof_server.api.analytics import _load_baselines

    _write_baselines(
        tmp_path, "other.json", [_baseline_doc(project="something-else")]
    )

    assert _load_baselines("demo", tmp_path) == {}


def test_a_missing_baselines_directory_is_not_an_error(tmp_path):
    from agentproof_server.api.analytics import _load_baselines

    assert _load_baselines("demo", tmp_path / "nope") == {}


def test_a_corrupt_baseline_file_does_not_blank_the_page(tmp_path):
    from agentproof_server.api.analytics import _load_baselines

    (tmp_path / "broken.json").write_text("{not json")
    _write_baselines(tmp_path, "good.json", [_baseline_doc()])

    assert "faithfulness" in _load_baselines("demo", tmp_path)
