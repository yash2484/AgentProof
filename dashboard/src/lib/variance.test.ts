import { describe, it, expect } from "vitest";
import { varianceReading, varianceCaption, EVEN_SAMPLE_RATIO } from "./variance";
import type { AnalyticsEvalRun, MetricGroup } from "../types";

const run = (
  traces: number,
  group_means: AnalyticsEvalRun["group_means"],
): AnalyticsEvalRun => ({
  run_at: "2026-08-01T00:00:00.000Z",
  trace_count: traces,
  degraded: 0,
  group_means,
  metric_means: {},
});

const QUALITY: MetricGroup[] = ["quality"];

describe("varianceReading", () => {
  it("has nothing to read from no runs", () => {
    const reading = varianceReading([], QUALITY);
    expect(reading.swing).toBe(0);
    expect(reading.minTraces).toBe(0);
    expect(reading.maxTraces).toBe(0);
    expect(reading.unevenSamples).toBe(false);
    expect(reading.singleTraceRuns).toBe(0);
  });

  it("takes the largest step between consecutive runs, not first-to-last", () => {
    // 0.9 → 0.5 → 0.7. First-to-last is 0.2; the largest actual step is 0.4.
    const reading = varianceReading(
      [run(3, { quality: 0.9 }), run(3, { quality: 0.5 }), run(3, { quality: 0.7 })],
      QUALITY,
    );
    expect(reading.swing).toBeCloseTo(0.4, 10);
  });

  it("takes the largest step across every group, not just the first", () => {
    const reading = varianceReading(
      [
        run(3, { quality: 0.9, safety: 1.0 }),
        run(3, { quality: 0.88, safety: 0.4 }),
      ],
      ["quality", "safety"],
    );
    expect(reading.swing).toBeCloseTo(0.6, 10);
  });

  it("calls a step beyond the judge band what it is", () => {
    const reading = varianceReading(
      [run(3, { quality: 0.9 }), run(3, { quality: 0.5 })],
      QUALITY,
    );
    expect(reading.beyondNoise).toBe(true);
  });

  it("leaves a step inside the judge band uncalled", () => {
    const reading = varianceReading(
      [run(3, { quality: 0.9 }), run(3, { quality: 0.75 })],
      QUALITY,
    );
    expect(reading.beyondNoise).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // The denominator — what this module exists for
  // ---------------------------------------------------------------------------

  it("reads runs of the same size as like-for-like", () => {
    const reading = varianceReading(
      [run(13, { quality: 0.9 }), run(13, { quality: 0.5 })],
      QUALITY,
    );
    expect(reading.unevenSamples).toBe(false);
  });

  it("flags a one-trace run drawn beside a thirteen-trace run", () => {
    // The defect this module was written for: the chart drew a mean over n=1
    // and a mean over n=13 as consecutive points on one line.
    const reading = varianceReading(
      [run(13, { quality: 0.926 }), run(1, { quality: 0.35 }), run(13, { quality: 0.92 })],
      QUALITY,
    );
    expect(reading.unevenSamples).toBe(true);
    expect(reading.minTraces).toBe(1);
    expect(reading.maxTraces).toBe(13);
    expect(reading.singleTraceRuns).toBe(1);
  });

  it("counts every run resting on a single trace", () => {
    const reading = varianceReading(
      [run(13, { quality: 0.9 }), run(1, { quality: 0.3 }), run(1, { quality: 0.4 })],
      QUALITY,
    );
    expect(reading.singleTraceRuns).toBe(2);
  });

  it("holds the line exactly at the peer ratio", () => {
    // 7/14 is exactly EVEN_SAMPLE_RATIO. Equal is still peers.
    expect(EVEN_SAMPLE_RATIO).toBe(0.5);
    const reading = varianceReading(
      [run(14, { quality: 0.9 }), run(7, { quality: 0.5 })],
      QUALITY,
    );
    expect(reading.unevenSamples).toBe(false);
  });

  it("does not read a missing sample size as an even one", () => {
    // trace_count 0 means the server told us nothing, which is not evidence
    // that the runs were comparable.
    const reading = varianceReading(
      [run(0, { quality: 0.9 }), run(0, { quality: 0.5 })],
      QUALITY,
    );
    expect(reading.unevenSamples).toBe(false);
    expect(reading.maxTraces).toBe(0);
  });

  it("does not measure a step across a run that scored nothing", () => {
    // The chart draws these with connectNulls:false — the line breaks. A
    // swing that bridges the same gap contradicts the picture beside it and
    // reports a step between two runs that were never consecutive.
    const reading = varianceReading(
      [
        run(3, { quality: 0.9 }),
        run(3, { quality: null }),
        run(3, { quality: 0.3 }),
      ],
      QUALITY,
    );
    expect(reading.swing).toBe(0);
  });

  it("still measures the steps either side of a gap", () => {
    const reading = varianceReading(
      [
        run(3, { quality: 0.9 }),
        run(3, { quality: 0.8 }),
        run(3, { quality: null }),
        run(3, { quality: 0.3 }),
        run(3, { quality: 0.6 }),
      ],
      QUALITY,
    );
    expect(reading.swing).toBeCloseTo(0.3, 10);
  });
});

describe("varianceCaption", () => {
  const even = varianceReading(
    [run(13, { quality: 0.95 }), run(13, { quality: 0.9 })],
    QUALITY,
  );
  const uneven = varianceReading(
    [run(13, { quality: 0.926 }), run(1, { quality: 0.35 })],
    QUALITY,
  );

  it("calls comparable runs variance, not trend", () => {
    expect(varianceCaption(even, true)).toContain("Variance, not trend");
  });

  it("refuses to call uneven runs variance at all", () => {
    // "Variance, not trend" claims the movement is noise around one quantity.
    // Across different populations there is no such quantity to be noisy.
    const caption = varianceCaption(uneven, true);
    expect(caption).not.toContain("Variance, not trend");
    expect(caption).toContain("not like-for-like");
  });

  it("states the range of sample sizes so the reader can check it", () => {
    expect(varianceCaption(uneven, true)).toContain("1 to 13");
  });

  it("says a single-trace run cannot show variance", () => {
    expect(varianceCaption(uneven, true)).toContain("cannot show variance at all");
  });

  it("counts single-trace runs in the plural", () => {
    const three = varianceReading(
      [
        run(13, { quality: 0.9 }),
        run(1, { quality: 0.3 }),
        run(1, { quality: 0.4 }),
        run(1, { quality: 0.5 }),
      ],
      QUALITY,
    );
    expect(varianceCaption(three, true)).toContain("3 runs cover a single trace");
  });

  it("names the measured swing when it clears the judge band", () => {
    const big = varianceReading(
      [run(13, { quality: 0.95 }), run(13, { quality: 0.5 })],
      QUALITY,
    );
    expect(varianceCaption(big, true)).toContain("0.450");
  });

  it("claims no judge band when nothing in the window was judged", () => {
    const caption = varianceCaption(even, false);
    expect(caption).toContain("measured, not judged");
    expect(caption).not.toContain("expected");
  });
});
