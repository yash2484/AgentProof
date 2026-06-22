"""
Pydantic data models for the eval engine.

These are deliberately separate from the SDK span models and the SQLAlchemy
ORM. ``EvalResult`` mirrors the columns of the Phase-1 ``eval_results`` table
so a result can be persisted without a translation layer.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class MetricType(str, Enum):
    """The kinds of evaluation a metric can perform."""

    DETERMINISTIC = "deterministic"
    LLM_JUDGE = "llm_judge"
    SECURITY = "security"  # parsed in Phase 2; evaluators land in Phase 3
    COMPOSITE = "composite"


class EvalScore(BaseModel):
    """The raw output of running one evaluator (before it becomes a result row)."""

    value: float
    explanation: str
    details: dict | None = None
    raw_judge_output: dict | None = None
    latency_ms: int | None = None


class EvalResult(BaseModel):
    """A single metric's outcome on a trace or span — matches ``eval_results``."""

    trace_id: str
    span_id: str | None = None
    metric_name: str
    metric_type: MetricType
    score: float
    explanation: str | None = None
    threshold: float | None = None
    passed: bool
    details: dict | None = None
    raw_judge_output: dict | None = None
    evaluated_at: datetime
    baseline_id: str | None = None


class MetricConfig(BaseModel):
    """One metric as declared in ``agentproof.yaml``."""

    name: str
    type: MetricType
    applies_to: str
    threshold: float = 0.7
    regression_alert: bool = True
    ci_block: bool = True

    # llm_judge
    rubric: str | None = None
    judge_model: str | None = None
    aggregation: Literal["mean", "min", "max"] = "mean"

    # deterministic
    allowed_tools: list[str] | None = None
    max_latency_ms: int | None = None
    max_cost_usd: float | None = None
    max_tokens: int | None = None
    pattern: str | None = None

    # composite
    weights: dict[str, float] | None = None

    # security (Phase 3)
    detection_mode: str | None = None
    sensitive_patterns: list[str] | None = None
    security_check: str | None = None
    dangerous_tools: list[str] | None = None


class EvalConfig(BaseModel):
    """A parsed, validated eval configuration."""

    project: str
    judge_model: str = "claude-sonnet-4-6"
    metrics: list[MetricConfig] = Field(default_factory=list)


class BatchEvalReport(BaseModel):
    """Aggregated results across a batch of evaluated traces."""

    results: list[EvalResult]
    summary: dict
    overall_passed: bool
    evaluated_traces: int
    total_metrics: int
    failed_metrics: list[str]
    timestamp: datetime


class Baseline(BaseModel):
    """A pinned, file-serializable score distribution for one metric.

    Carries the ``baselines`` table's core score columns; the DB-only
    ``pinned`` / ``updated_at`` columns are not modelled here because Phase 4
    is file-based.
    """

    project: str
    metric_name: str
    scores: list[float]
    mean: float
    std: float
    sample_size: int
    created_at: datetime


class RegressionConfig(BaseModel):
    """Thresholds governing the regression decision rule."""

    alpha: float = 0.05
    min_effect_size: float = 0.5
    min_mean_drop: float = 0.05
    min_sample_size: int = 2


class RegressionResult(BaseModel):
    """The verdict for one metric: baseline vs candidate."""

    metric_name: str
    baseline_mean: float
    candidate_mean: float
    delta: float  # candidate_mean - baseline_mean; negative == a drop
    t_statistic: float | None
    p_value: float | None
    cohens_d: float | None
    is_regression: bool
    reason: str


class RegressionReport(BaseModel):
    """Aggregated regression verdicts across all baselined metrics."""

    results: list[RegressionResult]
    regressed_metrics: list[str]
    passed: bool  # True == no CI-blocking regression
    timestamp: datetime
