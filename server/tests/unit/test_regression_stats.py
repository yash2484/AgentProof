"""Unit tests for the pure Welch's t-test and Cohen's d helpers."""

from __future__ import annotations

import math

from agentproof_server.eval_engine.regression import cohens_d, welch_t_test


def test_welch_detects_clear_drop():
    baseline = [1.0, 1.0, 1.0, 0.9, 1.0, 0.95, 1.0, 1.0]
    candidate = [0.2, 0.3, 0.1, 0.25, 0.2, 0.15, 0.3, 0.2]
    t, df, p = welch_t_test(baseline, candidate)
    assert t < 0  # candidate mean below baseline mean
    assert p < 0.01  # highly significant drop
    assert df > 0


def test_welch_no_drop_is_not_significant():
    baseline = [0.8, 0.9, 0.85, 0.88, 0.82]
    candidate = [0.86, 0.91, 0.84, 0.89, 0.83]
    _, _, p = welch_t_test(baseline, candidate)
    assert p > 0.05  # no significant drop


def test_welch_zero_variance_both_returns_nan_pvalue():
    t, df, p = welch_t_test([1.0, 1.0, 1.0], [1.0, 1.0, 1.0])
    assert math.isnan(p)


def test_cohens_d_positive_for_drop():
    baseline = [1.0, 1.0, 0.9, 1.0, 0.95]
    candidate = [0.2, 0.3, 0.1, 0.25, 0.2]
    assert cohens_d(baseline, candidate) > 0.8  # large effect


def test_cohens_d_zero_when_no_pooled_variance():
    assert cohens_d([1.0, 1.0], [1.0, 1.0]) == 0.0
