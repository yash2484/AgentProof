"""'We looked and it is fine' must not read the same as 'we could not tell'.

On 2026-08-11 the gate reported this and passed the build:

    [ok] faithfulness  baseline=0.911 candidate=0.802
                       p=0.0939 >= alpha=0.05, d=0.532 >= 0.5

The drop was real and the effect size cleared. Only significance failed, at
n=13. That verdict printed identically to metrics that had not moved at all, so
the one line in the report that deserved a second look was the least visible
thing in it.

A warning is not a third severity. It is the honest name for a specific state:
the movement looks material, and the sample cannot confirm it.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

REAL_FAITHFULNESS = [
    0.95, 1.0, 0.95, 0.99, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 0.2, 0.95, 0.85,
]
KEYS = [f"scenario-{i:02d}" for i in range(len(REAL_FAITHFULNESS))]


def _baseline(scores: list[float], *, keyed: bool = False) -> Baseline:
    arr = np.asarray(scores, dtype=float)
    return Baseline(
        project="demo",
        metric_name="faithfulness",
        scores=scores,
        scores_by_key=dict(zip(KEYS, scores, strict=True)) if keyed else None,
        mean=float(arr.mean()),
        std=float(arr.std(ddof=1)),
        sample_size=len(scores),
        created_at=datetime.now(UTC),
    )


def test_the_2026_08_11_verdict_is_now_a_warning():
    """The exact case that bit us: effect cleared, significance did not."""
    cand = [max(0.0, b - 0.109) for b in REAL_FAITHFULNESS]
    res = detect_regression(_baseline(REAL_FAITHFULNESS), cand, RegressionConfig())

    assert res.is_regression is False, "still must not block; the evidence is weak"
    assert res.is_warning is True, "but it must not read as 'fine' either"
    assert res.cohens_d is not None and res.cohens_d >= 0.5
    assert res.p_value is not None and res.p_value >= 0.05


def test_a_metric_that_did_not_move_is_not_a_warning():
    """The distinction only means something if the quiet case stays quiet."""
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS), list(REAL_FAITHFULNESS), RegressionConfig()
    )
    assert res.is_regression is False
    assert res.is_warning is False


def test_a_blocked_regression_is_not_also_a_warning():
    """Warning and regression are exclusive; a blocked metric is not 'unclear'."""
    deltas = [0.0, 0.0, 0.28, 0.28, 0.28, 0.28, 0.28, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    cand = {
        k: max(0.0, b - d)
        for k, b, d in zip(KEYS, REAL_FAITHFULNESS, deltas, strict=True)
    }
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.is_regression is True
    assert res.is_warning is False


def test_movement_below_the_practical_floor_is_not_a_warning():
    """Below the floor we are not 'unsure' — we have decided we do not care."""
    cand = [max(0.0, b - 0.01) for b in REAL_FAITHFULNESS]
    res = detect_regression(_baseline(REAL_FAITHFULNESS), cand, RegressionConfig())
    assert res.is_regression is False
    assert res.is_warning is False


def test_the_warning_explains_which_guard_bound_and_what_would_settle_it():
    """A warning nobody can act on is just a differently coloured pass."""
    cand = [max(0.0, b - 0.109) for b in REAL_FAITHFULNESS]
    res = detect_regression(_baseline(REAL_FAITHFULNESS), cand, RegressionConfig())

    reason = res.reason.lower()
    assert "underpowered" in reason or "not significant" in reason
    assert "sample" in reason or "n=" in reason


def test_paired_comparisons_can_warn_too():
    """The state is a property of the evidence, not of the comparison method."""
    # A drop concentrated enough to clear the practical floor, but spread so
    # unevenly across scenarios that d_z clears while the paired t-test cannot.
    deltas = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.42, 0.42, 0.0, 0.0, 0.0]
    cand = {
        k: max(0.0, b - d)
        for k, b, d in zip(KEYS, REAL_FAITHFULNESS, deltas, strict=True)
    }
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.method == "paired"
    assert res.is_regression is False
    # Either it warns, or d_z legitimately failed too — but it must never be
    # silently ok while sitting above the practical floor.
    assert res.is_warning or (
        res.cohens_dz is not None and res.cohens_dz < RegressionConfig().min_effect_size_paired
    )
