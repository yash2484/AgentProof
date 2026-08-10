import { describe, expect, it } from "vitest";
import { provenanceOf, provenanceSentence } from "./provenance";
import type { MetricHealth } from "../types";

function metric(over: Partial<MetricHealth> = {}): MetricHealth {
  return {
    metric_name: "faithfulness",
    metric_type: "llm_judge",
    group: "quality",
    mean_score: 0.82,
    std: 0.17,
    pass_rate: 0.79,
    threshold: 0.7,
    count: 50,
    failed: 0,
    degraded: 0,
    has_variance: true,
    ci_block: true,
    ...over,
  } as MetricHealth;
}

describe("how a number was produced", () => {
  it("counts judged measurements separately from measured ones", () => {
    // The distinction that matters more than real-vs-generated: a judged score
    // has a model in the loop and a ±0.2 swing; a budget check is arithmetic
    // over recorded spans.
    const p = provenanceOf({
      metrics: [
        metric({ count: 50 }),
        metric({ metric_name: "cost_budget", group: "budgets", count: 104 }),
        metric({ metric_name: "tool_misuse", group: "safety", count: 104 }),
      ],
      generated: false,
    });

    expect(p.judged).toBe(50);
    expect(p.measured).toBe(208);
  });

  it("counts broken measurements without folding them into either", () => {
    const p = provenanceOf({
      metrics: [metric({ count: 50, degraded: 12 })],
      generated: false,
    });

    expect(p.judged).toBe(50);
    expect(p.broken).toBe(12);
  });

  it("reports everything as authored when the corpus is generated", () => {
    // synthetic-showcase has raw_judge_output NULL on all 2400 of its rows.
    // No judge was ever called, so calling any of it "judged" would be false.
    const p = provenanceOf({
      metrics: [metric({ count: 600 }), metric({ group: "budgets", count: 900 })],
      generated: true,
    });

    expect(p.authored).toBe(1500);
    expect(p.judged).toBe(0);
    expect(p.measured).toBe(0);
  });
});

describe("the sentence a reader sees", () => {
  it("leads with the warning when the figures are authored", () => {
    const sentence = provenanceSentence(
      provenanceOf({ metrics: [metric({ count: 600 })], generated: true }),
    );

    expect(sentence).toMatch(/not evidence|never evidence/i);
    expect(sentence).toMatch(/600/);
  });

  it("distinguishes the two trustworthy classes for a measured corpus", () => {
    const sentence = provenanceSentence(
      provenanceOf({
        metrics: [
          metric({ count: 50 }),
          metric({ group: "budgets", count: 222 }),
        ],
        generated: false,
      }),
    );

    expect(sentence).toMatch(/222/);
    expect(sentence).toMatch(/50/);
    expect(sentence).toMatch(/judge/i);
  });

  it("never calls a generated corpus measured", () => {
    const sentence = provenanceSentence(
      provenanceOf({ metrics: [metric({ count: 10 })], generated: true }),
    );

    expect(sentence.toLowerCase()).not.toMatch(/\bmeasured\b/);
  });
});
