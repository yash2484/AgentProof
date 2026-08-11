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
    # Optional second filter: restrict the metric to spans with these names.
    # A rubric is written for a particular role in the graph -- a groundedness
    # rubric is meaningless against a planner's list of search queries or a
    # fact-checker's verdict line. Without this, aggregation=min means the
    # least-groundable intermediate span decides the whole trace's score.
    # None = every span of the applies_to type (the original behaviour).
    span_names: list[str] | None = None
    threshold: float = 0.7
    regression_alert: bool = True
    ci_block: bool = True
    # Per-metric practical-significance floor, overriding RegressionConfig's
    # global one. Noise is a property of the metric, not of the run: measured
    # across two evaluations of an identical corpus, faithfulness moved with a
    # per-scenario sd of 0.034 while relevance moved with 0.144. A single global
    # floor cannot sit above the noise of the second without being far above
    # anything worth catching in the first.
    min_mean_drop: float | None = None

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
    # The same scores, identified. Pairing needs to know which score belongs to
    # which scenario; a bare list only supports treating N scenarios as N draws
    # from one distribution, which makes between-scenario difficulty look like
    # measurement noise. Optional so baselines pinned before this existed keep
    # working — they simply fall back to the unpaired path.
    scores_by_key: dict[str, float] | None = None
    mean: float
    std: float
    sample_size: int
    created_at: datetime


class RegressionConfig(BaseModel):
    """Thresholds governing the regression decision rule."""

    alpha: float = 0.05
    min_effect_size: float = 0.5
    # Paired comparisons are scored with Cohen's d_z (mean delta / sd of the
    # deltas), which is a different quantity on a different scale from the
    # unpaired d -- so it gets its own knob rather than silently inheriting one.
    # 0.5 was chosen by working the cases, not by copying the value above:
    #   one scenario collapsing by 0.85, twelve unmoved -> d_z 0.28, rejected
    #   two scenarios dropping 0.50, eleven unmoved     -> d_z 0.41, rejected
    #   five scenarios dropping 0.28, eight unmoved     -> d_z 0.76, caught
    # Its job is breadth: it stops one cratering scenario from convicting the
    # whole suite, which is the paired analogue of the outlier that made the
    # unpaired path blind.
    min_effect_size_paired: float = 0.5
    # Practical significance. Statistical significance answers "is it real",
    # never "does it matter". Pairing drops the noise floor to roughly the 0.008
    # measured between two identical runs, so without this a paired test would
    # confidently report drops nobody would act on. Necessary (not sufficient)
    # on the statistical paths; sufficient on the fallback paths below.
    min_mean_drop: float = 0.05
    # Below this many samples per group, Welch's t-test has too little power to
    # be trusted and the absolute-drop floor decides instead. Empirically, a
    # one-in-three failure (a 33% mean drop, Cohen's d 0.82) yields p=0.21 at
    # n=3, p=0.09 at n=6, and only reaches alpha=0.05 at n=9 -- so a threshold
    # of 2 let real, reproducible regressions pass as "not significant".
    min_sample_size: int = 9


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
    # Which comparison actually ran. "paired" when both sides carried matching
    # keys, "welch" for the two-sample fallback, "floor" when the sample was too
    # small or too degenerate for either test. Reported so a verdict can never
    # be read without knowing how it was reached.
    method: Literal["paired", "welch", "floor"] = "welch"
    cohens_dz: float | None = None
    paired_n: int | None = None


class RegressionReport(BaseModel):
    """Aggregated regression verdicts across all baselined metrics."""

    results: list[RegressionResult]
    regressed_metrics: list[str]
    passed: bool  # True == no CI-blocking regression
    timestamp: datetime
