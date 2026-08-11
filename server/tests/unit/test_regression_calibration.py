"""Calibration: what size of regression can this gate actually see?

A gate has a minimum detectable effect whether or not anyone measured it. On
2026-08-11 an 11-point faithfulness drop was deliberately introduced into the
demo agent and the gate passed it — not because the detector misbehaved, but
because nobody had ever written down how small a regression it could resolve.

These tests write it down and enforce it. They are not testing statistics; they
are pinning the *sensitivity* of a shipped product so it cannot drift silently.
If a threshold changes, the documented floor here changes with it, in a diff
someone has to read.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pytest
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

# The real pinned faithfulness distribution from baselines/demo-agent-replay.json.
# Kept verbatim: calibration against a synthetic distribution would measure a
# fiction. 88.8% of its squared deviation is the single 0.20.
REAL_FAITHFULNESS = [
    0.95, 1.0, 0.95, 0.99, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 0.2, 0.95, 0.85,
]
KEYS = [f"scenario-{i:02d}" for i in range(len(REAL_FAITHFULNESS))]

# Documented floors. These are measurements, not aspirations.
UNPAIRED_MIN_DETECTABLE_DROP = 0.146
PAIRED_MIN_DETECTABLE_DROP = 0.05
MEASURED_DEMO_DROP = 0.109  # what the 2026-08-11 degradation actually produced


def _baseline(*, keyed: bool) -> Baseline:
    arr = np.asarray(REAL_FAITHFULNESS, dtype=float)
    return Baseline(
        project="demo",
        metric_name="faithfulness",
        scores=REAL_FAITHFULNESS,
        scores_by_key=dict(zip(KEYS, REAL_FAITHFULNESS, strict=True)) if keyed else None,
        mean=float(arr.mean()),
        std=float(arr.std(ddof=1)),
        sample_size=len(REAL_FAITHFULNESS),
        created_at=datetime.now(UTC),
    )


def _shift(drop: float) -> dict[str, float]:
    """Every scenario drops by the same amount — the cleanest possible signal."""
    return {
        k: max(0.0, b - drop)
        for k, b in zip(KEYS, REAL_FAITHFULNESS, strict=True)
    }


def _fires(drop: float, *, paired: bool) -> bool:
    cand = _shift(drop)
    return detect_regression(
        _baseline(keyed=paired),
        list(cand.values()),
        RegressionConfig(),
        candidate_by_key=cand if paired else None,
    ).is_regression


def _smallest_detectable(*, paired: bool) -> float:
    """Smallest uniform drop this gate resolves, to the nearest 0.001."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if _fires(mid, paired=paired):
            hi = mid
        else:
            lo = mid
    return round(hi, 3)


# --- must catch -----------------------------------------------------------

def test_unpaired_catches_a_drop_above_its_floor():
    assert _fires(UNPAIRED_MIN_DETECTABLE_DROP + 0.02, paired=False) is True


def test_paired_catches_a_drop_above_its_floor():
    assert _fires(PAIRED_MIN_DETECTABLE_DROP + 0.02, paired=True) is True


# --- must not catch (restraint) -------------------------------------------

@pytest.mark.parametrize("drop", [0.0, 0.005, 0.02])
def test_neither_method_fires_on_noise_scale_movement(drop: float):
    """A gate that fires on 2-point movement gets switched off within a month."""
    assert _fires(drop, paired=False) is False
    assert _fires(drop, paired=True) is False


# --- the floors themselves ------------------------------------------------

def test_unpaired_floor_is_where_we_documented_it():
    measured = _smallest_detectable(paired=False)
    assert measured == pytest.approx(UNPAIRED_MIN_DETECTABLE_DROP, abs=0.005), (
        f"The unpaired gate's minimum detectable drop moved to {measured}. "
        f"If this was intentional, update UNPAIRED_MIN_DETECTABLE_DROP and the "
        f"README's stated sensitivity in the same commit."
    )


def test_paired_floor_is_where_we_documented_it():
    measured = _smallest_detectable(paired=True)
    assert measured == pytest.approx(PAIRED_MIN_DETECTABLE_DROP, abs=0.005), (
        f"The paired gate's minimum detectable drop moved to {measured}. "
        f"If this was intentional, update PAIRED_MIN_DETECTABLE_DROP and the "
        f"README's stated sensitivity in the same commit."
    )


def test_pairing_is_what_closed_the_gap_on_the_real_regression():
    """The 2026-08-11 finding, encoded so it cannot regress back.

    A drop of 0.109 sits below the unpaired floor and above the paired one.
    That single fact is the whole reason the detector changed.
    """
    assert UNPAIRED_MIN_DETECTABLE_DROP > MEASURED_DEMO_DROP, (
        "the unpaired gate was blind to the measured degradation"
    )
    assert PAIRED_MIN_DETECTABLE_DROP < MEASURED_DEMO_DROP, (
        "pairing must resolve what the unpaired path could not"
    )
    assert _fires(MEASURED_DEMO_DROP, paired=False) is False
    assert _fires(MEASURED_DEMO_DROP, paired=True) is True
