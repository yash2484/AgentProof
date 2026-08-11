# server/tests/unit/test_trace_outcomes.py
"""Unit tests for the eval-outcome columns on the traces list."""

from __future__ import annotations

from agentproof_server.api.traces import (
    OUTCOME_FILTERS,
    _outcome_payload,
    _outcome_subquery,
    _trace_outcomes_stmt,
)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------
#
# The grid needs a per-trace verdict. Fetching it per row would be an N+1 over
# a 200-row page, so the outcome arrives as one aggregate keyed by trace_id,
# and the filter uses a subquery so paging still happens in the database.


def test_outcomes_are_fetched_for_a_whole_page_in_one_query():
    sql = _sql(_trace_outcomes_stmt(["tr-a", "tr-b"]))
    assert "group by eval_results.trace_id" in sql
    assert "in ('tr-a', 'tr-b')" in sql


def test_the_worst_metric_travels_with_the_counts():
    # Naming the lowest-scoring metric is what makes the grid scannable.
    sql = _sql(_trace_outcomes_stmt(["tr-a"]))
    assert "array_agg" in sql
    assert "order by eval_results.score asc" in sql


def test_outcomes_exclude_degraded_rows_from_pass_and_fail():
    sql = _sql(_trace_outcomes_stmt(["tr-a"]))
    assert "jsonb_path_exists" in sql


def test_an_empty_page_needs_no_query_at_all():
    assert _trace_outcomes_stmt([]) is None


def test_the_outcome_filter_is_a_subquery_so_paging_stays_in_the_database():
    # Filtering after the page is fetched would return short pages and a
    # wrong total.
    sql = _sql(_outcome_subquery())
    assert "group by eval_results.trace_id" in sql


def test_every_offered_filter_has_a_predicate():
    for name in OUTCOME_FILTERS:
        assert OUTCOME_FILTERS[name] is not None


def test_the_filters_are_the_questions_this_page_exists_to_answer():
    assert set(OUTCOME_FILTERS) == {"failed", "passed", "degraded", "not_evaluated"}


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


def test_a_fully_passing_trace_reports_its_denominator():
    row = _outcome_payload((8, 0, 0, 1.0, ["cost_budget", "faithfulness"]))

    assert row == {
        "total": 8,
        "passed": 8,
        "failed": 0,
        "degraded": 0,
        "worst_metric": "cost_budget",
        "worst_score": 1.0,
        "outcome": "passed",
    }


def test_a_failing_trace_names_its_worst_metric():
    row = _outcome_payload((8, 2, 0, 0.35, ["faithfulness", "relevance"]))

    assert row["failed"] == 2
    assert row["passed"] == 6
    assert row["worst_metric"] == "faithfulness"
    assert row["outcome"] == "failed"


def test_a_trace_whose_measurements_broke_is_not_reported_as_passing():
    # Six scored rows and two broken judge calls is not "8/8 passed".
    row = _outcome_payload((6, 0, 2, 1.0, ["relevance"]))

    assert row["total"] == 6
    assert row["degraded"] == 2
    assert row["outcome"] == "degraded"


def test_a_failure_outranks_a_broken_measurement():
    # A degraded row must never mask a real finding, same rule as the
    # Overview's severity ladder.
    row = _outcome_payload((6, 1, 2, 0.2, ["injection_resistance"]))

    assert row["outcome"] == "failed"


def test_an_unevaluated_trace_says_so_rather_than_passing():
    row = _outcome_payload(None)

    assert row == {
        "total": 0,
        "passed": 0,
        "failed": 0,
        "degraded": 0,
        "worst_metric": None,
        "worst_score": None,
        "outcome": "not_evaluated",
    }


def test_a_trace_with_only_degraded_rows_is_not_unevaluated_either():
    # Something ran; it broke. That is a different fact from nobody trying.
    row = _outcome_payload((0, 0, 3, None, []))

    assert row["outcome"] == "degraded"
    assert row["total"] == 0
