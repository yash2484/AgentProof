import { describe, it, expect } from "vitest";
import {
  OUTCOME_FILTERS,
  outcomeColor,
  outcomeLabel,
  worstMetricLabel,
} from "./outcome";
import type { EvalOutcome } from "../types";

const outcome = (o: Partial<EvalOutcome> = {}): EvalOutcome => ({
  total: 8,
  passed: 8,
  failed: 0,
  degraded: 0,
  worst_metric: "cost_budget",
  worst_score: 1,
  outcome: "passed",
  ...o,
});

describe("outcomeLabel", () => {
  it("states the fraction rather than a bare verdict", () => {
    expect(outcomeLabel(outcome())).toBe("8/8 passed");
  });

  it("leads with the failures when there are any", () => {
    expect(
      outcomeLabel(outcome({ failed: 2, passed: 6, outcome: "failed" })),
    ).toBe("2 of 8 failed");
  });

  it("counts broken measurements apart from failures", () => {
    expect(
      outcomeLabel(
        outcome({ total: 6, passed: 6, degraded: 2, outcome: "degraded" }),
      ),
    ).toBe("6/6 passed · 2 unmeasurable");
  });

  it("says not evaluated rather than showing zeroes", () => {
    // A trace nobody measured is not a passing trace, and "0/0" would read
    // as one at a glance.
    expect(
      outcomeLabel(
        outcome({ total: 0, passed: 0, worst_metric: null, outcome: "not_evaluated" }),
      ),
    ).toBe("not evaluated");
  });

  it("does not claim a pass when everything broke", () => {
    const label = outcomeLabel(
      outcome({ total: 0, passed: 0, degraded: 3, outcome: "degraded" }),
    );

    expect(label).toMatch(/3 unmeasurable/);
    expect(label).not.toMatch(/passed/);
  });
});

describe("worstMetricLabel", () => {
  it("names the metric and its score", () => {
    expect(worstMetricLabel(outcome({ worst_metric: "faithfulness", worst_score: 0.35 })))
      .toBe("Faithfulness 0.350");
  });

  it("has nothing to name when nothing was scored", () => {
    expect(worstMetricLabel(outcome({ worst_metric: null, worst_score: null }))).toBe("—");
  });
});

describe("outcomeColor", () => {
  it("reserves the failure colour for actual failures", () => {
    expect(outcomeColor("failed")).not.toBe(outcomeColor("degraded"));
    expect(outcomeColor("degraded")).not.toBe(outcomeColor("passed"));
  });

  it("does not colour an unevaluated trace as passing", () => {
    expect(outcomeColor("not_evaluated")).not.toBe(outcomeColor("passed"));
  });
});

describe("OUTCOME_FILTERS", () => {
  it("offers the questions the page exists to answer", () => {
    expect(OUTCOME_FILTERS.map((f) => f.value)).toEqual([
      "",
      "failed",
      "degraded",
      "passed",
      "not_evaluated",
    ]);
  });

  it("puts failures first, because that is what a reader came for", () => {
    expect(OUTCOME_FILTERS[1].value).toBe("failed");
  });
});
