import { describe, it, expect } from "vitest";
import { computeWaterfall, MIN_BAR_PX } from "./waterfall";
import type { SpanNode } from "../types";
import { replaySpanTree } from "../test/fixtures";

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

  it("reports a zero-duration span as zero width, leaving the floor to the renderer", () => {
    const roots = [
      span({ span_id: "a", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:02Z" }),
      span({ span_id: "z", start_time: "2026-06-22T10:00:01Z", end_time: "2026-06-22T10:00:01Z" }),
    ];
    const rows = computeWaterfall(roots);
    // The axis stays linearly truthful; Waterfall.tsx applies MIN_BAR_PX.
    expect(rows.find((r) => r.span.span_id === "z")!.widthPct).toBe(0);
  });

  it("falls back to full width when the window is degenerate", () => {
    const roots = [span({ span_id: "a" })]; // no times
    const rows = computeWaterfall(roots);
    expect(rows[0]).toMatchObject({ offsetPct: 0, widthPct: 100 });
  });

  it("exposes a pixel floor rather than a percentage floor", () => {
    expect(MIN_BAR_PX).toBe(3);
  });

  describe("replay-mode traces (regression: defect 1)", () => {
    it("renders every span, including one with no timestamps", () => {
      const rows = computeWaterfall(replaySpanTree);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.span.name).sort()).toEqual([
        "fact_checker",
        "orchestrator",
        "search",
        "summarize",
      ]);
    });

    it("keeps every bar inside the track", () => {
      // The epoch-coercion bug pushed real spans to offset ~100%, off-screen.
      for (const row of computeWaterfall(replaySpanTree)) {
        expect(row.offsetPct).toBeGreaterThanOrEqual(0);
        expect(row.offsetPct).toBeLessThanOrEqual(100);
        expect(row.widthPct).toBeGreaterThanOrEqual(0);
        expect(row.offsetPct + row.widthPct).toBeLessThanOrEqual(100.0001);
      }
    });

    it("scales against the trace's own duration, not wall-clock epoch", () => {
      const rows = computeWaterfall(replaySpanTree);
      const root = rows.find((r) => r.span.name === "orchestrator")!;
      // The root spans the whole 1ms trace, so it fills the track.
      expect(root.offsetPct).toBe(0);
      expect(root.widthPct).toBeCloseTo(100, 5);
    });

    it("spreads timed spans across the track by their real position", () => {
      const rows = computeWaterfall(replaySpanTree);
      // search at t=0, summarize at t=+1ms of a 1ms window.
      expect(rows.find((r) => r.span.name === "search")!.offsetPct).toBeCloseTo(0, 5);
      expect(rows.find((r) => r.span.name === "summarize")!.offsetPct).toBeCloseTo(100, 5);
    });

    it("anchors an untimed span at the start rather than at the epoch", () => {
      const rows = computeWaterfall(replaySpanTree);
      expect(rows.find((r) => r.span.name === "fact_checker")!.offsetPct).toBe(0);
    });
  });
});
