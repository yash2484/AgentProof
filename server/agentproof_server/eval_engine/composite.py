"""
Composite evaluator: a weighted mean of previously-computed sub-metric scores.

Runs last in the runner. A sub-metric named in ``weights`` but absent from the
computed results (e.g. a deferred Phase-3 security metric) is skipped, logged,
and the remaining weights are renormalized so the composite still produces a
meaningful score. If nothing remains, it scores 0.0.
"""

from __future__ import annotations

import logging
import time

from agentproof_server.eval_engine.models import EvalResult, EvalScore, MetricConfig

logger = logging.getLogger("agentproof_server.eval_engine")


class CompositeEvaluator:
    """Weighted mean of previously-computed sub-metric scores.

    Unlike the other evaluators, ``evaluate`` takes a ``dict[str, EvalResult]``
    keyed by metric name — not ``(trace_dict, spans)`` — because it runs after
    all other evaluators have already produced results.
    """
    def __init__(self, config: MetricConfig) -> None:
        self.config = config

    def evaluate(self, results_by_name: dict[str, EvalResult]) -> EvalScore:
        start = time.perf_counter()
        weights = self.config.weights or {}
        present: dict[str, float] = {}
        skipped: list[str] = []
        for name, weight in weights.items():
            if name in results_by_name:
                present[name] = weight
            else:
                skipped.append(name)
                logger.warning(
                    "Composite '%s': sub-metric '%s' missing — skipping and "
                    "renormalizing.", self.config.name, name
                )

        total_weight = sum(present.values())
        if total_weight == 0:
            score = EvalScore(
                value=0.0,
                explanation=(
                    f"Composite '{self.config.name}': no sub-metrics available "
                    f"(skipped {skipped})."
                ),
                details={"skipped": skipped},
            )
            score.latency_ms = int((time.perf_counter() - start) * 1000)
            return score

        weighted = sum(
            results_by_name[name].score * weight for name, weight in present.items()
        )
        value = weighted / total_weight
        score = EvalScore(
            value=value,
            explanation=(
                f"Composite '{self.config.name}' = {value:.3f} over "
                f"{sorted(present)} (skipped {skipped})."
            ),
            details={"weights_used": present, "skipped": skipped},
        )
        score.latency_ms = int((time.perf_counter() - start) * 1000)
        return score
