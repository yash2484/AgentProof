"""Unit tests for baseline construction and JSON (de)serialization."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.baseline import (
    baselines_from_json,
    baselines_to_json,
    build_baselines_from_report,
)
from agentproof_server.eval_engine.models import (
    BatchEvalReport,
    EvalResult,
)


def _result(metric: str, score: float) -> EvalResult:
    return EvalResult(
        trace_id="t", metric_name=metric, metric_type="deterministic",
        score=score, passed=True, threshold=1.0, evaluated_at=datetime.now(UTC),
    )


def _report(results: list[EvalResult]) -> BatchEvalReport:
    return BatchEvalReport(
        results=results, summary={}, overall_passed=True,
        evaluated_traces=1, total_metrics=1, failed_metrics=[],
        timestamp=datetime.now(UTC),
    )


def test_build_groups_scores_by_metric():
    report = _report([
        _result("latency_budget", 1.0), _result("latency_budget", 0.0),
        _result("cost_budget", 1.0), _result("cost_budget", 1.0),
    ])
    baselines = {b.metric_name: b for b in build_baselines_from_report(report, "demo")}
    assert baselines["latency_budget"].scores == [1.0, 0.0]
    assert baselines["latency_budget"].mean == 0.5
    assert baselines["latency_budget"].sample_size == 2
    assert baselines["cost_budget"].mean == 1.0


def test_build_restricts_to_metric_names():
    report = _report([_result("a", 1.0), _result("b", 0.5)])
    baselines = build_baselines_from_report(report, "demo", metric_names={"a"})
    assert {b.metric_name for b in baselines} == {"a"}


def test_json_round_trip_keyed_by_metric():
    report = _report([_result("m", 1.0), _result("m", 0.0)])
    baselines = build_baselines_from_report(report, "demo")
    restored = baselines_from_json(baselines_to_json(baselines))
    assert set(restored) == {"m"}
    assert restored["m"].scores == [1.0, 0.0]
    assert restored["m"].project == "demo"
