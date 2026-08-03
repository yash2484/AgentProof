import { describe, it, expect } from "vitest";
import {
  formatPct,
  formatScore,
  gateStatus,
  isHeld,
  metricByName,
  securityVerdict,
} from "./overview";
import { sampleSummary, emptySummary } from "../test/fixtures";
import type { EvalSummary, EvalSummaryMetric } from "../types";

function metric(partial: Partial<EvalSummaryMetric> & { metric_name: string }): EvalSummaryMetric {
  return {
    mean_score: 1,
    pass_rate: 1,
    count: 10,
    last_evaluated_at: "2026-08-02T10:00:00.000Z",
    ...partial,
  };
}

function summary(metrics: EvalSummaryMetric[]): EvalSummary {
  return { project: "demo", trace_count: 10, overall_pass_rate: 1, p99_latency_ms: 100, metrics };
}

describe("isHeld", () => {
  it("holds when nothing on record failed", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: 1 }))).toBe(true);
  });

  it("does not hold on a single failure", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: 0.99 }))).toBe(false);
  });

  it("does not hold when the pass rate is unknown", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: null }))).toBe(false);
  });
});

describe("gateStatus", () => {
  it("passes only when every metric held", () => {
    const g = gateStatus(summary([metric({ metric_name: "a" }), metric({ metric_name: "b" })]));
    expect(g).toMatchObject({ passed: true, held: 2, total: 2, label: "2/2 held" });
  });

  it("fails when any metric regressed", () => {
    const g = gateStatus(
      summary([metric({ metric_name: "a" }), metric({ metric_name: "b", pass_rate: 0.5 })]),
    );
    expect(g).toMatchObject({ passed: false, held: 1, total: 2, label: "1/2 held" });
  });

  it("does not claim a pass with no metrics at all", () => {
    expect(gateStatus(emptySummary)).toMatchObject({ passed: false, held: 0, total: 0 });
  });

  it("tolerates an undefined summary", () => {
    expect(gateStatus(undefined)).toMatchObject({ passed: false, held: 0, total: 0 });
  });
});

describe("securityVerdict", () => {
  it("reports resistance holding when every security metric held", () => {
    const v = securityVerdict(
      summary([
        metric({ metric_name: "injection_resistance" }),
        metric({ metric_name: "data_exfiltration" }),
      ]),
    );
    expect(v.tone).toBe("pass");
    expect(v.headline).toMatch(/held/i);
  });

  it("names the failing metric when one regressed", () => {
    const v = securityVerdict(
      summary([
        metric({ metric_name: "injection_resistance", pass_rate: 0.4 }),
        metric({ metric_name: "data_exfiltration" }),
      ]),
    );
    expect(v.tone).toBe("fail");
    expect(v.headline).toContain("injection_resistance");
  });

  it("stays neutral when no security metric has run", () => {
    const v = securityVerdict(summary([metric({ metric_name: "answer_relevance" })]));
    expect(v.tone).toBe("neutral");
    expect(v.headline).toMatch(/no security/i);
  });

  it("stays neutral for an empty project", () => {
    expect(securityVerdict(emptySummary).tone).toBe("neutral");
  });
});

describe("metricByName", () => {
  it("finds a metric in the summary", () => {
    expect(metricByName(sampleSummary, "data_exfiltration")?.count).toBe(247);
  });

  it("returns undefined for an absent metric or summary", () => {
    expect(metricByName(sampleSummary, "nope")).toBeUndefined();
    expect(metricByName(undefined, "data_exfiltration")).toBeUndefined();
  });
});

describe("formatters", () => {
  it("renders scores to two places and null as an em dash", () => {
    expect(formatScore(0.9)).toBe("0.90");
    expect(formatScore(null)).toBe("—");
  });

  it("renders percentages as whole numbers and null as an em dash", () => {
    expect(formatPct(0.94)).toBe("94%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(null)).toBe("—");
  });
});
