import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults } from "../test/fixtures";
import { ScoreTimeseries, seriesFromResults, thresholdsFor } from "./ScoreTimeseries";
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
