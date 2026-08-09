import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics } from "../test/fixtures";
import { VariancePanel } from "./VariancePanel";

const runs = sampleAnalytics.eval_runs;

describe("VariancePanel", () => {
  it("holds the slot when nothing has run, so nothing shifts later", () => {
    renderWithProviders(<VariancePanel runs={[]} />);
    expect(screen.getByTestId("variance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("variance-empty")).toBeInTheDocument();
  });

  it("says one run is not variance", () => {
    renderWithProviders(<VariancePanel runs={runs.slice(0, 1)} />);
    expect(screen.getByTestId("variance-single")).toHaveTextContent("Variance needs a second");
  });

  it("draws two runs as a paired slope, not a trend line", () => {
    // Two points are a line segment; a trend line invites extrapolation the
    // data cannot support.
    renderWithProviders(<VariancePanel runs={runs.slice(0, 2)} />);
    expect(screen.getByTestId("paired-slope")).toBeInTheDocument();
    expect(screen.queryByTestId("variance-trend")).not.toBeInTheDocument();
  });

  it("states the delta between the two runs", () => {
    renderWithProviders(<VariancePanel runs={runs.slice(0, 2)} />);
    expect(screen.getByTestId("paired-delta")).toHaveTextContent("0.000 between runs");
  });

  it("reads a delta against the judge swing rather than in isolation", () => {
    renderWithProviders(<VariancePanel runs={[runs[0], runs[3]]} />);
    // 0.75 -> 0.977 is 0.227, just past the measured ±0.2 swing.
    expect(screen.getByTestId("paired-delta")).toHaveTextContent(
      "larger than the ±0.2 judge swing",
    );
  });

  it("promotes to a trend only at three runs", () => {
    renderWithProviders(<VariancePanel runs={runs} />);
    expect(screen.getByTestId("variance-trend")).toBeInTheDocument();
    expect(screen.queryByTestId("paired-slope")).not.toBeInTheDocument();
  });

  it("calls it variance, never trend", () => {
    const { container } = renderWithProviders(<VariancePanel runs={runs} />);
    expect(container.textContent).toContain("Variance, not trend");
  });

  it("ignores runs that scored nothing rather than plotting them as zero", () => {
    renderWithProviders(
      <VariancePanel runs={[{ ...runs[0], mean_score: null }, runs[1]]} />,
    );
    expect(screen.getByTestId("variance-single")).toBeInTheDocument();
  });
});
