# server/tests/unit/test_regression_models.py
"""Unit tests for the Phase-4 regression data models."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.models import (
    Baseline,
    RegressionConfig,
    RegressionReport,
    RegressionResult,
)


def test_regression_config_defaults():
    cfg = RegressionConfig()
    assert cfg.alpha == 0.05
    assert cfg.min_effect_size == 0.5
    assert cfg.min_mean_drop == 0.05
    assert cfg.min_sample_size == 2


def test_baseline_round_trips_through_json():
    b = Baseline(
        project="demo", metric_name="latency_budget",
        scores=[1.0, 1.0, 0.0], mean=0.6667, std=0.5774,
        sample_size=3, created_at=datetime.now(UTC),
    )
    restored = Baseline.model_validate_json(b.model_dump_json())
    assert restored.metric_name == "latency_budget"
    assert restored.scores == [1.0, 1.0, 0.0]
    assert restored.sample_size == 3


def test_regression_result_allows_none_stats():
    r = RegressionResult(
        metric_name="m", baseline_mean=1.0, candidate_mean=1.0, delta=0.0,
        t_statistic=None, p_value=None, cohens_d=None,
        is_regression=False, reason="no drop",
    )
    assert r.is_regression is False
    assert r.t_statistic is None


def test_regression_report_holds_results():
    rep = RegressionReport(
        results=[], regressed_metrics=[], passed=True, timestamp=datetime.now(UTC)
    )
    assert rep.passed is True
    assert rep.regressed_metrics == []
