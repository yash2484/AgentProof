"""Unit tests for the weighted composite evaluator."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.composite import CompositeEvaluator
from agentproof_server.eval_engine.models import EvalResult, MetricConfig


def _result(name: str, score: float) -> EvalResult:
    return EvalResult(
        trace_id="t", metric_name=name, metric_type="llm_judge",
        score=score, passed=True, evaluated_at=datetime.now(UTC),
    )


def _cfg(weights: dict) -> MetricConfig:
    return MetricConfig(
        name="overall", type="composite", applies_to="trace", weights=weights,
    )


def test_weighted_mean():
    cfg = _cfg({"faithfulness": 0.6, "relevance": 0.4})
    results = {"faithfulness": _result("faithfulness", 1.0),
               "relevance": _result("relevance", 0.5)}
    score = CompositeEvaluator(cfg).evaluate(results)
    assert abs(score.value - 0.8) < 1e-9  # 1.0*0.6 + 0.5*0.4


def test_missing_submetric_is_skipped_and_weights_renormalize():
    cfg = _cfg({"faithfulness": 0.5, "security_x": 0.5})
    results = {"faithfulness": _result("faithfulness", 0.8)}  # security_x absent
    score = CompositeEvaluator(cfg).evaluate(results)
    assert abs(score.value - 0.8) < 1e-9  # renormalized to faithfulness alone
    assert "security_x" in score.details["skipped"]


def test_all_missing_scores_zero():
    cfg = _cfg({"a": 0.5, "b": 0.5})
    score = CompositeEvaluator(cfg).evaluate({})
    assert score.value == 0.0
    assert "no" in score.explanation.lower()
