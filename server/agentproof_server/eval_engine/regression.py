"""
Phase-4 regression detection: pure statistics over two score samples.

A regression is a statistically significant *drop* in a metric's mean per-trace
score (one-sided Welch's t-test) that is also large enough to matter
(Cohen's d effect-size guard). No I/O lives here.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

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


def paired_t_test(
    baseline: Sequence[float], candidate: Sequence[float]
) -> tuple[float, float, float]:
    """Return ``(t_statistic, df, p_value)`` for H1: candidate < baseline, paired.

    Each element of ``candidate`` must be the same scenario as the element at
    the same index of ``baseline``. That correspondence is the whole point: it
    removes between-scenario difficulty from the comparison.
    """
    result = stats.ttest_rel(candidate, baseline, alternative="less")
    df = float(getattr(result, "df", len(baseline) - 1))
    return float(result.statistic), df, float(result.pvalue)


# Below this, the spread of the deltas is float noise rather than measurement.
# An exact `sd == 0.0` test is not enough: a uniform shift is computed as
# b - (b - drop), and that cancellation leaves a spread around 1e-17 instead of
# zero. Without a tolerance the uniform-shift branch is skipped, d_z comes back
# as ~1e16 rather than infinite, and scipy runs a t-test on degenerate data and
# warns that the result may be unreliable. Judge scores are quantised far above
# this, so nothing real is ever swallowed by the tolerance.
_NEGLIGIBLE_SD = 1e-9


def cohens_dz(deltas: Sequence[float]) -> float:
    """Paired effect size: mean delta over the standard deviation of deltas.

    Positive when the candidate dropped. Returns ``inf`` for a uniform shift
    (no meaningful spread), which callers resolve on the practical floor.
    """
    arr = np.asarray(deltas, dtype=float)
    if len(arr) < 2:
        return 0.0
    sd = float(arr.std(ddof=1))
    mean = float(arr.mean())
    if sd <= _NEGLIGIBLE_SD:
        return math.inf if mean > 0 else 0.0
    return mean / sd


def _detect_paired(
    baseline: Baseline,
    baseline_by_key: Mapping[str, float],
    candidate_by_key: Mapping[str, float],
    keys: list[str],
    cfg: RegressionConfig,
) -> RegressionResult:
    """Scenario-by-scenario comparison over the keys present on both sides."""
    b = [float(baseline_by_key[k]) for k in keys]
    c = [float(candidate_by_key[k]) for k in keys]
    deltas = [bi - ci for bi, ci in zip(b, c, strict=True)]

    baseline_mean = float(np.mean(b))
    candidate_mean = float(np.mean(c))
    mean_delta = float(np.mean(deltas))
    fields = {
        "metric_name": baseline.metric_name,
        "baseline_mean": baseline_mean,
        "candidate_mean": candidate_mean,
        "delta": candidate_mean - baseline_mean,
        "t_statistic": None,
        "p_value": None,
        "cohens_d": None,
        "cohens_dz": None,
        "method": "paired",
        "paired_n": len(keys),
    }

    # 1. No net drop is never a regression.
    if mean_delta <= 0:
        return RegressionResult(
            **fields,
            is_regression=False,
            reason=(
                f"No drop (paired mean delta {mean_delta:+.3f} over "
                f"{len(keys)} scenarios)."
            ),
        )

    # 2. Practical significance, checked before the test. A drop nobody would
    #    act on does not become actionable by being statistically certain.
    if mean_delta < cfg.min_mean_drop:
        return RegressionResult(
            **fields,
            is_regression=False,
            reason=(
                f"Paired mean drop {mean_delta:.3f} < practical floor "
                f"{cfg.min_mean_drop} over {len(keys)} scenarios — below the "
                f"level worth acting on, regardless of significance."
            ),
        )

    dz = cohens_dz(deltas)
    fields["cohens_dz"] = None if math.isinf(dz) else dz

    # 3. A perfectly uniform shift has no spread, so the paired t-test is
    #    undefined. Every scenario moved by the same amount, which is about as
    #    unambiguous as a regression gets — decide on the practical floor.
    if math.isinf(dz):
        return RegressionResult(
            **fields,
            is_regression=True,
            reason=(
                f"Every one of {len(keys)} scenarios dropped by "
                f"{mean_delta:.3f} — uniform shift, no spread to test."
            ),
        )

    t, _df, p = paired_t_test(b, c)
    fields.update(t_statistic=t, p_value=p)

    if math.isnan(p):
        return RegressionResult(
            **fields,
            is_regression=mean_delta >= cfg.min_mean_drop,
            reason=(
                f"Undefined paired t-test -> practical floor: drop "
                f"{mean_delta:.3f} >= {cfg.min_mean_drop}."
            ),
        )

    is_reg = (p < cfg.alpha) and (dz >= cfg.min_effect_size_paired)
    return RegressionResult(
        **fields,
        is_regression=is_reg,
        reason=(
            f"paired over {len(keys)} scenarios: drop {mean_delta:.3f}, "
            f"p={p:.4f} {'<' if p < cfg.alpha else '>='} alpha={cfg.alpha}, "
            f"d_z={dz:.3f} {'>=' if dz >= cfg.min_effect_size_paired else '<'} "
            f"{cfg.min_effect_size_paired}."
        ),
    )


def detect_regression(
    baseline: Baseline,
    candidate_scores: Sequence[float],
    cfg: RegressionConfig,
    candidate_by_key: Mapping[str, float] | None = None,
) -> RegressionResult:
    """Decide whether the candidate is a regression against ``baseline``.

    Pairs scenario-by-scenario when both sides carry keys and enough of them
    overlap; otherwise falls back to the two-sample Welch path. The fallback is
    deliberate rather than best-effort: pairing on a partial or renamed key set
    would compare one scenario's baseline against another's candidate, and a
    silently mispaired verdict is worse than an underpowered honest one.
    """
    baseline_by_key = baseline.scores_by_key
    if baseline_by_key and candidate_by_key:
        keys = sorted(set(baseline_by_key) & set(candidate_by_key))
        if len(keys) >= cfg.min_sample_size:
            return _detect_paired(
                baseline, baseline_by_key, candidate_by_key, keys, cfg
            )

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
            method="floor",
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
            method="floor",
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
            method="floor",
            is_regression=is_reg,
            reason=(
                f"Undefined t-test -> absolute-drop floor: "
                f"drop {drop:.3f} {'>=' if is_reg else '<'} {cfg.min_mean_drop}."
            ),
        )

    # 5. Significance AND effect size AND practical significance. All three:
    #    "is it real", "is it big relative to the spread", and "is it big enough
    #    in absolute terms to be worth anyone's afternoon".
    is_reg = (
        (p < cfg.alpha)
        and (d >= cfg.min_effect_size)
        and (drop >= cfg.min_mean_drop)
    )
    reason = (
        f"p={p:.4f} {'<' if p < cfg.alpha else '>='} alpha={cfg.alpha}, "
        f"d={d:.3f} {'>=' if d >= cfg.min_effect_size else '<'} "
        f"{cfg.min_effect_size}."
    )
    if drop < cfg.min_mean_drop:
        reason += (
            f" Drop {drop:.3f} < practical floor {cfg.min_mean_drop}."
        )
    return RegressionResult(**fields, is_regression=is_reg, reason=reason)
