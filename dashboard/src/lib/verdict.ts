import { describeGate, metricSeverity } from "./analytics";
import type { GateVerdict, MetricHealth } from "../types";

/**
 * The Overview's thesis sentence.
 *
 * The old page showed five cards of near-equal weight and never said what to
 * take from them. Every other page in the product opens with a question; this
 * one opens with the answer, and the rest of the page is the evidence for it.
 *
 * Kept as a pure function for the same reason severity assignment is: it is
 * the most load-bearing sentence on the screen and it must be testable without
 * rendering anything.
 */

export type VerdictTone = "serious" | "watch" | "clear" | "unknown";

export interface Verdict {
  tone: VerdictTone;
  /** The conclusion, in words. Largest type on the page. */
  headline: string;
  /** The evidence for it, always carrying denominators. */
  detail: string;
  /** The metric a reader should open first, when there is one. */
  focus: string | null;
}

export interface VerdictInput {
  metrics: MetricHealth[];
  gate: GateVerdict[];
  /** Measurements that produced a usable score in this window. */
  scored: number;
}

/** Most failures first; ties broken by the lower mean, then by name. */
function byUrgency(a: MetricHealth, b: MetricHealth): number {
  if (b.failed !== a.failed) return b.failed - a.failed;
  const meanA = a.mean_score ?? 1;
  const meanB = b.mean_score ?? 1;
  if (meanA !== meanB) return meanA - meanB;
  return a.metric_name.localeCompare(b.metric_name);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The sentence that must never be omitted from a clean verdict.
 *
 * Six of eight metrics sit at 1.000 with zero variance because no scenario in
 * the window stresses them. Reporting that as "all clear" is precisely the
 * laundering of untested into passing that this product exists to catch, so a
 * clear verdict is required to disclose it.
 */
function unexercisedClause(metrics: MetricHealth[]): string {
  const never = metrics.filter((m) => !m.has_variance);
  if (never.length === 0) return "";
  return ` ${never.length} of ${metrics.length} never moved in this window — unexercised, not proven.`;
}

function degradedClause(metrics: MetricHealth[]): string {
  const broken = metrics.reduce((sum, m) => sum + m.degraded, 0);
  if (broken === 0) return "";
  return ` ${plural(broken, "measurement", "measurements")} broke and ${broken === 1 ? "is" : "are"} excluded from every figure here.`;
}

/**
 * The regression sentence, in the product's own words.
 *
 * The detector short-circuits before the t-test on no-drop, tiny samples and
 * zero-variance pairs, and hands back its own diagnostic instead —
 * `Small sample -> absolute-drop floor: drop 1.000 >= 0.05.` That string is
 * useful on a detail card, where an engineer is asking why the gate fired.
 * Splicing it into the lede put an ASCII arrow and an inequality into the
 * largest sentence in the product, on the page a non-operator reads first.
 *
 * So the statistics are quoted when they exist, and when they do not the
 * sentence says what moved rather than how the detector decided.
 */
function regressionDetail(worst: GateVerdict): string {
  const { p_value: p, cohens_d: d, baseline_mean: from, candidate_mean: to } = worst;

  if (p !== null && d !== null) {
    return `${worst.metric_name}: ${describeGate(worst).statLine}`;
  }
  if (typeof from === "number" && typeof to === "number") {
    return `${worst.metric_name} fell from ${from.toFixed(3)} to ${to.toFixed(3)} against its pinned baseline`;
  }
  return `${worst.metric_name} moved against its pinned baseline`;
}

/** One sentence, one full stop. `gate.reason` arrives already terminated. */
function sentence(body: string): string {
  return `${body.replace(/[.\s]+$/, "")}.`;
}

export function overviewVerdict({ metrics, gate, scored }: VerdictInput): Verdict {
  if (metrics.length === 0 || scored === 0) {
    return {
      tone: "unknown",
      headline: "Nothing has been measured",
      detail:
        "No evaluation has produced a usable score in this window. Widen the range or run an evaluation — an empty screen is not a passing one.",
      focus: null,
    };
  }

  const ranked = [...metrics].sort(byUrgency);

  // A regression outranks everything else because it is the only claim on this
  // page backed by a baseline comparison — a p-value and an effect size exist
  // behind it. Raw failure counts describe a state; this describes a change.
  const regressed = gate.filter((g) => g.is_regression);
  if (regressed.length > 0) {
    const worst = regressed[0];
    return {
      tone: "serious",
      headline:
        regressed.length === 1
          ? `${worst.metric_name} regressed against baseline`
          : `${plural(regressed.length, "metric", "metrics")} regressed against baseline`,
      detail: `${sentence(regressionDetail(worst))}${degradedClause(metrics)}`,
      focus: worst.metric_name,
    };
  }

  // A metric that moved materially but could not be confirmed outranks raw
  // failure counts, for the same reason a regression does: it is a statement
  // about change against a baseline. It must never fall through to the clear
  // branch, because "we could not tell" reported as "all clear" is the exact
  // failure this state was added to remove.
  const unresolved = gate.filter((g) => g.is_warning);
  if (unresolved.length > 0) {
    const worst = unresolved[0];
    return {
      tone: "watch",
      headline:
        unresolved.length === 1
          ? `${worst.metric_name} moved, and the sample cannot say whether it matters`
          : `${plural(unresolved.length, "metric", "metrics")} moved without enough evidence to judge`,
      detail: `${sentence(regressionDetail(worst))}${degradedClause(metrics)}`,
      focus: worst.metric_name,
    };
  }

  const flagged = ranked.filter((m) => m.failed > 0);
  if (flagged.length > 0) {
    const worst = flagged[0];
    const severities = flagged.map((m) =>
      metricSeverity(
        m,
        gate.find((g) => g.metric_name === m.metric_name),
      ),
    );
    const tone: VerdictTone = severities.includes("serious")
      ? "serious"
      : "watch";

    const others =
      flagged.length > 1
        ? ` ${plural(flagged.length - 1, "other metric", "other metrics")} also flagged.`
        : " Nothing else flagged a measurement.";

    return {
      tone,
      // Deliberately not "regressed": that word is a claim about change over
      // time and there is no baseline behind this branch.
      headline: `${plural(flagged.length, "metric", "metrics")} needs attention`.replace(
        "metrics needs",
        "metrics need",
      ),
      detail: `${worst.metric_name} flagged ${worst.failed} of ${worst.count} measurements.${others}${degradedClause(metrics)}`,
      focus: worst.metric_name,
    };
  }

  return {
    tone: "clear",
    headline: "No measurement was flagged",
    detail:
      `Every one of ${scored} measurements in this window scored inside its threshold.`.concat(
        unexercisedClause(metrics),
        degradedClause(metrics),
      ),
    focus: null,
  };
}
