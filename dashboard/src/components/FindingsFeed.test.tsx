import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics, emptyAnalytics } from "../test/fixtures";
import { FindingsFeed, buildFindings } from "./FindingsFeed";

describe("buildFindings", () => {
  it("leaves clear metrics out — a pass is not a finding", () => {
    const names = buildFindings(sampleAnalytics).map((f) => f.metric.metric_name);
    expect(names).not.toContain("cost_budget");
    expect(names).not.toContain("tool_misuse");
  });

  it("keeps flagged metrics", () => {
    const names = buildFindings(sampleAnalytics).map((f) => f.metric.metric_name);
    expect(names).toContain("faithfulness");
    expect(names).toContain("injection_resistance");
  });

  it("ranks the most serious first", () => {
    const findings = buildFindings(sampleAnalytics);
    const ranks = findings.map((f) => f.severity);
    expect(ranks).toEqual([...ranks].sort((a, b) =>
      ["serious", "watch", "degraded", "clear"].indexOf(a) -
      ["serious", "watch", "degraded", "clear"].indexOf(b),
    ));
  });

  it("has nothing to report on a fresh install", () => {
    expect(buildFindings(emptyAnalytics)).toEqual([]);
  });
});

describe("FindingsFeed", () => {
  it("states the fraction on every finding", () => {
    renderWithProviders(<FindingsFeed analytics={sampleAnalytics} project="demo" />);
    expect(screen.getByTestId("finding-injection_resistance")).toHaveTextContent(
      "1 of 35 measurements flagged",
    );
  });

  it("links each finding straight to that metric's own page", () => {
    // Not to a filtered list: the reader has already chosen what to look at.
    renderWithProviders(<FindingsFeed analytics={sampleAnalytics} project="demo" />);
    const link = screen.getByTestId("finding-faithfulness").querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/evals/faithfulness?project=demo&days=30",
    );
  });

  it("carries the window into the link so the two pages agree", () => {
    renderWithProviders(
      <FindingsFeed analytics={{ ...sampleAnalytics, days: 0 }} project="demo" />,
    );
    const link = screen.getByTestId("finding-faithfulness").querySelector("a");
    expect(link?.getAttribute("href")).toContain("days=0");
  });

  it("does not call an empty feed a pass", () => {
    renderWithProviders(<FindingsFeed analytics={emptyAnalytics} />);
    expect(screen.getByTestId("findings-empty")).toHaveTextContent(
      "not about what was never tested",
    );
  });
});
