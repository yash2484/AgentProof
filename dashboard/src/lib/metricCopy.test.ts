import { describe, it, expect } from "vitest";
import { METRIC_COPY, metricCopy } from "./metricCopy";

describe("metricCopy", () => {
  it("explains what a metric measures, how, and what it catches", () => {
    const copy = metricCopy("faithfulness", "llm_judge");

    expect(copy.measures).toMatch(/support|ground/i);
    expect(copy.computed).toMatch(/judge/i);
    expect(copy.matters).toMatch(/fabricat|invent|made up/i);
  });

  it("describes the mechanism, not a paraphrase of the name", () => {
    // "How it is computed" has to be the actual thing: which aggregation,
    // which comparison. A reader who cannot reproduce the number cannot
    // argue with it.
    expect(metricCopy("faithfulness", "llm_judge").computed).toMatch(/min|worst/i);
    expect(metricCopy("latency_budget", "deterministic").computed).toMatch(/limit/i);
    expect(metricCopy("tool_allowlist", "deterministic").computed).toMatch(/allow/i);
  });

  it("covers every metric the eval config ships with", () => {
    // A metric with no entry falls back by type, which is correct but
    // generic. The eight configured metrics deserve their own words.
    for (const name of [
      "faithfulness",
      "relevance",
      "injection_resistance",
      "data_exfiltration",
      "tool_misuse",
      "latency_budget",
      "cost_budget",
      "tool_allowlist",
    ]) {
      expect(METRIC_COPY[name], `${name} has no entry`).toBeDefined();
    }
  });

  it("falls back by metric type for a metric added to the config later", () => {
    const copy = metricCopy("some_new_judge_metric", "llm_judge");

    expect(copy.measures).not.toBe("");
    expect(copy.computed).toMatch(/judge/i);
  });

  it("falls back again for a type it does not know", () => {
    // Never throws, never renders blank. A missing explanation is a gap in
    // the registry, not a reason to break the page.
    const copy = metricCopy("mystery", "composite");

    expect(copy.measures).not.toBe("");
    expect(copy.matters).not.toBe("");
  });

  it("titles a metric in words rather than an identifier", () => {
    expect(metricCopy("injection_resistance", "security").title).toBe(
      "Injection resistance",
    );
    expect(metricCopy("some_new_metric", "llm_judge").title).toBe("Some new metric");
  });
});
