import { describe, it, expect } from "vitest";
import { computeWaterfall, MIN_WIDTH_PCT } from "./waterfall";
import type { SpanNode } from "../types";

function span(partial: Partial<SpanNode> & { span_id: string }): SpanNode {
  return {
    trace_id: "t",
    parent_span_ids: [],
    span_type: "llm_call",
    name: partial.span_id,
    start_time: null,
    end_time: null,
    latency_ms: null,
    status: "ok",
    error_message: null,
    metadata: {},
    tags: {},
    children: [],
    ...partial,
  };
}

describe("computeWaterfall", () => {
  it("places a single span across the full width", () => {
    const roots = [span({ span_id: "a", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:01Z" })];
    const rows = computeWaterfall(roots);
    expect(rows).toHaveLength(1);
    expect(rows[0].offsetPct).toBe(0);
    expect(rows[0].widthPct).toBe(100);
    expect(rows[0].depth).toBe(0);
  });

  it("positions a sequential second span at the midpoint", () => {
    const roots = [
      span({ span_id: "a", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:01Z" }),
      span({ span_id: "b", start_time: "2026-06-22T10:00:01Z", end_time: "2026-06-22T10:00:02Z" }),
    ];
    const rows = computeWaterfall(roots);
    const b = rows.find((r) => r.span.span_id === "b")!;
    expect(b.offsetPct).toBeCloseTo(50, 5);
    expect(b.widthPct).toBeCloseTo(50, 5);
  });

  it("increments depth for nested children", () => {
    const roots = [
      span({
        span_id: "root",
        start_time: "2026-06-22T10:00:00Z",
        end_time: "2026-06-22T10:00:02Z",
        children: [span({ span_id: "child", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:01Z" })],
      }),
    ];
    const rows = computeWaterfall(roots);
    expect(rows.find((r) => r.span.span_id === "child")!.depth).toBe(1);
  });

  it("renders a multi-parent span once, at max depth", () => {
    const shared = span({ span_id: "shared", start_time: "2026-06-22T10:00:01Z", end_time: "2026-06-22T10:00:02Z" });
    const roots = [
      span({
        span_id: "root",
        start_time: "2026-06-22T10:00:00Z",
        end_time: "2026-06-22T10:00:02Z",
        children: [
          shared, // depth 1 via root
          span({
            span_id: "mid",
            start_time: "2026-06-22T10:00:00Z",
            end_time: "2026-06-22T10:00:02Z",
            children: [shared], // depth 2 via mid
          }),
        ],
      }),
    ];
    const rows = computeWaterfall(roots);
    const sharedRows = rows.filter((r) => r.span.span_id === "shared");
    expect(sharedRows).toHaveLength(1);
    expect(sharedRows[0].depth).toBe(2);
  });

  it("gives a zero-duration span the minimum width", () => {
    const roots = [
      span({ span_id: "a", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:02Z" }),
      span({ span_id: "z", start_time: "2026-06-22T10:00:01Z", end_time: "2026-06-22T10:00:01Z" }),
    ];
    const rows = computeWaterfall(roots);
    expect(rows.find((r) => r.span.span_id === "z")!.widthPct).toBe(MIN_WIDTH_PCT);
  });

  it("falls back to full width when the window is degenerate", () => {
    const roots = [span({ span_id: "a" })]; // no times
    const rows = computeWaterfall(roots);
    expect(rows[0]).toMatchObject({ offsetPct: 0, widthPct: 100 });
  });
});
