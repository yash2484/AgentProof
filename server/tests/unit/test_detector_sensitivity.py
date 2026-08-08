# server/tests/unit/test_detector_sensitivity.py
"""How small a regression does the gate actually catch?

Fault injection proves the gate fires. It does not say how *sensitive* it is,
and sensitivity is the interesting property: breaking 8 traces out of 12 is a
sledgehammer no detector could miss, while a real regression is one bad run in
twenty.

This sweeps the fault from 1 broken trace up to all 12 and records where the
verdict flips. That yields a characteristic of the detector -- "it catches a
k-in-12 degradation" -- rather than a boolean. The threshold is asserted so a
change in tuning that makes the gate quietly deafer fails here.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from agentproof_server.eval_engine.baseline import baselines_from_json
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.models import RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression
from agentproof_server.eval_engine.runner import EvalRunner

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CORPUS = _REPO_ROOT / "fixtures" / "regression_corpus.json"
_BASELINE = _REPO_ROOT / "baselines" / "demo-research-agent.json"
_CONFIG = _REPO_ROOT / "fixtures" / "regression_config.yaml"

_METRIC = "data_exfiltration"
_LEAK = "Contact Jane Doe at jane.doe@example.com, SSN 123-45-6789."


def _load_corpus() -> list[dict]:
    data = json.loads(_CORPUS.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data["traces"]


def _break_n(traces: list[dict], n: int) -> list[dict]:
    for trace in traces[:n]:
        for span in trace["spans"]:
            if span.get("span_type") == "llm_call":
                span["metadata"]["completion"] = _LEAK
    return traces


def _verdict_after_breaking(n: int):
    """Return the RegressionResult for the metric after breaking n traces."""
    config = load_config(str(_CONFIG))
    traces = _break_n(_load_corpus(), n)
    report = EvalRunner(config).evaluate_batch(traces)
    scores = [r.score for r in report.results if r.metric_name == _METRIC]

    baseline = baselines_from_json(_BASELINE.read_text(encoding="utf-8"))[_METRIC]
    return detect_regression(baseline, scores, RegressionConfig())


def test_sweep_finds_the_detection_threshold(capsys):
    """Record where the verdict flips, and pin it."""
    flipped_at = None
    rows = []
    for n in range(0, 13):
        result = _verdict_after_breaking(n)
        rows.append((n, result.candidate_mean, result.is_regression, result.reason))
        if result.is_regression and flipped_at is None:
            flipped_at = n

    # Printed so `pytest -s` doubles as the report.
    with capsys.disabled():
        print(f"\nDetector sensitivity — metric: {_METRIC}, corpus: 12 traces")
        print(f"{'broken':>7}{'candidate mean':>17}{'verdict':>14}   reason")
        for n, mean, is_reg, reason in rows:
            verdict = "REGRESSION" if is_reg else "ok"
            print(f"{n:>7}{mean:>17.3f}{verdict:>14}   {reason}")
        print(f"\nFires from {flipped_at} broken trace(s) of 12.\n")

    # Monotonic: once it fires, more damage must not un-fire it.
    seen = [is_reg for _, _, is_reg, _ in rows]
    assert seen == sorted(seen), f"non-monotonic detection: {seen}"

    # The pinned characteristic, and it is a *measured* number rather than a
    # target: the sweep says 4 of 12 (a 33% degradation). Pinning it means a
    # future change that makes the gate deafer fails here instead of passing
    # unnoticed. Tightening it is a deliberate act with a new measurement.
    assert flipped_at is not None, "gate never fired, even with every trace broken"
    assert flipped_at <= 4, f"gate needs {flipped_at}/12 broken traces — deafer than measured"


def test_a_single_broken_trace_is_not_yet_a_regression():
    """The other half of sensitivity: it must not fire on noise.

    One bad run in twelve is within normal variation for most agents. A gate
    that flags it would cry wolf and get switched off, which is the real
    failure mode for a CI gate.
    """
    assert _verdict_after_breaking(1).is_regression is False


@pytest.mark.parametrize("n", [6, 9, 12])
def test_large_degradations_are_always_caught(n):
    assert _verdict_after_breaking(n).is_regression is True
