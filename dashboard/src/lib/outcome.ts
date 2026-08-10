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

/**
 * One sentence saying what this trace's measurements amount to.
 *
 * The side panel's only prose, and the thing the document frame buys: a
 * column of mono figures tells a fluent reader what happened, and tells
 * everyone else nothing. It obeys the same two rules as every other claim in
 * the product — an unmeasured trace has not passed, and a measurement that
 * broke is never counted as a failure.
 */
export function traceSentence(outcome: EvalOutcome): string {
  if (outcome.outcome === "not_evaluated" || outcome.total === 0) {
    const broken =
      outcome.degraded > 0
        ? ` ${outcome.degraded} ${outcome.degraded === 1 ? "measurement" : "measurements"} was attempted and broke.`
        : "";
    return `Nothing has been measured on this trace. That is not a pass — it is the absence of a measurement.${broken}`;
  }

  const alsoBroken =
    outcome.degraded > 0
      ? ` ${outcome.degraded} more could not be taken — the judge errored or refused, so ${outcome.degraded === 1 ? "it is" : "they are"} excluded rather than counted against the agent.`
      : "";

  if (outcome.failed > 0) {
    const worst =
      outcome.worst_metric && outcome.worst_score !== null
        ? ` ${metricTitle(outcome.worst_metric)} scored lowest, at ${outcome.worst_score.toFixed(3)}.`
        : "";
    return `${outcome.failed} of ${outcome.total} measurements failed on this trace.${worst}${alsoBroken}`;
  }

  if (outcome.degraded > 0) {
    return `Every measurement that completed on this trace passed, but ${outcome.degraded} could not be taken — the judge errored or refused, so this trace is not fully evaluated.`;
  }

  return `All ${outcome.total} measurements on this trace passed.`;
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
