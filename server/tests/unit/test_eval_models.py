"""Unit tests for eval-engine Pydantic data models."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from agentproof_server.eval_engine.models import (
    BatchEvalReport,
    EvalConfig,
    EvalResult,
    EvalScore,
    MetricConfig,
    MetricType,
)
from pydantic import ValidationError


def test_metric_type_values():
    assert MetricType.DETERMINISTIC == "deterministic"
    assert MetricType.LLM_JUDGE == "llm_judge"
    assert MetricType.SECURITY == "security"
    assert MetricType.COMPOSITE == "composite"


def test_eval_score_defaults():
    score = EvalScore(value=0.8, explanation="ok")
    assert score.value == 0.8
    assert score.details is None
    assert score.raw_judge_output is None
    assert score.latency_ms is None


def test_metric_config_defaults():
    mc = MetricConfig(name="latency_budget", type="deterministic", applies_to="trace")
    assert mc.threshold == 0.7
    assert mc.regression_alert is True
    assert mc.ci_block is True
    assert mc.aggregation == "mean"
    assert mc.rubric is None


def test_metric_config_rejects_bad_aggregation():
    with pytest.raises(ValidationError):
        MetricConfig(
            name="x", type="llm_judge", applies_to="llm_call", aggregation="median"
        )


def test_eval_config_default_judge_model():
    cfg = EvalConfig(
        project="demo",
        metrics=[MetricConfig(name="m", type="deterministic", applies_to="trace")],
    )
    assert cfg.judge_model == "claude-sonnet-4-6"


def test_eval_result_passed_field_is_explicit():
    result = EvalResult(
        trace_id="t1",
        metric_name="latency_budget",
        metric_type="deterministic",
        score=1.0,
        threshold=1.0,
        passed=True,
        evaluated_at=datetime.now(UTC),
    )
    assert result.passed is True
    assert result.span_id is None


def test_batch_report_shape():
    report = BatchEvalReport(
        results=[],
        summary={},
        overall_passed=True,
        evaluated_traces=0,
        total_metrics=0,
        failed_metrics=[],
        timestamp=datetime.now(UTC),
    )
    assert report.overall_passed is True
    assert report.failed_metrics == []


def test_metric_config_security_fields():
    mc = MetricConfig(
        name="inj",
        type="security",
        applies_to="llm_call",
        security_check="injection_resistance",
        detection_mode="dual",
        dangerous_tools=["myshell"],
    )
    assert mc.security_check == "injection_resistance"
    assert mc.detection_mode == "dual"
    assert mc.dangerous_tools == ["myshell"]


def test_metric_config_security_fields_default_none():
    mc = MetricConfig(name="m", type="deterministic", applies_to="trace")
    assert mc.security_check is None
    assert mc.dangerous_tools is None
