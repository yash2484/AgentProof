# server/agentproof_server/eval_engine/deterministic.py
"""
Deterministic evaluators: pure, side-effect-free scorers over trace/span dicts.

Each evaluator takes a ``MetricConfig`` and exposes ``evaluate(trace_dict,
spans) -> EvalScore``. ``spans`` is the list of *applicable* span dicts (the
runner filters by ``applies_to`` before calling). Trace-level evaluators read
aggregate fields off ``trace_dict`` and ignore ``spans``.

Edge-case contract (shared across all evaluators):
- No applicable spans for a span-level metric -> score 1.0, "no applicable spans".
- A required aggregate field is missing on the trace -> score 0.0, naming the field.
"""

from __future__ import annotations

import re
import time

from agentproof_server.eval_engine.models import EvalScore, MetricConfig


class DeterministicEvaluator:
    """Base class — subclasses implement ``_score``; timing is handled here."""

    def __init__(self, config: MetricConfig) -> None:
        self.config = config

    def evaluate(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        start = time.perf_counter()
        score = self._score(trace_dict, spans)
        score.latency_ms = int((time.perf_counter() - start) * 1000)
        return score

    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        raise NotImplementedError


def _budget_score(value: float | None, field: str, limit: float) -> EvalScore:
    """Shared logic for the three trace-level budget evaluators."""
    if value is None:
        return EvalScore(
            value=0.0,
            explanation=f"Trace is missing required field '{field}'.",
            details={field: None, "limit": limit},
        )
    within = value <= limit
    return EvalScore(
        value=1.0 if within else 0.0,
        explanation=(
            f"{field}={value} {'within' if within else 'exceeds'} budget {limit}."
        ),
        details={field: value, "limit": limit},
    )


class LatencyBudgetEvaluator(DeterministicEvaluator):
    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        latency = trace_dict.get("total_latency_ms")
        if latency is None:
            # Fallback: sum per-span latencies when the aggregate is absent.
            summed = sum(s.get("latency_ms") or 0 for s in spans)
            latency = summed or None
        score = _budget_score(latency, "total_latency_ms", self.config.max_latency_ms)
        # Surface the latency value under a stable key for consumers/tests.
        score.details["latency_ms"] = latency
        return score


class CostBudgetEvaluator(DeterministicEvaluator):
    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        return _budget_score(
            trace_dict.get("total_cost_usd"), "total_cost_usd", self.config.max_cost_usd
        )


class TokenBudgetEvaluator(DeterministicEvaluator):
    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        return _budget_score(
            trace_dict.get("total_tokens"), "total_tokens", self.config.max_tokens
        )


class ToolAllowlistEvaluator(DeterministicEvaluator):
    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        if not spans:
            return EvalScore(value=1.0, explanation="no applicable spans")
        allowed = set(self.config.allowed_tools or [])
        violations = [
            s.get("metadata", {}).get("tool_name")
            for s in spans
            if s.get("metadata", {}).get("tool_name") not in allowed
        ]
        compliant = len(spans) - len(violations)
        return EvalScore(
            value=compliant / len(spans),
            explanation=(
                f"{compliant}/{len(spans)} tool calls within the allowlist."
            ),
            details={"violations": violations, "allowed_tools": sorted(allowed)},
        )


class ResponsePatternEvaluator(DeterministicEvaluator):
    def _score(self, trace_dict: dict, spans: list[dict]) -> EvalScore:
        if not spans:
            return EvalScore(value=1.0, explanation="no applicable spans")
        regex = re.compile(self.config.pattern or "")
        matches = sum(
            1 for s in spans if regex.search(s.get("metadata", {}).get("completion", ""))
        )
        return EvalScore(
            value=matches / len(spans),
            explanation=f"{matches}/{len(spans)} responses match the pattern.",
            details={"pattern": self.config.pattern, "matches": matches},
        )
