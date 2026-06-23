import { describe, it, expect } from "vitest";
import { sampleTrace, sampleSpanTree, sampleEvalResults, sampleMetrics } from "../test/fixtures";

describe("domain fixtures conform to types", () => {
  it("trace has the contract keys", () => {
    expect(Object.keys(sampleTrace)).toEqual(
      expect.arrayContaining([
        "trace_id", "project", "name", "status", "total_cost_usd", "created_at",
      ]),
    );
  });

  it("span tree nests children with parent links", () => {
    const root = sampleSpanTree[0];
    expect(root.children.length).toBe(2);
    expect(root.children[0].parent_span_ids).toContain(root.span_id);
  });

  it("eval results include a security metric", () => {
    expect(sampleEvalResults.some((r) => r.metric_type === "security")).toBe(true);
  });

  it("metrics list flags security metrics", () => {
    expect(sampleMetrics.metrics.filter((m) => m.type === "security").length).toBe(3);
  });
});
