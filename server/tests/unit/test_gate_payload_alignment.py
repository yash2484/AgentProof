"""The dashboard's verdict must match the CI gate's on the same data.

These are the same detector, so the only way they can disagree is if one of
them is handed less information than the other. Before this, ``_gate_payload``
received bare score lists and a global config, so it ran an unpaired comparison
against a global noise floor while the CLI ran a paired one against per-metric
floors. On the 2026-08-11 degradation that is the difference between PASS and
FAIL on the same commit.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from agentproof_server.api.analytics import _gate_payload
from agentproof_server.eval_engine.models import Baseline
from agentproof_server.eval_engine.pairing import (
    PAIR_KEY_TAG,
    pair_keys,
    scores_by_key,
)

REAL_FAITHFULNESS = [
    0.95, 1.0, 0.95, 0.99, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 0.2, 0.95, 0.85,
]
KEYS = [f"scenario-{i:02d}" for i in range(len(REAL_FAITHFULNESS))]


def _baselines() -> dict[str, Baseline]:
    arr = np.asarray(REAL_FAITHFULNESS, dtype=float)
    return {
        "faithfulness": Baseline(
            project="demo",
            metric_name="faithfulness",
            scores=REAL_FAITHFULNESS,
            scores_by_key=dict(zip(KEYS, REAL_FAITHFULNESS, strict=True)),
            mean=float(arr.mean()),
            std=float(arr.std(ddof=1)),
            sample_size=len(REAL_FAITHFULNESS),
            created_at=datetime.now(UTC),
        )
    }


def _degraded() -> dict[str, float]:
    """Five scenarios degrade, eight untouched — the measured regression shape."""
    deltas = [0.0, 0.0, 0.28, 0.28, 0.28, 0.28, 0.28, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    return {
        k: max(0.0, b - d)
        for k, b, d in zip(KEYS, REAL_FAITHFULNESS, deltas, strict=True)
    }


def test_identity_reaches_the_detector_and_changes_the_verdict():
    keyed = _degraded()
    scores = list(keyed.values())

    without = _gate_payload(_baselines(), {"faithfulness": scores})[0]
    with_identity = _gate_payload(
        _baselines(),
        {"faithfulness": scores},
        keyed_by_metric={"faithfulness": keyed},
    )[0]

    assert without["method"] == "welch"
    assert without["is_regression"] is False, "precondition: unpaired misses it"
    assert with_identity["method"] == "paired"
    assert with_identity["is_regression"] is True, "the dashboard must agree with CI"
    assert with_identity["paired_n"] == 13


def test_per_metric_floor_is_applied():
    """A metric noisier than the global floor sets its own; the endpoint must
    honour it or it will report regressions the gate does not."""
    keyed = {k: max(0.0, b - 0.08) for k, b in zip(KEYS, REAL_FAITHFULNESS, strict=True)}
    args = (_baselines(), {"faithfulness": list(keyed.values())})
    kwargs = {"keyed_by_metric": {"faithfulness": keyed}}

    default_floor = _gate_payload(*args, **kwargs)[0]
    raised_floor = _gate_payload(*args, **kwargs, floors={"faithfulness": 0.15})[0]

    assert default_floor["is_regression"] is True
    assert raised_floor["is_regression"] is False
    assert "practical floor" in raised_floor["reason"]


def test_unpairable_metrics_still_get_a_verdict():
    """Falling back must not drop the metric off the card.

    Scores are varied rather than constant: a constant candidate sends the
    Welch fallback down a degenerate-variance path and would test scipy's
    tolerance for identical data instead of the fallback itself.
    """
    scores = [0.9, 0.7, 0.8, 0.95, 0.6, 0.85, 0.75, 0.9, 0.65, 0.8, 0.7, 0.9, 0.85]
    row = _gate_payload(_baselines(), {"faithfulness": scores})[0]
    assert row["comparable"] is True
    assert row["method"] in {"welch", "floor"}


def test_metric_without_candidate_scores_reports_shape_consistently():
    row = _gate_payload(_baselines(), {})[0]
    assert row["comparable"] is False
    assert row["method"] is None
    assert row["paired_n"] is None


def test_one_untagged_trace_forfeits_pairing_for_every_metric():
    """The endpoint applies the CLI's corpus-wide rule, not a per-metric one.

    The endpoint used to decide eligibility from eval rows, so an untagged
    trace only cost pairing for the metrics it happened to score. Metrics have
    different ``applies_to`` targets, so a trace with no tool_use span produces
    no ``tool_allowlist`` row at all -- and that metric stayed paired here while
    the CLI unpaired the whole corpus. Same commit, two verdicts.
    """
    rows = [
        ("faithfulness", str(i), 0.9) for i in range(len(KEYS))
    ] + [
        # This metric never scored the untagged trace, so a per-metric rule
        # would leave it eligible.
        ("tool_allowlist", str(i), 1.0) for i in range(len(KEYS) - 1)
    ]
    tagged = [
        {"trace_id": str(i), "tags": {PAIR_KEY_TAG: k}}
        for i, k in enumerate(KEYS)
    ]
    untagged = [dict(t) for t in tagged]
    untagged[-1]["tags"] = {}

    assert scores_by_key(rows, pair_keys(tagged)).keys() == {
        "faithfulness",
        "tool_allowlist",
    }
    assert scores_by_key(rows, pair_keys(untagged)) == {}
