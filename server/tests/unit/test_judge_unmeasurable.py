"""A failed judge call is unmeasured, not a score of zero.

This is the mirror of a defect the codebase already guards against. It is
careful that an *unmeasured* metric never renders as a **pass**; this file
covers the other direction, which is just as wrong for a gate: an unmeasured
metric must not render as a **failure** either.

Before this, any exception inside the judge — a 400 from an exhausted credit
balance, a rate limit, a network blip — returned 0.0 with an explanatory note.
Downstream, 0.0 is indistinguishable from "the agent collapsed": against a
0.908 pinned baseline it reads as a catastrophic uniform regression and fails
the build. An unpaid bill and a destroyed agent produced the same red check.

Found on 2026-08-14 by hitting it: a five-draw measurement run exhausted the
credit balance mid-flight, and draws 2 and 3 came back as neat tables of 0.00
that looked exactly like data.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from agentproof_server.eval_engine.models import (
    Baseline,
    EvalScore,
    MetricConfig,
    RegressionConfig,
)

# --- the evaluator marks, rather than scores, an unreachable judge -----------


class _Boom:
    """A judge client whose every call raises, as an exhausted balance does."""

    class messages:  # noqa: N801 - mirrors the SDK's attribute shape
        @staticmethod
        def parse(**_kwargs):
            raise RuntimeError("Error code: 400 - credit balance is too low")


class _Refuses:
    """A judge client that returns a refusal rather than raising."""

    class messages:  # noqa: N801
        @staticmethod
        def parse(**_kwargs):
            class _R:
                stop_reason = "refusal"
                parsed_output = None
                usage = None

            return _R()


def _metric(**over) -> MetricConfig:
    base = {
        "name": "faithfulness",
        "type": "llm_judge",
        "applies_to": "llm_call",
        "rubric": "Score groundedness.",
        "threshold": 0.7,
        "aggregation": "min",
    }
    base.update(over)
    return MetricConfig(**base)


def _trace() -> dict:
    return {
        "trace_id": "t1",
        "tags": {"scenario": "success"},
        "spans": [
            {
                "span_id": "s1",
                "name": "writer",
                "span_type": "llm_call",
                "metadata": {"user_prompt": "q", "completion": "an answer"},
            }
        ],
    }


def _spans(trace: dict) -> list[dict]:
    return trace["spans"]


@pytest.mark.parametrize("client", [_Boom(), _Refuses()], ids=["api-error", "refusal"])
def test_failed_judge_call_is_unmeasurable_not_zero(client):
    """The score is flagged unmeasurable; 0.0 must not stand in for a measurement."""
    from agentproof_server.eval_engine.llm_judge import LLMJudgeEvaluator

    ev = LLMJudgeEvaluator(_metric(), "claude-haiku-4-5", client=client)
    score = ev.evaluate(_trace(), _spans(_trace()))

    assert score.unmeasurable is True, (
        "a judge that could not be reached must mark the metric unmeasurable"
    )
    assert "could not be measured" in score.explanation.lower()


def test_successful_judge_call_is_measurable():
    """The happy path must not regress into being flagged."""
    from agentproof_server.eval_engine.llm_judge import LLMJudgeEvaluator

    class _Ok:
        class messages:  # noqa: N801
            @staticmethod
            def parse(**_kwargs):
                class _P:
                    reasoning = "grounded"
                    score = 0.95

                class _R:
                    stop_reason = "end_turn"
                    parsed_output = _P()
                    usage = None

                return _R()

    ev = LLMJudgeEvaluator(_metric(), "claude-haiku-4-5", client=_Ok())
    score = ev.evaluate(_trace(), _spans(_trace()))
    assert score.unmeasurable is False
    assert score.value == pytest.approx(0.95)


def test_partial_failure_taints_the_whole_metric():
    """One unreachable span makes the trace's score for that metric unusable.

    With ``aggregation: min`` a single failed span already decides the trace
    score, so a "score the ones that worked" policy would silently narrow what
    the number covers between runs — the same drift pairing exists to prevent.
    """
    from agentproof_server.eval_engine.llm_judge import LLMJudgeEvaluator

    calls = {"n": 0}

    class _FlakySecond:
        class messages:  # noqa: N801
            @staticmethod
            def parse(**_kwargs):
                calls["n"] += 1
                if calls["n"] == 2:
                    raise RuntimeError("rate limited")

                class _P:
                    reasoning = "fine"
                    score = 0.9

                class _R:
                    stop_reason = "end_turn"
                    parsed_output = _P()
                    usage = None

                return _R()

    trace = _trace()
    trace["spans"].append(
        {
            "span_id": "s2",
            "name": "synthesis",
            "span_type": "llm_call",
            "metadata": {"user_prompt": "q", "completion": "second answer"},
        }
    )

    ev = LLMJudgeEvaluator(
        _metric(span_names=["writer", "synthesis"]), "claude-haiku-4-5",
        client=_FlakySecond(),
    )
    score = ev.evaluate(trace, trace["spans"])
    assert score.unmeasurable is True


def test_evalscore_defaults_to_measurable():
    """Every non-judge evaluator keeps working without opting in."""
    assert EvalScore(value=1.0, explanation="deterministic").unmeasurable is False


# --- the detector refuses to read an unmeasured metric as a drop ------------


def _baseline(mean: float = 0.9) -> Baseline:
    keys = [f"s{i}" for i in range(13)]
    return Baseline(
        project="p",
        metric_name="faithfulness",
        scores=[mean] * 13,
        scores_by_key=dict.fromkeys(keys, mean),
        mean=mean,
        std=0.0,
        sample_size=13,
        created_at=datetime.now(UTC),
    )


def test_unmeasured_candidate_is_not_a_regression():
    """An all-unmeasurable run must not report a catastrophic drop.

    This is the exact shape of the 2026-08-14 incident: every judge call 400s,
    every score lands at 0.0, and a 0.9-baseline metric reads as a total
    collapse. The verdict must be "could not measure", never "regressed".
    """
    from agentproof_server.eval_engine.regression import detect_regression

    baseline = _baseline()
    keys = list(baseline.scores_by_key)

    result = detect_regression(
        baseline,
        candidate_scores=[],
        cfg=RegressionConfig(),
        candidate_by_key={},
        unmeasurable_keys=set(keys),
    )

    assert result.is_regression is False, (
        "an unreachable judge must never be reported as a quality regression"
    )
    assert result.method == "unmeasurable"
    assert "could not" in result.reason.lower()


def test_partially_unmeasured_run_does_not_silently_shrink_the_population():
    """Losing scenarios to a broken judge must be stated, not quietly dropped."""
    from agentproof_server.eval_engine.regression import detect_regression

    baseline = _baseline()
    keys = list(baseline.scores_by_key)
    # 10 of 13 scored fine; 3 lost to judge failures.
    candidate = {k: 0.9 for k in keys[:10]}

    result = detect_regression(
        baseline,
        candidate_scores=list(candidate.values()),
        cfg=RegressionConfig(),
        candidate_by_key=candidate,
        unmeasurable_keys=set(keys[10:]),
    )

    assert result.is_regression is False
    assert result.method == "unmeasurable"
    assert "3" in result.reason


def test_fully_measured_run_is_unaffected():
    """The new parameter must default to inert for every existing caller."""
    from agentproof_server.eval_engine.regression import detect_regression

    baseline = _baseline()
    keys = list(baseline.scores_by_key)
    candidate = dict.fromkeys(keys, 0.9)

    result = detect_regression(
        baseline, list(candidate.values()), RegressionConfig(), candidate_by_key=candidate
    )
    assert result.method == "paired"
    assert result.is_regression is False
