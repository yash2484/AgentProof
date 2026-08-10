import { tokens } from "../theme";
import { metricTitle } from "./metricCopy";
import type { EvalOutcome, TraceOutcome } from "../types";

/**
 * How a trace's eval outcome reads in the grid.
 *
 * The column exists so a list of traces can be scanned for "did anything fail
 * here". Every label carries its denominator, and a trace nobody measured is
 * never allowed to look like one that passed — "0/0" reads as a pass at a
 * glance, which is exactly the laundering this product is built to prevent.
 */

export function outcomeLabel(outcome: EvalOutcome): string {
  if (outcome.outcome === "not_evaluated") return "not evaluated";

  const broken = outcome.degraded > 0 ? `${outcome.degraded} unmeasurable` : "";
  if (outcome.failed > 0) {
    const base = `${outcome.failed} of ${outcome.total} failed`;
    return broken ? `${base} · ${broken}` : base;
  }
  if (outcome.total === 0) return broken || "not evaluated";
  const base = `${outcome.passed}/${outcome.total} passed`;
  return broken ? `${base} · ${broken}` : base;
}

/** The lowest-scoring metric on the trace, named. */
export function worstMetricLabel(outcome: EvalOutcome): string {
  if (!outcome.worst_metric || outcome.worst_score === null) return "—";
  return `${metricTitle(outcome.worst_metric)} ${outcome.worst_score.toFixed(3)}`;
}

/**
 * Colour per outcome. Never the only channel — every cell carries its words.
 *
 * `not_evaluated` is muted rather than green: an unmeasured trace has not
 * passed anything.
 */
export function outcomeColor(outcome: TraceOutcome): string {
  switch (outcome) {
    case "failed":
      return tokens.status.fail;
    case "degraded":
      return tokens.status.watch;
    case "passed":
      return tokens.status.pass;
    default:
      return tokens.muted;
  }
}

/** Filter options, failures first because that is what a reader came for. */
export const OUTCOME_FILTERS = [
  { value: "", label: "Any outcome" },
  { value: "failed", label: "Failed something" },
  { value: "degraded", label: "Measurement broke" },
  { value: "passed", label: "Passed everything" },
  { value: "not_evaluated", label: "Not evaluated" },
] as const;
