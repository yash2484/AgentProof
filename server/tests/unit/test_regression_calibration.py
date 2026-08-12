"""Calibration: what size of regression can this gate actually see?

A gate has a minimum detectable effect whether or not anyone measured it. On
2026-08-11 an 11-point faithfulness drop was deliberately introduced into the
demo agent and the gate passed it — not because the detector misbehaved, but
because nobody had ever written down how small a regression it could resolve.

These tests write it down and enforce it. They are not testing statistics; they
are pinning the *sensitivity* of a shipped product so it cannot drift silently.

The distribution is read from the shipped baseline rather than copied into this
file. An earlier version hardcoded a snapshot and described it as "the real
pinned distribution". The baseline was then re-pinned, the snapshot went stale,
and the tests kept passing because they were self-consistent with their own
copy — the exact drift they exist to prevent, occurring inside the detector for
it. Sensitivity is a property of the detector *and* the baseline it compares
against, so re-pinning is allowed to move these floors, and is required to say
so in a diff.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

BASELINE_FILE = Path(__file__).resolve().parents[3] / "baselines" / "demo-agent-replay.json"

# Documented floors, measured against the baseline above. These are
# measurements, not aspirations. If a threshold or the baseline changes, the
# assertions below fail until these are updated in the same commit.
UNPAIRED_MIN_DETECTABLE_DROP = 0.116
PAIRED_MIN_DETECTABLE_DROP = 0.050

# What the 2026-08-11 degradation actually produced, measured under the
# baseline pinned at the time. Kept as a fixed historical figure: it is the
# reason the detector changed, and it does not move when the baseline is
# re-pinned.
MEASURED_DEMO_DROP = 0.109


def _pinned() -> tuple[list[str], list[float], dict]:
    raw = {
        b["metric_name"]: b
        for b in json.loads(BASELINE_FILE.read_text(encoding="utf-8"))["baselines"]
    }["faithfulness"]
    keys = sorted(raw["scores_by_key"])
    return keys, [raw["scores_by_key"][k] for k in keys], raw


KEYS, SCORES, RAW = _pinned()


def _baseline(*, keyed: bool) -> Baseline:
    return Baseline(
        project=RAW["project"],
        metric_name="faithfulness",
        scores=SCORES,
        scores_by_key=dict(zip(KEYS, SCORES, strict=True)) if keyed else None,
        mean=RAW["mean"],
        std=RAW["std"],
        sample_size=len(SCORES),
        created_at=datetime.now(UTC),
    )


def _shift(drop: float) -> dict[str, float]:
    """Every scenario drops by the same amount — the cleanest possible signal."""
    return {k: max(0.0, b - drop) for k, b in zip(KEYS, SCORES, strict=True)}


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


# --- the baseline this is calibrated against -------------------------------

def test_the_pinned_baseline_supports_pairing():
    """Without per-scenario identity the paired floor below is unreachable."""
    assert RAW.get("scores_by_key"), (
        "the pinned baseline carries no per-scenario scores, so the gate can "
        "only run the less sensitive unpaired comparison"
    )
    assert len(RAW["scores_by_key"]) == RAW["sample_size"]


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
        f"A threshold change or a re-pinned baseline can both do this. If it "
        f"was intended, update UNPAIRED_MIN_DETECTABLE_DROP and the README's "
        f"stated sensitivity in the same commit."
    )


def test_paired_floor_is_where_we_documented_it():
    measured = _smallest_detectable(paired=True)
    assert measured == pytest.approx(PAIRED_MIN_DETECTABLE_DROP, abs=0.005), (
        f"The paired gate's minimum detectable drop moved to {measured}. "
        f"If this was intended, update PAIRED_MIN_DETECTABLE_DROP and the "
        f"README's stated sensitivity in the same commit."
    )


def test_pairing_is_what_closed_the_gap_on_the_real_regression():
    """The 2026-08-11 finding, encoded so it cannot regress back.

    The measured drop sits below the unpaired floor and above the paired one.
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
