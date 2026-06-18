# server/tests/unit/test_runner.py
"""Unit tests for the EvalRunner orchestration and batch aggregation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from agentproof_server.eval_engine.llm_judge import JudgeResponse
from agentproof_server.eval_engine.models import EvalConfig, MetricConfig
from agentproof_server.eval_engine.runner import EvalRunner


def _judge_client(score: float):
    client = MagicMock()
    client.messages.parse.return_value = SimpleNamespace(
        parsed_output=JudgeResponse(reasoning="r", score=score),
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=1, output_tokens=1),
    )
    return client


def _trace() -> dict:
    return {
        "trace_id": "t1",
        "total_latency_ms": 5000,
        "total_cost_usd": 0.1,
        "spans": [
            {"span_id": "l1", "span_type": "llm_call",
             "metadata": {"user_prompt": "Q?", "completion": "A."}},
            {"span_id": "u1", "span_type": "tool_use",
             "metadata": {"tool_name": "web_search"}},
        ],
    }


def _config() -> EvalConfig:
    return EvalConfig(
        project="demo",
        metrics=[
            MetricConfig(name="latency_budget", type="deterministic",
                         applies_to="trace", max_latency_ms=15000, threshold=1.0),
            MetricConfig(name="tool_allowlist", type="deterministic",
                         applies_to="tool_use", allowed_tools=["web_search"],
                         threshold=1.0),
            MetricConfig(name="faithfulness", type="llm_judge",
                         applies_to="llm_call", rubric="r", threshold=0.7),
        ],
    )


def test_evaluate_trace_produces_one_result_per_metric():
    runner = EvalRunner(_config(), judge_client=_judge_client(0.9))
    results = runner.evaluate_trace(_trace())
    names = {r.metric_name for r in results}
    assert names == {"latency_budget", "tool_allowlist", "faithfulness"}


def test_passed_flag_uses_threshold():
    runner = EvalRunner(_config(), judge_client=_judge_client(0.5))  # < 0.7 threshold
    results = {r.metric_name: r for r in runner.evaluate_trace(_trace())}
    assert results["faithfulness"].passed is False
    assert results["latency_budget"].passed is True


def test_security_metric_is_evaluated():
    cfg = EvalConfig(
        project="demo",
        metrics=[
            MetricConfig(
                name="injection", type="security", applies_to="llm_call",
                security_check="injection_resistance", detection_mode="heuristic",
            ),
            MetricConfig(
                name="latency_budget", type="deterministic", applies_to="trace",
                max_latency_ms=15000, threshold=1.0,
            ),
        ],
    )
    runner = EvalRunner(cfg, judge_client=_judge_client(1.0))
    results = {r.metric_name: r for r in runner.evaluate_trace(_trace())}
    assert set(results) == {"injection", "latency_budget"}
    # Clean trace (no injection signatures) → resistant → passes.
    assert results["injection"].passed is True


def test_composite_runs_after_base_metrics():
    cfg = EvalConfig(
        project="demo",
        metrics=[
            MetricConfig(name="faithfulness", type="llm_judge", applies_to="llm_call",
                         rubric="r", threshold=0.7),
            MetricConfig(name="overall", type="composite", applies_to="trace",
                         weights={"faithfulness": 1.0}, threshold=0.5),
        ],
    )
    runner = EvalRunner(cfg, judge_client=_judge_client(0.8))
    results = {r.metric_name: r for r in runner.evaluate_trace(_trace())}
    assert abs(results["overall"].score - 0.8) < 1e-9


def test_batch_report_aggregates_summary():
    runner = EvalRunner(_config(), judge_client=_judge_client(0.9))
    report = runner.evaluate_batch([_trace(), _trace()])
    assert report.evaluated_traces == 2
    assert report.overall_passed is True
    assert "faithfulness" in report.summary
    assert report.summary["faithfulness"]["count"] == 2


def test_batch_report_flags_failures():
    runner = EvalRunner(_config(), judge_client=_judge_client(0.1))  # faithfulness fails
    report = runner.evaluate_batch([_trace()])
    assert report.overall_passed is False
    assert "faithfulness" in report.failed_metrics


def test_evaluate_batch_rejects_empty_trace_list():
    runner = EvalRunner(_config(), judge_client=_judge_client(0.9))
    with pytest.raises(ValueError, match="at least one trace"):
        runner.evaluate_batch([])
