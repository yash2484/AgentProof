import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, batchEvalResults, sparseBatchEvalResults } from "../test/fixtures";
import { ScoreTimeseries, seriesFromResults, thresholdsFor, runTimestamps } from "./ScoreTimeseries";
import { sampleMetrics } from "../test/fixtures";

describe("seriesFromResults", () => {
  it("groups points by metric name", () => {
    const series = seriesFromResults(sampleEvalResults);
    const names = series.map((s) => s.name).sort();
    expect(names).toEqual(["answer_relevance", "injection_resistance"]);
  });

  it("drops results without a score or timestamp", () => {
    const series = seriesFromResults([
      ...sampleEvalResults,
      { ...sampleEvalResults[0], metric_name: "x", score: null },
    ]);
    expect(series.find((s) => s.name === "x")).toBeUndefined();
  });
});

describe("thresholdsFor", () => {
  it("returns distinct thresholds for plotted metrics only", () => {
    const series = seriesFromResults(sampleEvalResults);
    // sample series: answer_relevance (0.7) + injection_resistance (0.8)
    expect(thresholdsFor(series, sampleMetrics.metrics)).toEqual([0.7, 0.8]);
  });
});

describe("ScoreTimeseries", () => {
  it("renders without crashing for valid data", () => {
    renderWithProviders(<ScoreTimeseries results={sampleEvalResults} metrics={sampleMetrics.metrics} />);
    expect(screen.getByTestId("score-timeseries")).toBeInTheDocument();
  });

  it("shows an empty message when no result has a score", () => {
    const unscored = sampleEvalResults.map((r) => ({ ...r, score: null }));
    renderWithProviders(<ScoreTimeseries results={unscored} />);
    expect(screen.getByText(/no scored results/i)).toBeInTheDocument();
  });
});

describe("run-index axis (regression: defect 2)", () => {
  it("collects distinct evaluation instants in ascending order", () => {
    const runs = runTimestamps(batchEvalResults);
    expect(runs).toHaveLength(3);
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
  });

  it("spreads a same-second batch across sequential run positions", () => {
    // The whole batch lands inside 20ms of wall-clock. On a time axis every
    // point piles into one tick; on a run-index axis they occupy 0, 1, 2.
    const series = seriesFromResults(batchEvalResults);
    const relevance = series.find((s) => s.name === "answer_relevance")!;
    expect(relevance.points.map((p) => p.runIndex)).toEqual([0, 1, 2]);
  });

  it("keeps the real timestamp on the point for the tooltip", () => {
    const series = seriesFromResults(batchEvalResults);
    const first = series[0].points[0];
    expect(first.at).toBe(Date.parse("2026-08-02T10:00:00.100Z"));
  });

  it("indexes every metric against the same shared run axis", () => {
    const series = seriesFromResults(sparseBatchEvalResults);
    const full = series.find((s) => s.name === "answer_relevance")!;
    const sparse = series.find((s) => s.name === "injection_resistance")!;

    expect(full.points.map((p) => p.runIndex)).toEqual([0, 1, 2]);
    // injection_resistance has no result for run 1. On the shared axis its
    // points keep positions 0 and 2, leaving a real gap. A per-metric axis
    // would renumber them to [0, 1] and silently close that gap.
    expect(sparse.points.map((p) => p.runIndex)).toEqual([0, 2]);
  });

  it("ignores results with no score when building the axis", () => {
    const runs = runTimestamps([
      ...batchEvalResults,
      { ...batchEvalResults[0], score: null, evaluated_at: "2030-01-01T00:00:00.000Z" },
    ]);
    expect(runs).toHaveLength(3);
  });
});

describe("ScoreTimeseries with a batch fixture", () => {
  it("still renders with the sample fixture", () => {
    renderWithProviders(
      <ScoreTimeseries results={batchEvalResults} metrics={sampleMetrics.metrics} />,
    );
    expect(screen.getByTestId("score-timeseries")).toBeInTheDocument();
  });
});
