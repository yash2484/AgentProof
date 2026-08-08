# server/tests/unit/test_judge_fault_injection.py
"""Fault injection for the LLM judge. Requires a real API key.

test_fault_injection.py proves the deterministic and heuristic detectors fire.
It cannot cover the judge, because a judge needs a live model — so the judge
half of the gate had no evidence behind it at all.

These tests make two real judge calls: one against a grounded answer, one
against the same answer with a fabricated claim spliced in. They assert the
judge separates them, and that the resulting score is low enough for the
regression detector to act on.

Skipped without a key, so CI stays free and key-free. Run them in the nightly
or manual workflow, or locally with ANTHROPIC_API_KEY set (or in .env).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from agentproof_server.eval_engine.baseline import baselines_from_json
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.llm_judge import (
    LLMJudgeEvaluator,
    resolve_judge_api_key,
)
from agentproof_server.eval_engine.models import RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CONFIG = _REPO_ROOT / "agentproof.yaml"
_BASELINE = _REPO_ROOT / "baselines" / "demo-agent-replay.json"

pytestmark = pytest.mark.skipif(
    resolve_judge_api_key() is None,
    reason="needs a real ANTHROPIC_API_KEY (environment or .env)",
)

_SOURCE = (
    "Multi-agent systems coordinate work through orchestration, where a central "
    "planner assigns subtasks, and choreography, where agents react to shared "
    "events without a central controller."
)
_GROUNDED = (
    "Multi-agent systems coordinate through orchestration, where a central "
    "planner assigns subtasks, and through choreography, where agents react to "
    "shared events without a central controller."
)
# The same answer plus a specific, confident claim the source never makes.
# Modelled on the real hallucination the demo corpus caught: a fabrication
# introduced with the language of citation.
_FABRICATED = _GROUNDED + (
    " Based on the provided context, orchestration reduces end-to-end latency "
    "by 43% and is mandated by the ISO 24089 multi-agent standard."
)


def _trace(completion: str) -> dict:
    return {
        "trace_id": "judge-fault",
        "spans": [
            {
                "span_id": "r1",
                "span_type": "retrieval",
                "name": "retriever",
                "metadata": {
                    "query": "How do multi-agent systems coordinate?",
                    "sources": [{"doc_id": "doc-1", "text_preview": _SOURCE}],
                },
            },
            {
                "span_id": "w1",
                "span_type": "llm_call",
                "name": "writer",
                "metadata": {
                    "user_prompt": "How do multi-agent systems coordinate?",
                    "completion": completion,
                },
            },
        ],
    }


def _faithfulness_metric():
    config = load_config(str(_CONFIG))
    metric = next(m for m in config.metrics if m.name == "faithfulness")
    return metric, config.judge_model


def _score(completion: str) -> float:
    metric, judge_model = _faithfulness_metric()
    trace = _trace(completion)
    spans = [s for s in trace["spans"] if s["span_type"] == "llm_call"]
    return LLMJudgeEvaluator(metric, judge_model).evaluate(trace, spans).value


@pytest.fixture(scope="module")
def scores() -> dict[str, float]:
    """Two real judge calls, shared by every test in this module."""
    return {"grounded": _score(_GROUNDED), "fabricated": _score(_FABRICATED)}


def test_judge_accepts_a_grounded_answer(scores):
    metric, _ = _faithfulness_metric()
    assert scores["grounded"] >= metric.threshold, (
        f"judge scored a fully grounded answer {scores['grounded']:.2f}, below "
        f"its own threshold {metric.threshold} — the judge is too harsh to be useful"
    )


def test_judge_catches_a_fabricated_claim(scores):
    metric, _ = _faithfulness_metric()
    assert scores["fabricated"] < metric.threshold, (
        f"judge scored a fabricated statistic and a made-up ISO standard "
        f"{scores['fabricated']:.2f}, at or above threshold {metric.threshold}"
    )


def test_the_gap_is_material_not_marginal(scores):
    """A judge that separates them by 0.02 is not usable as a gate.

    Judges are nondeterministic, so this asserts a wide margin rather than
    exact values — a narrow gap would be indistinguishable from run-to-run noise.
    """
    gap = scores["grounded"] - scores["fabricated"]
    assert gap >= 0.3, (
        f"grounded {scores['grounded']:.2f} vs fabricated "
        f"{scores['fabricated']:.2f} — gap {gap:.2f} is within judge noise"
    )


def test_a_fabricating_agent_trips_the_regression_gate(scores):
    """End to end: a real judge score, fed to the real detector, fires.

    Every trace carries the fabricated answer, which is the unambiguous case.
    The sensitivity sweep in test_detector_sensitivity.py characterises where
    the threshold actually sits for a deterministic metric.
    """
    baseline = baselines_from_json(_BASELINE.read_text(encoding="utf-8"))[
        "faithfulness"
    ]
    candidate = [scores["fabricated"]] * baseline.sample_size

    result = detect_regression(baseline, candidate, RegressionConfig())

    assert result.is_regression is True, result.reason
