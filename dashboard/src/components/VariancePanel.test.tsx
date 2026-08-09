import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics } from "../test/fixtures";
import { VariancePanel, axisFloor } from "./VariancePanel";
import type { AnalyticsEvalRun } from "../types";

const runs = sampleAnalytics.eval_runs;

const run = (
  at: string,
  group_means: AnalyticsEvalRun["group_means"],
): AnalyticsEvalRun => ({ run_at: at, trace_count: 3, degraded: 0, group_means });

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

  it("promotes to a trend only at three runs", () => {
    renderWithProviders(<VariancePanel runs={runs} />);
    expect(screen.getByTestId("variance-trend")).toBeInTheDocument();
    expect(screen.queryByTestId("paired-slope")).not.toBeInTheDocument();
  });

  it("calls it variance, never trend", () => {
    const { container } = renderWithProviders(<VariancePanel runs={runs} />);
    expect(container.textContent).toContain("Variance, not trend");
  });

  // -------------------------------------------------------------------------
  // Per-group series — the correction this panel exists for
  // -------------------------------------------------------------------------
  //
  // Pooling eight metrics across three units turned a −0.15 drift in the
  // judged metrics into a flat 0.974 → 0.929 line, because six metrics pinned
  // at 1.000 diluted it. Measured on the synthetic corpus.

  it("names every group it draws, so the lines are readable without colour", () => {
    renderWithProviders(<VariancePanel runs={runs} />);
    const panel = screen.getByTestId("variance-panel");
    expect(panel).toHaveTextContent("Answer quality");
    expect(panel).toHaveTextContent("Adversarial safety");
    expect(panel).toHaveTextContent("Budgets & contracts");
  });

  it("never shows a single pooled score", () => {
    // The number that used to sit here averaged a judge score against a
    // breach flag. There is no such quantity.
    const { container } = renderWithProviders(<VariancePanel runs={runs} />);
    expect(container.textContent).not.toContain("mean score");
  });

  it("draws no series for a group nobody measured", () => {
    const only = [
      run("2026-08-01T00:00:00.000Z", { quality: 0.9, safety: null }),
      run("2026-08-02T00:00:00.000Z", { quality: 0.8, safety: null }),
      run("2026-08-03T00:00:00.000Z", { quality: 0.7, safety: null }),
    ];

    renderWithProviders(<VariancePanel runs={only} />);

    expect(screen.getByTestId("variance-panel")).toHaveTextContent("Answer quality");
    expect(screen.getByTestId("variance-panel")).not.toHaveTextContent("Adversarial safety");
  });

  it("states each group's delta separately across two runs", () => {
    const pair = [
      run("2026-08-01T00:00:00.000Z", { quality: 0.95, budgets: 1.0 }),
      run("2026-08-02T00:00:00.000Z", { quality: 0.7, budgets: 1.0 }),
    ];

    renderWithProviders(<VariancePanel runs={pair} />);

    expect(screen.getByTestId("paired-delta-quality")).toHaveTextContent("-0.250");
    expect(screen.getByTestId("paired-delta-budgets")).toHaveTextContent("+0.000");
  });

  it("reads a judged delta against the judge swing", () => {
    const pair = [
      run("2026-08-01T00:00:00.000Z", { quality: 0.95 }),
      run("2026-08-02T00:00:00.000Z", { quality: 0.7 }),
    ];

    renderWithProviders(<VariancePanel runs={pair} />);

    expect(screen.getByTestId("paired-delta-quality")).toHaveTextContent(
      "larger than the ±0.2 judge swing",
    );
  });

  it("does not claim judge noise on a deterministic group", () => {
    // A budget check is measured, not judged. Attaching a ±0.2 band to it
    // would invent uncertainty that is not there.
    const pair = [
      run("2026-08-01T00:00:00.000Z", { budgets: 1.0 }),
      run("2026-08-02T00:00:00.000Z", { budgets: 0.6 }),
    ];

    renderWithProviders(<VariancePanel runs={pair} />);

    expect(screen.getByTestId("paired-delta-budgets")).not.toHaveTextContent("judge swing");
  });

  it("shows each group's value on a single run rather than one number", () => {
    renderWithProviders(<VariancePanel runs={runs.slice(0, 1)} />);

    const single = screen.getByTestId("variance-single");
    expect(single).toHaveTextContent("Answer quality");
    expect(single).toHaveTextContent("Budgets & contracts");
  });

  // -------------------------------------------------------------------------
  // The axis
  // -------------------------------------------------------------------------
  //
  // Scores live in the top fifth of the range. On a 0–1 axis the measured
  // 0.925 → 0.785 drift renders as a hairline — the same invisibility the
  // pooled mean produced, arriving by a different route.

  describe("axisFloor", () => {
    it("drops to the tenth below the lowest point", () => {
      expect(axisFloor([0.925, 0.785, 0.86])).toBe(0.7);
    });

    it("still leaves a tenth of range when everything is pinned at 1.0", () => {
      expect(axisFloor([1, 1, 1])).toBe(0.9);
    });

    it("reaches zero when a score actually goes there", () => {
      expect(axisFloor([0.05, 0.9])).toBe(0);
    });

    it("has nothing to floor on an empty series", () => {
      expect(axisFloor([])).toBe(0);
    });
  });

  it("says so when the axis does not start at zero", () => {
    // A truncated axis exaggerates movement. It is the right call here, and
    // it has to be declared rather than discovered.
    renderWithProviders(<VariancePanel runs={runs} />);

    expect(screen.getByTestId("axis-note")).toHaveTextContent("starts at 0.90, not 0");
  });

  it("makes no axis claim when the axis is the full range", () => {
    const wide = [
      run("2026-08-01T00:00:00.000Z", { quality: 0.05 }),
      run("2026-08-02T00:00:00.000Z", { quality: 0.9 }),
      run("2026-08-03T00:00:00.000Z", { quality: 0.5 }),
    ];

    renderWithProviders(<VariancePanel runs={wide} />);

    expect(screen.queryByTestId("axis-note")).not.toBeInTheDocument();
  });

  it("skips a run that scored nothing rather than plotting it as zero", () => {
    // A run of six broken judge calls is a measurement failure. Zero would
    // draw a cliff that never happened.
    renderWithProviders(
      <VariancePanel runs={[{ ...runs[0], group_means: {} }, runs[1]]} />,
    );

    expect(screen.getByTestId("variance-single")).toBeInTheDocument();
  });
});
