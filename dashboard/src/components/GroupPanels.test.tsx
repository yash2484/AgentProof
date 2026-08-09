import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics } from "../test/fixtures";
import { BudgetsPanel, QualityPanel, SafetyPanel, lighten, seriesColor } from "./GroupPanels";
import type { MetricHealth } from "../types";

const pick = (...names: string[]) =>
  sampleAnalytics.metric_health.filter((m) => names.includes(m.metric_name));

const runs = sampleAnalytics.eval_runs;

describe("series colours", () => {
  it("leaves the first series as the group's own colour", () => {
    expect(seriesColor("quality", 0).toLowerCase()).toBe("#d6409f");
  });

  it("separates sibling series by lightness, not by opacity", () => {
    // On a dark surface a translucent line reads as the same colour dimmed
    // rather than as a second series. Two magenta lines at 100% and 62%
    // opacity were indistinguishable at chart scale.
    const [first, second] = [seriesColor("quality", 0), seriesColor("quality", 1)];

    expect(second).not.toBe(first);
    expect(second).not.toContain("rgba");
    // Mixed toward white, so every channel rises.
    expect(parseInt(second.slice(1, 3), 16)).toBeGreaterThan(
      parseInt(first.slice(1, 3), 16),
    );
  });

  it("keeps giving distinct colours past the end of the ramp", () => {
    expect(seriesColor("safety", 9)).toBe(seriesColor("safety", 3));
  });

  it("mixes to white at full amount and not at all at zero", () => {
    expect(lighten("#d6409f", 0).toLowerCase()).toBe("#d6409f");
    expect(lighten("#d6409f", 1)).toBe("#ffffff");
  });
});

describe("QualityPanel", () => {
  const metrics = pick("faithfulness", "relevance");

  it("leads with the question, then the statistic", () => {
    renderWithProviders(<QualityPanel metrics={metrics} runs={runs} />);

    const panel = screen.getByTestId("group-panel-quality");
    expect(panel).toHaveTextContent("Answer quality");
    expect(panel).toHaveTextContent(/grounded in what it retrieved/i);
  });

  it("draws one series per judged metric rather than one pooled line", () => {
    renderWithProviders(<QualityPanel metrics={metrics} runs={runs} />);

    const panel = screen.getByTestId("group-panel-quality");
    expect(panel).toHaveTextContent("Faithfulness");
    expect(panel).toHaveTextContent("Relevance");
  });

  it("carries the judge-noise caveat, because these are estimates", () => {
    renderWithProviders(<QualityPanel metrics={metrics} runs={runs} />);

    expect(screen.getByTestId("group-panel-quality")).toHaveTextContent("±0.2");
  });

  it("holds the slot with an explanation when nothing judged has run", () => {
    renderWithProviders(<QualityPanel metrics={[]} runs={[]} />);

    expect(screen.getByTestId("group-empty-quality")).toBeInTheDocument();
  });
});

describe("SafetyPanel", () => {
  const metrics = pick("injection_resistance", "data_exfiltration", "tool_misuse");

  it("leads with breaches as a count, never as a rate", () => {
    // 1 breach is 1 breach. A percentage invites "97% safe", which is not a
    // sentence anyone should be comfortable saying about a security control.
    renderWithProviders(<SafetyPanel metrics={metrics} />);

    const row = screen.getByTestId("prevalence-injection_resistance");
    expect(row).toHaveTextContent("1 of 35");
    expect(row).not.toHaveTextContent("%");
  });

  it("says clean rather than drawing an empty bar at zero", () => {
    renderWithProviders(<SafetyPanel metrics={pick("tool_misuse")} />);

    expect(screen.getByTestId("prevalence-tool_misuse")).toHaveTextContent(
      /no breaches/i,
    );
  });

  it("distinguishes a clean run from an untested one", () => {
    // The honesty rule from the Overview's ceiling strip: a metric that never
    // varied has not been shown to work, it has been shown to be unexercised.
    renderWithProviders(<SafetyPanel metrics={pick("tool_misuse")} />);

    expect(screen.getByTestId("group-panel-safety")).toHaveTextContent(
      /never varied|not been stressed|unexercised/i,
    );
  });

  it("holds the slot when no security metric has run", () => {
    renderWithProviders(<SafetyPanel metrics={[]} />);

    expect(screen.getByTestId("group-empty-safety")).toBeInTheDocument();
  });
});

describe("BudgetsPanel", () => {
  const metrics = pick("latency_budget", "cost_budget", "tool_allowlist");

  it("reports compliance as a rate with its denominator", () => {
    renderWithProviders(<BudgetsPanel metrics={metrics} />);

    const row = screen.getByTestId("compliance-cost_budget");
    expect(row).toHaveTextContent("35 of 35");
    expect(row).toHaveTextContent("100.0%");
  });

  it("says these are measured, not judged", () => {
    // No ±0.2 band here. A latency reading is a fact.
    const panel = () => screen.getByTestId("group-panel-budgets");
    renderWithProviders(<BudgetsPanel metrics={metrics} />);

    expect(panel()).not.toHaveTextContent("±0.2");
    expect(panel()).toHaveTextContent(/measured, not judged/i);
  });

  it("admits that a pass rate hides the margin", () => {
    // "97% within budget" hides how close the other 3% ran to the edge, and
    // the underlying quantity is not aggregated yet.
    renderWithProviders(<BudgetsPanel metrics={metrics} />);

    expect(screen.getByTestId("group-panel-budgets")).toHaveTextContent(/margin/i);
  });

  it("holds the slot when no budget has run", () => {
    renderWithProviders(<BudgetsPanel metrics={[] as MetricHealth[]} />);

    expect(screen.getByTestId("group-empty-budgets")).toBeInTheDocument();
  });
});
