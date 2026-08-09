import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics } from "../test/fixtures";
import { MetricStrip, deltaVsPreviousRun } from "./MetricStrip";

describe("deltaVsPreviousRun", () => {
  const runs = [
    { run_at: "a", trace_count: 1, degraded: 0, group_means: {}, metric_means: { faithfulness: 0.9 } },
    { run_at: "b", trace_count: 1, degraded: 0, group_means: {}, metric_means: { faithfulness: 0.78 } },
  ];

  it("compares the last two runs that measured the metric", () => {
    expect(deltaVsPreviousRun(runs, "faithfulness")).toBeCloseTo(-0.12, 5);
  });

  it("has no delta from a single run", () => {
    expect(deltaVsPreviousRun(runs.slice(0, 1), "faithfulness")).toBeNull();
  });

  it("has no delta for a metric that never ran", () => {
    expect(deltaVsPreviousRun(runs, "not_a_metric")).toBeNull();
  });

  it("skips runs that did not measure the metric rather than reading a gap as a fall", () => {
    // A run where every judge call broke has no entry for the metric. Treating
    // that as 0 would draw a cliff and then a recovery, neither of which
    // happened.
    const withGap = [
      runs[0],
      { run_at: "b", trace_count: 1, degraded: 8, group_means: {}, metric_means: {} },
      runs[1],
    ];

    expect(deltaVsPreviousRun(withGap, "faithfulness")).toBeCloseTo(-0.12, 5);
  });
});

describe("MetricStrip", () => {
  const props = {
    metrics: sampleAnalytics.metric_health,
    runs: sampleAnalytics.eval_runs,
    gate: sampleAnalytics.gate,
  };

  it("groups the metrics under their group's question", () => {
    renderWithProviders(<MetricStrip {...props} />);

    expect(screen.getByText(/Answer quality/)).toBeInTheDocument();
    expect(screen.getByText(/grounded in what it retrieved/i)).toBeInTheDocument();
    expect(screen.getByText(/give ground under attack/i)).toBeInTheDocument();
  });

  it("gives every metric a tile carrying its current value and denominator", () => {
    renderWithProviders(<MetricStrip {...props} />);

    const tile = screen.getByTestId("metric-tile-faithfulness");
    expect(tile).toHaveTextContent("0.922");
    expect(tile).toHaveTextContent("of 26");
  });

  it("links each tile to that metric's own page", () => {
    renderWithProviders(<MetricStrip {...props} />);

    expect(screen.getByTestId("metric-tile-faithfulness")).toHaveAttribute(
      "href",
      "/evals/faithfulness",
    );
  });

  it("carries the scope into the link so the detail page cannot disagree", () => {
    // Clicking a tile that says "2 of 27" must not land on a page that says
    // 321 because it defaulted to a different window and every project.
    renderWithProviders(
      <MetricStrip {...props} project="demo-research-agent" days={30} />,
    );

    expect(screen.getByTestId("metric-tile-faithfulness")).toHaveAttribute(
      "href",
      "/evals/faithfulness?project=demo-research-agent&days=30",
    );
  });

  it("omits the project from the link when the scope really is every project", () => {
    renderWithProviders(<MetricStrip {...props} days={7} />);

    expect(screen.getByTestId("metric-tile-faithfulness")).toHaveAttribute(
      "href",
      "/evals/faithfulness?days=7",
    );
  });

  it("names the metric in the link text, not just in a colour", () => {
    // The group key is a colour; the tile must be readable without it.
    renderWithProviders(<MetricStrip {...props} />);

    expect(screen.getByTestId("metric-tile-faithfulness")).toHaveTextContent(
      "Faithfulness",
    );
  });

  it("states the direction of a change in words as well as a sign", () => {
    renderWithProviders(<MetricStrip {...props} />);

    // faithfulness moved 1.000 -> 0.922 between the last two runs.
    expect(screen.getByTestId("metric-delta-faithfulness")).toHaveTextContent(
      /down/i,
    );
  });

  it("says so rather than showing a dash when there is no previous run", () => {
    renderWithProviders(<MetricStrip {...props} runs={props.runs.slice(0, 1)} />);

    expect(screen.getByTestId("metric-delta-faithfulness")).toHaveTextContent(
      /first run/i,
    );
  });

  it("renders nothing rather than an empty frame when no metric has run", () => {
    renderWithProviders(<MetricStrip metrics={[]} runs={[]} gate={[]} />);

    expect(screen.queryByTestId("metric-strip")).not.toBeInTheDocument();
  });
});
