"""
Phase-4 regression detection: pure statistics over two score samples.

A regression is a statistically significant *drop* in a metric's mean per-trace
score (one-sided Welch's t-test) that is also large enough to matter
(Cohen's d effect-size guard). No I/O lives here.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from scipy import stats


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
