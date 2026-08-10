import { describe, expect, it } from "vitest";
import { overviewVerdict } from "./verdict";
import type { GateVerdict, MetricHealth } from "../types";

/**
 * The Overview's thesis sentence.
 *
 * The page had no conclusion — five cards of equal weight and no statement of
 * what to take from them. These tests pin the sentence, because it is the one
 * piece of the page a reader is most likely to trust and repeat.
 */

function metric(over: Partial<MetricHealth> = {}): MetricHealth {
  return {
    metric_name: "faithfulness",
    metric_type: "llm_judge",
    group: "quality",
    mean_score: 0.82,
    std: 0.17,
    pass_rate: 0.79,
    threshold: 0.7,
    count: 92,
    failed: 0,
    degraded: 0,
    has_variance: true,
    ci_block: true,
    ...over,
  } as MetricHealth;
}

function gate(over: Partial<GateVerdict> = {}): GateVerdict {
  return {
    metric_name: "faithfulness",
    comparable: true,
    is_regression: false,
    p_value: 0.4,
    cohens_d: 0.1,
    reason: "",
    baseline_mean: 0.9,
    candidate_mean: 0.88,
    ...over,
  } as GateVerdict;
}

describe("nothing measured", () => {
  it("says so rather than reporting everything as clear", () => {
    const v = overviewVerdict({ metrics: [], gate: [], scored: 0 });

    expect(v.tone).toBe("unknown");
    expect(v.headline).toMatch(/nothing/i);
  });

  it("never claims a pass when no measurement exists", () => {
    const v = overviewVerdict({ metrics: [], gate: [], scored: 0 });

    expect(v.headline.toLowerCase()).not.toMatch(/clear|healthy|pass/);
  });
});

describe("a regression against the pinned baseline", () => {
  it("outranks every other signal, because it is the only claim about change", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 1, count: 92 })],
      gate: [gate({ is_regression: true, p_value: 0.001, cohens_d: 0.9 })],
      scored: 92,
    });

    expect(v.tone).toBe("serious");
    expect(v.headline).toMatch(/regress/i);
    expect(v.focus).toBe("faithfulness");
  });

  it("carries the statistics, so the claim can be checked", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 1 })],
      gate: [gate({ is_regression: true, p_value: 0.001, cohens_d: 0.9 })],
      scored: 92,
    });

    expect(v.detail).toContain("p=0.001");
    expect(v.detail).toContain("d=0.90");
  });
});

describe("failures without a baseline", () => {
  it("names the metric to open and gives it a denominator", () => {
    const v = overviewVerdict({
      metrics: [
        metric({ failed: 19, count: 92 }),
        metric({ metric_name: "relevance", failed: 0, count: 93 }),
      ],
      gate: [],
      scored: 185,
    });

    expect(v.focus).toBe("faithfulness");
    expect(v.detail).toContain("19 of 92");
  });

  it("counts metrics needing attention, not measurements", () => {
    const v = overviewVerdict({
      metrics: [
        metric({ failed: 19, count: 92 }),
        metric({ metric_name: "tool_misuse", group: "safety", failed: 4, count: 100 }),
      ],
      gate: [],
      scored: 192,
    });

    expect(v.headline).toMatch(/2 metrics/);
  });

  it("uses the singular for one metric", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 19, count: 92 })],
      gate: [],
      scored: 92,
    });

    expect(v.headline).toMatch(/1 metric\b/);
    expect(v.headline).not.toMatch(/metrics/);
  });

  it("ranks the metric with the most failures first", () => {
    const v = overviewVerdict({
      metrics: [
        metric({ metric_name: "relevance", failed: 4, count: 93 }),
        metric({ metric_name: "faithfulness", failed: 19, count: 92 }),
      ],
      gate: [],
      scored: 185,
    });

    expect(v.focus).toBe("faithfulness");
  });
});

describe("degraded measurements", () => {
  it("never counts a broken judge call as a failure", () => {
    // The rule the whole product exists to hold: a judge that errored failed
    // closed to 0.0, and reading that as a finding is the defect.
    const v = overviewVerdict({
      metrics: [metric({ failed: 0, degraded: 12, count: 80 })],
      gate: [],
      scored: 80,
    });

    expect(v.tone).not.toBe("serious");
    expect(v.headline).not.toMatch(/needs attention/);
  });

  it("still reports them, because a broken measurement is not a passing one", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 0, degraded: 12, count: 80 })],
      gate: [],
      scored: 80,
    });

    expect(v.detail).toMatch(/12/);
    expect(v.detail).toMatch(/broke|degraded|unmeasur/i);
  });
});

describe("all clear", () => {
  it("refuses to say everything passed while metrics sit unexercised", () => {
    // Six of eight metrics pinned at 1.000 because nothing stresses them.
    // "All clear" over that is laundering untested into passing.
    const v = overviewVerdict({
      metrics: [
        metric({ failed: 0, has_variance: true }),
        metric({ metric_name: "tool_allowlist", group: "budgets", failed: 0, has_variance: false }),
        metric({ metric_name: "cost_budget", group: "budgets", failed: 0, has_variance: false }),
      ],
      gate: [],
      scored: 276,
    });

    expect(v.tone).toBe("clear");
    expect(v.detail).toMatch(/2 of 3/);
    expect(v.detail).toMatch(/never (moved|varied)/i);
  });

  it("says so plainly when every metric genuinely moved and held", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 0, has_variance: true })],
      gate: [],
      scored: 92,
    });

    expect(v.tone).toBe("clear");
    expect(v.detail).not.toMatch(/never moved/i);
  });
});

describe("wording discipline", () => {
  it("only uses 'regressed' when a baseline comparison backs it", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 19, count: 92 })],
      gate: [],
      scored: 92,
    });

    expect(v.headline.toLowerCase()).not.toContain("regress");
    expect(v.detail.toLowerCase()).not.toContain("regress");
  });

  it("puts a denominator on every count it states", () => {
    const v = overviewVerdict({
      metrics: [metric({ failed: 19, count: 92 })],
      gate: [],
      scored: 92,
    });

    // "19" must never appear without "of 92" following it.
    expect(v.detail).toMatch(/19 of 92/);
  });
});
