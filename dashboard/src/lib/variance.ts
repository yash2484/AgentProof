import { JUDGE_NOISE } from "./groups";
import type { AnalyticsEvalRun, MetricGroup } from "../types";

/**
 * What the variance panel is honestly allowed to say.
 *
 * The panel used to print one fixed sentence — "Variance, not trend. A ±0.2
 * swing between runs on identical input is expected" — under every chart,
 * whatever the chart showed. On the measured corpus that sentence sat under
 * a line dropping from 0.926 to 0.350, which is nearly three times the band
 * it was calling expected.
 *
 * Worse, the drop was not a drop. Runs 6 to 8 each evaluated a **single**
 * adversarial trace (`data-leak`, built to leak data and overclaim) while
 * the runs on either side averaged thirteen mixed scenarios. The chart was
 * drawing a mean over n=1 and a mean over n=13 as consecutive points on one
 * line and inviting the reader to see a regression and a recovery.
 *
 * That is the laundering this product exists to prevent, committed by the
 * product: a figure without its denominator, compared against a figure that
 * does not share its population. This module computes what the panel may
 * actually claim.
 */

export interface VarianceReading {
  /** Largest movement between any two consecutive scored points, any group. */
  swing: number;
  /** Whether that movement clears the judge noise band. */
  beyondNoise: boolean;
  /** Smallest and largest trace count among the scored runs. */
  minTraces: number;
  maxTraces: number;
  /**
   * True when the runs are not like-for-like — some point rests on a much
   * thinner sample than another, so a difference between them may be a
   * change of population rather than a change in the agent.
   */
  unevenSamples: boolean;
  /** Runs resting on a single trace. These cannot show variance at all. */
  singleTraceRuns: number;
}

/** Below this ratio between the smallest and largest run, points are not peers. */
export const EVEN_SAMPLE_RATIO = 0.5;

const meanFor = (run: AnalyticsEvalRun, group: MetricGroup): number | null =>
  run.group_means?.[group] ?? null;

export function varianceReading(
  points: AnalyticsEvalRun[],
  groups: MetricGroup[],
): VarianceReading {
  const counts = points.map((p) => p.trace_count ?? 0);
  const minTraces = counts.length ? Math.min(...counts) : 0;
  const maxTraces = counts.length ? Math.max(...counts) : 0;

  let swing = 0;
  for (const group of groups) {
    const series = points.map((p) => meanFor(p, group));
    for (let i = 1; i < series.length; i += 1) {
      // Adjacent in run order, not adjacent after compaction. Dropping the
      // nulls first would join runs 4 and 6 across a run that measured
      // nothing and report the join as a step — the chart breaks that line
      // (`connectNulls: false`) and the number beside it must agree.
      const [prev, curr] = [series[i - 1], series[i]];
      if (prev === null || curr === null) continue;
      swing = Math.max(swing, Math.abs(curr - prev));
    }
  }

  return {
    swing,
    beyondNoise: swing > JUDGE_NOISE,
    minTraces,
    maxTraces,
    // Zero traces means the server told us nothing about sample size, which
    // is not evidence that the runs were even.
    unevenSamples:
      maxTraces > 0 && minTraces / maxTraces < EVEN_SAMPLE_RATIO,
    singleTraceRuns: counts.filter((c) => c === 1).length,
  };
}

/**
 * The caption, derived rather than fixed.
 *
 * Ordered by what would mislead a reader fastest: an uneven sample is worse
 * than a large swing, because a large swing on comparable runs is real
 * information whereas a large swing across different populations is not
 * information at all.
 */
export function varianceCaption(
  reading: VarianceReading,
  judged: boolean,
): string {
  const parts: string[] = [];

  if (reading.unevenSamples) {
    parts.push(
      `These runs measured different numbers of traces (${reading.minTraces} to ${reading.maxTraces}), so the points are not like-for-like — a step between two of them can be a change of sample rather than a change in the agent.`,
    );
    if (reading.singleTraceRuns > 0) {
      parts.push(
        `${reading.singleTraceRuns} ${reading.singleTraceRuns === 1 ? "run covers" : "runs cover"} a single trace and cannot show variance at all.`,
      );
    }
  } else {
    parts.push("Variance, not trend.");
  }

  if (judged) {
    parts.push(
      reading.beyondNoise
        ? `The largest step is ${reading.swing.toFixed(3)}, beyond the ±${JUDGE_NOISE} swing expected between judged runs on identical input.`
        : `A ±${JUDGE_NOISE} swing between runs on identical input is expected from the judged group; the others are measured, not judged.`,
    );
  } else {
    parts.push("These groups are measured, not judged.");
  }

  return parts.join(" ");
}
