import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics, emptyAnalytics } from "../test/fixtures";
import { MetricHealthPanel } from "./MetricHealthPanel";

describe("MetricHealthPanel", () => {
  it("keeps every metric visible, in one register or the other", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    for (const m of sampleAnalytics.metric_health) {
      expect(
        screen.queryByTestId(`metric-row-${m.metric_name}`) ??
          screen.queryByTestId(`ceiling-row-${m.metric_name}`),
      ).toBeInTheDocument();
    }
  });

  it("puts metrics that never varied on the ceiling strip, not among the healthy", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    // Pinned at 1.000 because nothing stresses them.
    expect(screen.getByTestId("ceiling-row-cost_budget")).toBeInTheDocument();
    expect(screen.getByTestId("ceiling-row-tool_misuse")).toBeInTheDocument();
    expect(screen.queryByTestId("metric-row-cost_budget")).not.toBeInTheDocument();
  });

  it("gives metrics that move the full distribution", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("metric-row-faithfulness")).toBeInTheDocument();
    expect(screen.getByTestId("distribution-faithfulness")).toBeInTheDocument();
  });

  it("says no variance was observed rather than showing a pass", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("variance-label-cost_budget")).toHaveTextContent(
      "no variance observed",
    );
  });

  it("marks the ceiling strip with how many metrics never moved", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("ceiling-strip")).toHaveTextContent(
      "5 of 8 metrics never moved",
    );
  });

  it("carries an n-count so the reader knows how much evidence there is", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    const row = screen.getByTestId("ceiling-row-cost_budget");
    // Eval rows, not traces: 25 traces produced 35 measurements of a
    // deterministic metric, and "n=35" next to "25 traces" needs the noun.
    expect(row).toHaveTextContent("n=35 measurements");
  });

  it("expands a ceiling metric into the full treatment on request", async () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    await userEvent.click(screen.getByTestId("ceiling-row-cost_budget"));
    expect(screen.getByTestId("distribution-cost_budget")).toBeInTheDocument();
  });

  it("draws the low-score tail rather than hiding it behind the mean", () => {
    // faithfulness means 0.922; two runs scored in the 0.3-0.4 band.
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("bucket-faithfulness-0.3")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-faithfulness-0.4")).toBeInTheDocument();
  });

  it("shows the judge noise band on judged metrics only", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("noise-band-faithfulness")).toBeInTheDocument();
    // injection_resistance is a security metric — it has no judge swing.
    expect(screen.queryByTestId("noise-band-injection_resistance")).not.toBeInTheDocument();
  });

  it("plots the threshold so a mean can be read against it", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("threshold-faithfulness")).toBeInTheDocument();
  });

  it("states one failure out of thirty-five, never a bare adjective", () => {
    renderWithProviders(<MetricHealthPanel analytics={sampleAnalytics} />);
    expect(screen.getByTestId("metric-row-injection_resistance")).toHaveTextContent(
      "1 of 35 measurements flagged",
    );
  });

  it("never says the agent gave ground under attack", () => {
    // The sentence this whole rework exists to delete.
    const { container } = renderWithProviders(
      <MetricHealthPanel analytics={sampleAnalytics} />,
    );
    expect(container.textContent).not.toMatch(/gave ground/i);
    expect(container.textContent).not.toMatch(/regressed/i);
  });

  it("says nothing ran rather than showing an empty pass", () => {
    renderWithProviders(<MetricHealthPanel analytics={emptyAnalytics} />);
    expect(screen.getByTestId("metric-health")).toHaveTextContent(
      "Nothing has been evaluated",
    );
  });
});
