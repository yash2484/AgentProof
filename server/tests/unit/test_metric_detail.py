# server/tests/unit/test_metric_detail.py
"""Unit tests for the metric drill-down payload behind ``/evals/:metric``."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from agentproof_server.api.analytics import (
    _metric_detail_payload,
    _reasoning_from,
    _worst_rows_stmt,
)

T0 = datetime(2026, 8, 8, 6, 39, 0, tzinfo=UTC)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


# ---------------------------------------------------------------------------
# Judge reasoning
# ---------------------------------------------------------------------------
#
# The reasoning strings have been written to ``details`` since the judge
# shipped and displayed nowhere. Surfacing them is the highest-value item on
# the Evals page and costs one extraction function.


def test_reasoning_is_pulled_out_of_the_per_span_records():
    details = {
        "per_span": [
            {"span_id": "s1", "score": 0.35, "reasoning": "Claim not in context."}
        ],
        "aggregation": "min",
    }

    assert _reasoning_from(details) == [
        {"span_id": "s1", "score": 0.35, "reasoning": "Claim not in context."}
    ]


def test_reasoning_is_found_when_dual_mode_nests_it():
    # Same nesting that hid degraded records from the analytics predicate.
    details = {
        "heuristic": {"per_span": [{"span_id": "s1", "score": 1.0}]},
        "llm": {
            "per_span": [
                {"span_id": "s1", "score": 1.0, "reasoning": "No injection obeyed."}
            ]
        },
        "combine": "min",
    }

    assert _reasoning_from(details) == [
        {"span_id": "s1", "score": 1.0, "reasoning": "No injection obeyed."}
    ]


def test_a_span_with_no_reasoning_is_skipped_not_rendered_blank():
    # Heuristic security records carry a score and no prose. An empty quote
    # block reads as "the judge said nothing", which is not what happened.
    details = {"per_span": [{"span_id": "s1", "score": 1.0}], "mode": "heuristic"}

    assert _reasoning_from(details) == []


def test_a_broken_judge_call_reports_its_error_rather_than_prose():
    details = {"per_span": [{"span_id": "s2", "error": "OverloadedError: 529"}]}

    assert _reasoning_from(details) == [
        {"span_id": "s2", "score": None, "error": "OverloadedError: 529"}
    ]


def test_missing_details_yields_no_reasoning():
    assert _reasoning_from(None) == []
    assert _reasoning_from({}) == []


# ---------------------------------------------------------------------------
# Worst rows
# ---------------------------------------------------------------------------


def test_worst_rows_are_ordered_lowest_score_first():
    sql = _sql(_worst_rows_stmt("faithfulness", "demo", None, 10))
    assert "order by eval_results.score asc" in sql
    assert "limit 10" in sql


def test_worst_rows_are_scoped_to_the_one_metric():
    sql = _sql(_worst_rows_stmt("faithfulness", "demo", None, 10))
    assert "eval_results.metric_name = 'faithfulness'" in sql


def test_worst_rows_exclude_degraded_measurements():
    # A judge that timed out sorts to the bottom on a failed-closed 0.0 and
    # would fill the whole list with broken measurements rather than the
    # lowest real scores.
    sql = _sql(_worst_rows_stmt("faithfulness", "demo", None, 10))
    assert "jsonb_path_exists" in sql


# ---------------------------------------------------------------------------
# Payload assembly
# ---------------------------------------------------------------------------


def _health_row(
    name="faithfulness",
    metric_type="llm_judge",
    mean=0.856,
    std=0.142,
    pass_rate=0.826,
    threshold=0.7,
    count=92,
    failed=16,
    degraded=2,
):
    return (name, metric_type, mean, std, pass_rate, threshold, count, failed, degraded)


def _detail(**overrides):
    kwargs = {
        "metric_name": "faithfulness",
        "project": "demo",
        "days": 30,
        "health_row": _health_row(),
        "bucket_rows": [(0.3, 2), (0.9, 74)],
        "run_rows": [(T0, 0.94, 8, 0), (T0 + timedelta(days=20), 0.79, 8, 3)],
        "worst_rows": [
            (
                "tr-1",
                "sp-1",
                0.35,
                False,
                T0,
                "faithfulness: min of 1 judged span = 0.350",
                {"per_span": [{"span_id": "sp-1", "score": 0.35, "reasoning": "Not grounded."}]},
            )
        ],
        "ci_block": True,
    }
    kwargs.update(overrides)
    return _metric_detail_payload(**kwargs)


def test_the_detail_names_its_group_so_the_page_knows_which_form_to_draw():
    assert _detail()["group"] == "quality"
    assert _detail(health_row=_health_row(metric_type="security"))["group"] == "safety"


def test_the_detail_carries_the_same_health_figures_as_the_overview():
    health = _detail()["health"]

    assert health["mean_score"] == 0.856
    assert health["std"] == 0.142
    assert health["count"] == 92
    assert health["failed"] == 16
    assert health["degraded"] == 2
    assert health["has_variance"] is True


def test_run_history_is_serialised_oldest_first_with_iso_timestamps():
    runs = _detail()["runs"]

    assert runs[0]["run_at"] == T0.isoformat()
    assert runs[0]["mean_score"] == 0.94
    assert runs[1]["failed"] == 3


def test_worst_rows_carry_the_judge_reasoning_alongside_the_score():
    worst = _detail()["worst"][0]

    assert worst["trace_id"] == "tr-1"
    assert worst["score"] == 0.35
    assert worst["reasoning"][0]["reasoning"] == "Not grounded."


def test_a_metric_with_no_rows_at_all_is_absent_not_empty():
    # The route 404s on this rather than rendering a page of zeroes, so a
    # typo in the URL is distinguishable from a metric that ran and passed.
    assert _detail(health_row=None) is None


def test_the_window_and_project_are_echoed_back():
    payload = _detail(days=7)

    assert payload["days"] == 7
    assert payload["project"] == "demo"


def test_ci_block_reaches_the_detail_page():
    assert _detail(ci_block=False)["ci_block"] is False
