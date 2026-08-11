"""Paired regression detection.

The unpaired Welch path treats N per-scenario scores as N samples of one
distribution, so its noise model is *between-scenario difficulty* rather than
measurement noise. On the demo corpus that is catastrophic: 88.8% of the
baseline's squared deviation comes from a single hard scenario scoring 0.20,
which puts sigma at 0.218 while the measured run-to-run variance of the
unmodified agent is 0.008.

Pairing removes that term. Each scenario is its own control, so intrinsic
difficulty cancels and what remains is the change.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

# The real pinned faithfulness distribution from baselines/demo-agent-replay.json.
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
        std=float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
        sample_size=len(scores),
        created_at=datetime.now(UTC),
    )


def _candidate(deltas: list[float]) -> dict[str, float]:
    """Baseline minus a per-scenario drop, clamped to [0, 1]."""
    return {
        k: max(0.0, min(1.0, b - d))
        for k, b, d in zip(KEYS, REAL_FAITHFULNESS, deltas, strict=True)
    }


def test_pairs_when_both_sides_carry_keys():
    base = _baseline(REAL_FAITHFULNESS, keyed=True)
    cand = _candidate([0.0] * 13)
    res = detect_regression(
        base, list(cand.values()), RegressionConfig(), candidate_by_key=cand
    )
    assert res.method == "paired"
    assert res.paired_n == 13


def test_falls_back_to_welch_when_baseline_has_no_keys():
    """An old unkeyed baseline must keep working, not crash or silently mispair."""
    base = _baseline(REAL_FAITHFULNESS, keyed=False)
    cand = _candidate([0.3] * 13)
    res = detect_regression(
        base, list(cand.values()), RegressionConfig(), candidate_by_key=cand
    )
    assert res.method == "welch"
    assert res.paired_n is None


def test_falls_back_when_key_overlap_is_too_small():
    """Renamed scenarios must not silently pair on whatever happens to match."""
    base = _baseline(REAL_FAITHFULNESS, keyed=True)
    # Varied, not constant: a constant sample would send the Welch fallback
    # down a degenerate-variance path and test something other than key overlap.
    cand = {
        f"renamed-{i:02d}": v
        for i, v in enumerate([0.9, 0.7, 0.8, 0.95, 0.6, 0.85, 0.75, 0.9,
                               0.65, 0.8, 0.7, 0.9, 0.85])
    }
    res = detect_regression(
        base, list(cand.values()), RegressionConfig(), candidate_by_key=cand
    )
    assert res.method == "welch"


def test_paired_catches_the_drop_that_unpaired_misses():
    """The measured failure: a real 0.109 mean drop the Welch path let through.

    Five scenarios degrade materially, eight are untouched — the shape a
    groundedness regression actually takes.
    """
    deltas = [0.0, 0.0, 0.28, 0.28, 0.28, 0.28, 0.28, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    cand = _candidate(deltas)
    scores = list(cand.values())
    cfg = RegressionConfig()

    unpaired = detect_regression(_baseline(REAL_FAITHFULNESS), scores, cfg)
    paired = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True), scores, cfg, candidate_by_key=cand
    )

    assert unpaired.is_regression is False, "precondition: Welch misses this"
    assert paired.is_regression is True, "pairing must catch it"
    assert paired.p_value is not None and paired.p_value < cfg.alpha


def test_paired_refuses_measured_judge_noise():
    """The over-firing guard, and the reason pairing needs a practical floor.

    Pairing drops the noise floor to roughly the 0.008 measured between two
    identical runs. Without a practical-significance floor, a paired test at
    n=13 would call that significant. Jitter here is symmetric and fixed, so
    the mean delta is negligible but individual scenarios move.
    """
    jitter = [0.02, -0.02, 0.01, -0.01, 0.02, -0.02, 0.01, -0.01, 0.0, 0.0, 0.01, -0.01, 0.0]
    cand = _candidate(jitter)
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.is_regression is False
    assert res.method == "paired"


def test_paired_rejects_a_single_scenario_collapse():
    """One scenario cratering is not a systemwide regression.

    This is the paired analogue of the outlier problem that broke the unpaired
    path: without an effect-size guard on the deltas, a single catastrophic
    scenario would drag the whole verdict.
    """
    deltas = [0.0] * 12 + [1.0]
    cand = _candidate(deltas)
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.is_regression is False
    assert res.cohens_dz is not None and res.cohens_dz < RegressionConfig().min_effect_size_paired


def test_paired_catches_a_broad_consistent_drop():
    """Every scenario slipping by the same small amount is a real regression."""
    cand = _candidate([0.08] * 13)
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.is_regression is True


def test_paired_improvement_is_never_a_regression():
    cand = _candidate([-0.05] * 13)
    res = detect_regression(
        _baseline(REAL_FAITHFULNESS, keyed=True),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand,
    )
    assert res.is_regression is False
    assert "No drop" in res.reason
