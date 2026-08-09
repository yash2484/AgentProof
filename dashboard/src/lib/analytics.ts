import type { GateVerdict, MetricHealth } from "../types";

/**
 * Overview analytics: the judgement calls, as pure functions.
 *
 * The governing principle, from the design spec:
 *
 * > Every alarming statement carries a denominator and a time window; every
 * > LLM-judge number shows its ±0.2 noise; and the screen never launders
 * > untested or unmeasured into passing.
 *
 * Severity and register assignment live here rather than in components
 * because they are the load-bearing decisions on the page — they decide what
 * turns red — and they need to be testable without rendering anything.
 */

/**
 * Projects whose data is generated rather than measured.
 *
 * `synthetic-showcase` exists because the real corpus is 25 traces and four
 * runs — too thin to judge an analytics design against. It is fabricated on
 * purpose, and the README's claim that the demo corpus is a byte-for-byte
 * recording only survives if the two are never confused on screen.
 */
const SYNTHETIC_PROJECTS = new Set(["synthetic-showcase"]);

export function isSyntheticProject(project: string | null | undefined): boolean {
  return project ? SYNTHETIC_PROJECTS.has(project) : false;
}

export type Severity = "degraded" | "clear" | "watch" | "serious";

/** Which of Band 2's two registers a metric belongs in. */
export type Register = "signal" | "ceiling";

/** Below this many measurements, a rate cannot carry an escalation on its own. */
const SMALL_SAMPLE = 10;
/** A serious rate, when at least two measurements are affected on a blocking metric. */
const SERIOUS_RATE = 0.1;
const SERIOUS_AFFECTED = 2;
/** Mirrors RegressionConfig.min_effect_size on the server. */
const MIN_EFFECT_SIZE = 0.5;

/**
 * Metrics whose scores vary get the full distribution; the rest go to the
 * ceiling strip.
 *
 * This is the split that keeps "never varied" out of the healthy bucket. A
 * metric at 1.000 with std 0.000 is not passing — nothing has stressed it.
 */
export function metricRegister(metric: MetricHealth): Register {
  return metric.has_variance ? "signal" : "ceiling";
}

/**
 * The muted line under a ceiling-strip metric.
 *
 * No icon anywhere in here: an icon reads as a warning, and this is an
 * absence of evidence rather than a fault.
 */
export function varianceLabel(metric: MetricHealth): string {
  if (metric.has_variance && metric.std !== null) return `σ ${metric.std.toFixed(3)}`;
  // std is null at n=1. "Cannot tell" and "perfectly stable" are different
  // facts and the strip has to say which one it is looking at.
  if (metric.std === null) return "one observation — no variance measurable";
  return "no variance observed";
}

/**
 * The tier a metric has *earned*.
 *
 * Order matters. Degraded comes first only when nothing was measured at all:
 * a broken judge call must not be allowed to mask a real failure in the rows
 * that did measure.
 */
export function metricSeverity(
  metric: MetricHealth,
  gate?: GateVerdict,
): Severity {
  if (metric.count === 0) return "degraded";

  // The gate fired, so a p-value and an effect size exist behind the claim.
  if (gate?.is_regression) return "serious";

  if (metric.failed === 0) return "clear";

  const rate = metric.failed / metric.count;

  // 100% at any n: there is no sample size at which "every run failed" is
  // merely worth watching.
  if (rate === 1) return "serious";

  // Small-sample rule: widen the uncertainty, do not escalate.
  if (metric.count < SMALL_SAMPLE) return "watch";

  if (rate >= SERIOUS_RATE && metric.failed >= SERIOUS_AFFECTED && metric.ci_block) {
    return "serious";
  }
  return "watch";
}

/**
 * Copy for a metric's tier.
 *
 * Word discipline: "regressed" is a claim about change over time and is only
 * permitted with a baseline comparison behind it. Everything else is
 * "flagged", and every line carries its denominator.
 *
 * The denominator is *measurements* — eval rows, not evaluation runs and not
 * traces. The scope bar counts evaluation runs, and a trace measured twice
 * contributes two rows, so on the synthetic corpus one screen said "9 runs"
 * and "33 of 294 runs flagged": both true, two different nouns.
 */
export function severityCopy(metric: MetricHealth, gate?: GateVerdict): string {
  if (metric.count === 0) {
    const n = metric.degraded;
    return `${n} measurement${n === 1 ? "" : "s"} failed — not a finding`;
  }
  const fraction = `${metric.failed} of ${metric.count} measurements flagged`;
  return gate?.is_regression
    ? `Regressed against baseline — ${fraction}`
    : fraction;
}

/** Cohen's conventions, read on magnitude so an improvement is not mislabelled. */
export function effectSizeLabel(d: number): string {
  const magnitude = Math.abs(d);
  if (magnitude >= 0.8) return "large";
  if (magnitude >= 0.5) return "medium";
  if (magnitude >= 0.2) return "small";
  return "negligible";
}

export interface GateDescription {
  headline: string;
  /** Always-visible muted line translating the statistics into English. */
  statLine: string;
  severity: Severity;
}

/**
 * Turn a gate verdict into a headline plus a translation of its statistics.
 *
 * The restraint case is the point of this function. When the effect size
 * clears but significance does not, the card says so and shows both numbers.
 * A system that explains its silence is more trustworthy than one that only
 * speaks when it is alarmed.
 */
export function describeGate(gate: GateVerdict | undefined): GateDescription {
  if (!gate) {
    return {
      headline: "No baseline",
      statLine: "Nothing pinned to compare against — no verdict is possible.",
      severity: "degraded",
    };
  }
  if (!gate.comparable) {
    return {
      headline: "Not assessed",
      statLine: gate.reason,
      severity: "degraded",
    };
  }

  const { p_value: p, cohens_d: d } = gate;

  // The detector short-circuits before the t-test on no-drop, tiny samples and
  // zero-variance pairs. There is no statistic to translate, so pass its own
  // reason through rather than inventing one.
  if (p === null || d === null) {
    return {
      headline: gate.is_regression ? "Regression detected" : "Not flagged",
      statLine: gate.reason,
      severity: gate.is_regression ? "serious" : "clear",
    };
  }

  const pText = `p=${p.toFixed(3)}`;
  const dText = `d=${Math.abs(d).toFixed(2)}`;

  if (gate.is_regression) {
    return {
      headline: "Regression detected",
      statLine: `unlikely to be chance (${pText}) · ${effectSizeLabel(d)} effect (${dText})`,
      severity: "serious",
    };
  }
  // "but" only when the two guards disagree — the effect cleared and
  // significance did not. When both fell short they agree, and "but" would
  // manufacture a tension the numbers do not contain.
  const conjunction = Math.abs(d) >= MIN_EFFECT_SIZE ? "but" : "and";
  return {
    headline: "Not flagged",
    statLine: `effect is ${effectSizeLabel(d)} (${dText}) ${conjunction} not statistically significant at this sample size (${pText})`,
    severity: "clear",
  };
}
