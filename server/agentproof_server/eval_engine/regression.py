"""
Phase-4 regression detection: pure statistics over two score samples.

A regression is a statistically significant *drop* in a metric's mean per-trace
score (one-sided Welch's t-test) that is also large enough to matter
(Cohen's d effect-size guard). No I/O lives here.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from scipy import stats

from agentproof_server.eval_engine.models import (
    Baseline,
    RegressionConfig,
    RegressionResult,
)


def welch_t_test(
    baseline: Sequence[float], candidate: Sequence[float]
) -> tuple[float, float, float]:
    """Return ``(t_statistic, df, p_value)`` for H1: mean(candidate) < mean(baseline).

    Welch's t-test (unequal variances). When both samples have zero variance the
    statistic is undefined and ``p_value`` is ``nan`` — callers handle that.
    """
    result = stats.ttest_ind(
        candidate, baseline, equal_var=False, alternative="less"
    )
    df = float(getattr(result, "df", float("nan")))
    return float(result.statistic), df, float(result.pvalue)


def cohens_d(baseline: Sequence[float], candidate: Sequence[float]) -> float:
    """Pooled-standard-deviation effect size; positive when candidate < baseline."""
    b = np.asarray(baseline, dtype=float)
    c = np.asarray(candidate, dtype=float)
    nb, nc = len(b), len(c)
    if nb + nc - 2 <= 0:
        return 0.0
    pooled_var = (
        (nb - 1) * b.var(ddof=1) + (nc - 1) * c.var(ddof=1)
    ) / (nb + nc - 2)
    pooled_sd = float(np.sqrt(pooled_var))
    if pooled_sd == 0.0:
        return 0.0
    return float((b.mean() - c.mean()) / pooled_sd)


def detect_regression(
    baseline: Baseline,
    candidate_scores: Sequence[float],
    cfg: RegressionConfig,
) -> RegressionResult:
    """Decide whether ``candidate_scores`` is a regression against ``baseline``."""
    cand = list(candidate_scores)
    candidate_mean = float(np.mean(cand)) if cand else 0.0
    fields = {
        "metric_name": baseline.metric_name,
        "baseline_mean": baseline.mean,
        "candidate_mean": candidate_mean,
        "delta": candidate_mean - baseline.mean,
        "t_statistic": None,
        "p_value": None,
        "cohens_d": None,
    }

    # 1. No drop (improvement or equal) is never a regression.
    if candidate_mean >= baseline.mean:
        return RegressionResult(
            **fields,
            is_regression=False,
            reason=(
                f"No drop (candidate {candidate_mean:.3f} >= "
                f"baseline {baseline.mean:.3f})."
            ),
        )

    drop = baseline.mean - candidate_mean

    # 2. Too few samples for a t-test -> absolute-drop floor.
    if len(cand) < cfg.min_sample_size or baseline.sample_size < cfg.min_sample_size:
        is_reg = drop >= cfg.min_mean_drop
        return RegressionResult(
            **fields,
            is_regression=is_reg,
            reason=(
                f"Small sample -> absolute-drop floor: drop {drop:.3f} "
                f"{'>=' if is_reg else '<'} {cfg.min_mean_drop}."
            ),
        )

    # 3. Degenerate: both samples constant -> Welch's t-test is undefined.
    #    Checked BEFORE calling scipy so no RuntimeWarning dirties the output,
    #    and because scipy returns p=0.0 (not nan) when the two constants
    #    differ -- which would otherwise slip past the rule-4 effect-size guard
    #    (cohens_d is 0.0 when pooled SD is 0) and hide a real drop.
    if float(np.std(baseline.scores)) == 0.0 and float(np.std(cand)) == 0.0:
        is_reg = drop >= cfg.min_mean_drop
        return RegressionResult(
            **fields,
            is_regression=is_reg,
            reason=(
                f"Zero variance in both samples -> absolute-drop floor: "
                f"drop {drop:.3f} {'>=' if is_reg else '<'} {cfg.min_mean_drop}."
            ),
        )

    # 4. Run the t-test + effect size.
    t, _df, p = welch_t_test(baseline.scores, cand)
    d = cohens_d(baseline.scores, cand)
    fields.update(t_statistic=t, p_value=p, cohens_d=d)

    # Defensive: any remaining nan -> absolute-drop floor.
    if math.isnan(p) or math.isnan(d):
        is_reg = drop >= cfg.min_mean_drop
        return RegressionResult(
            **fields,
            is_regression=is_reg,
            reason=(
                f"Undefined t-test -> absolute-drop floor: "
                f"drop {drop:.3f} {'>=' if is_reg else '<'} {cfg.min_mean_drop}."
            ),
        )

    # 5. Significance AND effect-size guard.
    is_reg = (p < cfg.alpha) and (d >= cfg.min_effect_size)
    reason = (
        f"p={p:.4f} {'<' if p < cfg.alpha else '>='} alpha={cfg.alpha}, "
        f"d={d:.3f} {'>=' if d >= cfg.min_effect_size else '<'} "
        f"{cfg.min_effect_size}."
    )
    return RegressionResult(**fields, is_regression=is_reg, reason=reason)
