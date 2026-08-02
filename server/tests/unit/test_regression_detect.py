"""Unit tests for the detect_regression decision rule."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression


def _baseline(scores: list[float]) -> Baseline:
    import numpy as np

    arr = np.asarray(scores, dtype=float)
    return Baseline(
        project="demo", metric_name="m", scores=scores,
        mean=float(arr.mean()),
        std=float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
        sample_size=len(scores), created_at=datetime.now(UTC),
    )


def test_no_drop_is_not_regression():
    base = _baseline([0.8, 0.9, 0.85, 0.88, 0.82])
    res = detect_regression(base, [0.9, 0.95, 0.92, 0.91, 0.93], RegressionConfig())
    assert res.is_regression is False
    assert "No drop" in res.reason


def test_significant_large_drop_is_regression():
    # n=10 per group: at or above min_sample_size, so this exercises the
    # t-test path rather than the small-sample absolute-drop floor.
    base = _baseline([1.0, 1.0, 0.9, 1.0, 0.95, 1.0, 0.92, 1.0, 0.97, 0.93])
    cand = [0.2, 0.3, 0.1, 0.25, 0.2, 0.15, 0.3, 0.2, 0.22, 0.28]
    res = detect_regression(base, cand, RegressionConfig())
    assert res.is_regression is True
    assert res.p_value is not None and res.p_value < 0.05
    assert res.cohens_d is not None and res.cohens_d >= 0.5


def test_trivial_drop_blocked_by_effect_size_guard():
    # Large N, high variance, small mean drop (0.05): the t-test is significant
    # but Cohen's d < 0.5, so the effect-size guard blocks it. (A tiny-variance
    # fixture would make even a 0.01 drop a LARGE effect -- d depends on spread.)
    base = _baseline([0.2, 0.4, 0.6, 0.8] * 100)   # mean 0.50, sd ~0.224
    cand = [0.15, 0.35, 0.55, 0.75] * 100          # mean 0.45 (0.05 drop)
    res = detect_regression(base, cand, RegressionConfig())
    assert res.p_value is not None and res.p_value < 0.05   # significant
    assert res.cohens_d is not None and res.cohens_d < 0.5  # but small effect
    assert res.is_regression is False                       # blocked by guard


def test_zero_variance_uses_absolute_floor():
    base = _baseline([1.0, 1.0, 1.0, 1.0])
    # Candidate is also constant at a lower level -> both samples zero-variance
    # -> Welch's t-test is undefined -> the absolute-drop floor decides.
    res = detect_regression(base, [0.5, 0.5, 0.5, 0.5], RegressionConfig())
    assert res.is_regression is True  # 0.5 drop >= min_mean_drop 0.05
    assert "absolute-drop floor" in res.reason


def test_small_sample_uses_absolute_floor_below_threshold():
    base = _baseline([1.0])  # sample_size 1 < min_sample_size
    res = detect_regression(base, [0.99], RegressionConfig())
    assert res.is_regression is False  # drop 0.01 < min_mean_drop 0.05


def test_small_sample_real_drop_is_caught_not_lost_to_low_power():
    """A one-in-three failure in a 3-trace corpus must be flagged.

    Regression guard: with min_sample_size=2 this took the t-test path, where
    Welch on n=3 yields p=0.21 for a 33% drop -- so a real, reproducible
    security regression passed CI with exit 0. Below the power threshold the
    absolute-drop floor decides instead.
    """
    base = _baseline([1.0, 1.0, 1.0])
    res = detect_regression(base, [1.0, 1.0, 0.0], RegressionConfig())
    assert res.is_regression is True
    assert "absolute-drop floor" in res.reason


def test_powered_sample_still_uses_the_t_test():
    """At or above the threshold the statistical path must stay in force --
    the floor is a small-sample fallback, not a replacement for the test."""
    base = _baseline([1.0, 0.9] * 6)   # n=12, real variance
    res = detect_regression(base, [0.95, 0.85] * 6, RegressionConfig())
    assert res.p_value is not None, "expected the t-test path, not the floor"
    assert "absolute-drop floor" not in res.reason
