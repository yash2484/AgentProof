# server/tests/unit/test_evals_summary.py
"""Unit tests for the evals-summary helpers that don't require a database."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.api.evals import (
    _summary_metrics_stmt,
    _summary_p99_stmt,
    _summary_payload,
    _summary_trace_count_stmt,
)

EVALUATED_AT = datetime(2026, 8, 2, 10, 14, 22, tzinfo=UTC)


def test_summary_payload_shapes_metric_rows():
    payload = _summary_payload(
        project="demo",
        trace_count=247,
        p99_latency_ms=1820.5,
        metric_rows=[("injection_resistance", 1.0, 1.0, 247, EVALUATED_AT)],
    )
    assert payload["project"] == "demo"
    assert payload["trace_count"] == 247
    assert payload["p99_latency_ms"] == 1820.5
    assert payload["metrics"] == [
        {
            "metric_name": "injection_resistance",
            "mean_score": 1.0,
            "pass_rate": 1.0,
            "count": 247,
            "last_evaluated_at": "2026-08-02T10:14:22+00:00",
        }
    ]


def test_summary_payload_weights_overall_pass_rate_by_count():
    # 90 of 100 + 10 of 100 -> 100 of 200 -> 0.5, not the unweighted 0.5 by luck:
    # 8 of 10 and 0 of 90 must give 0.08, not the unweighted 0.4.
    payload = _summary_payload(
        project="demo",
        trace_count=100,
        p99_latency_ms=None,
        metric_rows=[
            ("a", 0.9, 0.8, 10, EVALUATED_AT),
            ("b", 0.1, 0.0, 90, EVALUATED_AT),
        ],
    )
    assert payload["overall_pass_rate"] == 0.08


def test_summary_payload_empty_project_is_not_an_error():
    payload = _summary_payload(
        project="fresh", trace_count=0, p99_latency_ms=None, metric_rows=[]
    )
    assert payload == {
        "project": "fresh",
        "trace_count": 0,
        "overall_pass_rate": None,
        "p99_latency_ms": None,
        "metrics": [],
    }


def test_summary_payload_allows_a_null_project():
    payload = _summary_payload(
        project=None, trace_count=3, p99_latency_ms=None, metric_rows=[]
    )
    assert payload["project"] is None


def test_summary_payload_tolerates_a_null_last_evaluated_at():
    payload = _summary_payload(
        project="demo",
        trace_count=1,
        p99_latency_ms=None,
        metric_rows=[("m", 1.0, 1.0, 1, None)],
    )
    assert payload["metrics"][0]["last_evaluated_at"] is None


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


def test_metrics_stmt_groups_by_metric_name():
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "group by" in sql
    assert "metric_name" in sql


def test_metrics_stmt_avoids_avg_over_a_boolean():
    # Postgres rejects avg(boolean); the pass rate must go through a CASE.
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "case" in sql
    assert "avg(eval_results.passed)" not in sql


def test_metrics_stmt_scopes_by_project_via_the_traces_join():
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "join traces" in sql
    assert "traces.project = 'demo'" in sql


def test_metrics_stmt_without_a_project_neither_joins_nor_filters():
    sql = _sql(_summary_metrics_stmt(None)).lower()
    assert "join traces" not in sql
    assert "traces.project" not in sql


def test_trace_count_stmt_counts_traces_in_the_project():
    sql = _sql(_summary_trace_count_stmt("demo")).lower()
    assert "count(" in sql
    assert "from traces" in sql
    assert "traces.project = 'demo'" in sql


def test_p99_stmt_uses_an_ordered_set_aggregate():
    sql = _sql(_summary_p99_stmt("demo")).lower()
    assert "percentile_cont" in sql
    assert "within group" in sql
    assert "total_latency_ms" in sql
