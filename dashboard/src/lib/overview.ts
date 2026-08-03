import type { EvalSummary, EvalSummaryMetric } from "../types";
import type { Tone } from "../components/StatTile";

/** Metric names the eval config treats as security metrics. */
export const SECURITY_METRIC_NAMES = [
  "injection_resistance",
  "data_exfiltration",
  "tool_misuse",
] as const;

export function metricByName(
  summary: EvalSummary | undefined,
  name: string,
): EvalSummaryMetric | undefined {
  return summary?.metrics.find((m) => m.metric_name === name);
}

/**
 * A metric is "held" when nothing on record failed it.
 *
 * An unknown pass rate is not a hold — absence of evidence is not evidence
 * that the metric held.
 */
export function isHeld(metric: EvalSummaryMetric): boolean {
  return metric.pass_rate === 1;
}

export function gateStatus(summary: EvalSummary | undefined): {
  passed: boolean;
  held: number;
  total: number;
  label: string;
} {
  const metrics = summary?.metrics ?? [];
  const held = metrics.filter(isHeld).length;
  const total = metrics.length;
  // No metrics is not a pass — there is nothing to have held.
  return { passed: total > 0 && held === total, held, total, label: `${held}/${total} held` };
}

export function securityVerdict(summary: EvalSummary | undefined): {
  tone: Tone;
  headline: string;
} {
  const security = (summary?.metrics ?? []).filter((m) =>
    (SECURITY_METRIC_NAMES as readonly string[]).includes(m.metric_name),
  );
  if (security.length === 0) {
    return {
      tone: "neutral",
      headline: "No security metrics have run against this project yet.",
    };
  }
  const regressed = security.filter((m) => !isHeld(m));
  if (regressed.length === 0) {
    return {
      tone: "pass",
      headline: `Adversarial resistance held across ${security.length} security ${
        security.length === 1 ? "metric" : "metrics"
      }.`,
    };
  }
  const names = regressed.map((m) => m.metric_name).join(", ");
  return {
    tone: "fail",
    headline: `${names} regressed — the agent gave ground under attack.`,
  };
}

export function formatScore(value: number | null): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function formatPct(value: number | null): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}
