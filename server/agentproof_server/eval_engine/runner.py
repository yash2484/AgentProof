# server/agentproof_server/eval_engine/runner.py
"""
EvalRunner: a pure, synchronous orchestrator over trace dicts.

It builds evaluators from an ``EvalConfig`` (explicit dispatch by metric type;
unknown/security types are skipped with a warning), runs deterministic and
llm_judge metrics per trace, then a composite pass over the already-computed
results, and aggregates a ``BatchEvalReport`` across traces.

No database access lives here — the API wraps it in ``asyncio.to_thread`` and
the CLI calls it directly.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Protocol

from agentproof_server.eval_engine.composite import CompositeEvaluator
from agentproof_server.eval_engine.config_parser import resolve_deterministic_field
from agentproof_server.eval_engine.deterministic import (
    CostBudgetEvaluator,
    LatencyBudgetEvaluator,
    ResponsePatternEvaluator,
    TokenBudgetEvaluator,
    ToolAllowlistEvaluator,
)
from agentproof_server.eval_engine.llm_judge import LLMJudgeEvaluator
from agentproof_server.eval_engine.models import (
    BatchEvalReport,
    EvalConfig,
    EvalResult,
    EvalScore,
    MetricConfig,
    MetricType,
)

logger = logging.getLogger("agentproof_server.eval_engine")


class _Evaluator(Protocol):
    def evaluate(self, trace_dict: dict, spans: list[dict]) -> EvalScore: ...


_DETERMINISTIC_BY_FIELD = {
    "max_latency_ms": LatencyBudgetEvaluator,
    "max_cost_usd": CostBudgetEvaluator,
    "max_tokens": TokenBudgetEvaluator,
    "allowed_tools": ToolAllowlistEvaluator,
    "pattern": ResponsePatternEvaluator,
}


class EvalRunner:
    def __init__(self, config: EvalConfig, judge_client=None) -> None:
        self.config = config
        self._judge_client = judge_client  # injected for tests; None → real client
        self._base_metrics: list[tuple[MetricConfig, _Evaluator]] = []
        self._composite_metrics: list[MetricConfig] = []
        self._build_evaluators()

    def _build_evaluators(self) -> None:
        """Populate ``_base_metrics`` and ``_composite_metrics`` from config.

        Malformed deterministic configs raise ``ConfigError``/``KeyError`` at
        construction (fail-fast); unknown/security types are skipped with a
        warning so the runner degrades gracefully for future metric kinds.
        """
        for metric in self.config.metrics:
            if metric.type == MetricType.DETERMINISTIC:
                field = resolve_deterministic_field(metric)
                evaluator = _DETERMINISTIC_BY_FIELD[field](metric)
                self._base_metrics.append((metric, evaluator))
            elif metric.type == MetricType.LLM_JUDGE:
                evaluator = LLMJudgeEvaluator(
                    metric, self.config.judge_model, client=self._judge_client
                )
                self._base_metrics.append((metric, evaluator))
            elif metric.type == MetricType.COMPOSITE:
                self._composite_metrics.append(metric)
            else:  # security — Phase 3
                logger.warning(
                    "Skipping metric '%s' of unsupported type '%s' (Phase 3+).",
                    metric.name,
                    metric.type,
                )

    def _make_result(
        self, trace_dict: dict, metric: MetricConfig, score: EvalScore, now: datetime
    ) -> EvalResult:
        """Build an EvalResult persisted at the trace level.

        ``span_id`` is intentionally left as the EvalResult default (None) even
        for span-level metrics: per-span detail is preserved inside ``details``
        and ``raw_judge_output`` rather than as separate span-keyed rows.
        """
        return EvalResult(
            trace_id=trace_dict.get("trace_id", ""),
            metric_name=metric.name,
            metric_type=metric.type,
            score=score.value,
            explanation=score.explanation,
            threshold=metric.threshold,
            passed=score.value >= metric.threshold,
            details=score.details,
            raw_judge_output=score.raw_judge_output,
            evaluated_at=now,
        )

    @staticmethod
    def _applicable_spans(trace_dict: dict, metric: MetricConfig) -> list[dict]:
        spans = trace_dict.get("spans", []) or []
        if metric.applies_to == "trace":
            return spans
        return [s for s in spans if s.get("span_type") == metric.applies_to]

    def evaluate_trace(self, trace_dict: dict) -> list[EvalResult]:
        now = datetime.now(UTC)
        results: list[EvalResult] = []
        results_by_name: dict[str, EvalResult] = {}

        for metric, evaluator in self._base_metrics:
            spans = self._applicable_spans(trace_dict, metric)
            score = evaluator.evaluate(trace_dict, spans)
            result = self._make_result(trace_dict, metric, score, now)
            results.append(result)
            results_by_name[metric.name] = result

        for metric in self._composite_metrics:
            score = CompositeEvaluator(metric).evaluate(results_by_name)
            result = self._make_result(trace_dict, metric, score, now)
            results.append(result)
            results_by_name[metric.name] = result

        return results

    def evaluate_batch(self, traces: list[dict]) -> BatchEvalReport:
        if not traces:
            raise ValueError("evaluate_batch requires at least one trace.")
        all_results: list[EvalResult] = []
        for trace in traces:
            all_results.extend(self.evaluate_trace(trace))

        # Per-metric summary.
        summary: dict[str, dict] = {}
        by_metric: dict[str, list[EvalResult]] = {}
        for r in all_results:
            by_metric.setdefault(r.metric_name, []).append(r)

        failed_metrics: list[str] = []
        for name, rows in by_metric.items():
            scores = [r.score for r in rows]
            pass_count = sum(1 for r in rows if r.passed)
            threshold = rows[0].threshold
            metric_passed = all(r.passed for r in rows)
            if not metric_passed:
                failed_metrics.append(name)
            summary[name] = {
                "mean": sum(scores) / len(scores),
                "min": min(scores),
                "max": max(scores),
                "count": len(scores),
                "pass_rate": pass_count / len(scores),
                "threshold": threshold,
                "passed": metric_passed,
            }

        return BatchEvalReport(
            results=all_results,
            summary=summary,
            overall_passed=len(failed_metrics) == 0,
            evaluated_traces=len(traces),
            total_metrics=len(by_metric),
            failed_metrics=failed_metrics,
            timestamp=datetime.now(UTC),
        )
