# server/tests/unit/test_cli.py
"""Unit tests for CLI report formatting."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.cli import _has_blocking_failure, format_results
from agentproof_server.eval_engine.models import (
    EvalConfig,
    EvalResult,
    MetricConfig,
    MetricType,
)


def _r(name, score, passed, threshold=0.7):
    return EvalResult(
        trace_id="t1", metric_name=name, metric_type="deterministic",
        score=score, passed=passed, threshold=threshold,
        evaluated_at=datetime.now(UTC),
    )


def _make_config(ci_block: bool) -> EvalConfig:
    return EvalConfig(
        project="test",
        metrics=[
            MetricConfig(
                name="faithfulness", type=MetricType.LLM_JUDGE,
                applies_to="llm_call", rubric="r", ci_block=ci_block,
            )
        ],
    )


def test_format_results_contains_each_metric_and_verdict():
    out = format_results("t1", [_r("latency_budget", 1.0, True),
                                _r("faithfulness", 0.4, False)])
    assert "latency_budget" in out
    assert "faithfulness" in out
    assert "PASS" in out
    assert "FAIL" in out
    assert "t1" in out


def test_format_results_handles_empty():
    out = format_results("t1", [])
    assert "no results" in out.lower()


def test_has_blocking_failure_true_when_ci_block_metric_fails():
    assert _has_blocking_failure(
        [_r("faithfulness", 0.3, False)], _make_config(ci_block=True)
    ) is True


def test_has_blocking_failure_ignores_non_ci_block_failures():
    assert _has_blocking_failure(
        [_r("faithfulness", 0.3, False)], _make_config(ci_block=False)
    ) is False


def test_has_blocking_failure_false_when_all_pass():
    assert _has_blocking_failure(
        [_r("faithfulness", 1.0, True)], _make_config(ci_block=True)
    ) is False
