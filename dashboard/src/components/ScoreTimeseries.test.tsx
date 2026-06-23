import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults } from "../test/fixtures";
import { ScoreTimeseries, seriesFromResults } from "./ScoreTimeseries";

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

describe("ScoreTimeseries", () => {
  it("renders without crashing for valid data", () => {
    renderWithProviders(<ScoreTimeseries results={sampleEvalResults} />);
    expect(screen.getByTestId("score-timeseries")).toBeInTheDocument();
  });
});
