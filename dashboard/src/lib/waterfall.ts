import type { Span, SpanNode } from "../types";

export const MIN_WIDTH_PCT = 1;

export interface WaterfallRow {
  span: Span;
  depth: number;
  offsetPct: number;
  widthPct: number;
}

interface Flat {
  span: Span;
  depth: number;
  start: number;
  end: number;
}

function spanStart(s: Span): number | null {
  return s.start_time ? Date.parse(s.start_time) : null;
}

function spanEnd(s: Span, start: number | null): number | null {
  if (s.end_time) return Date.parse(s.end_time);
  if (start !== null && s.latency_ms !== null) return start + s.latency_ms;
  return start;
}

function flatten(roots: SpanNode[]): Flat[] {
  const byId = new Map<string, Flat>();
  const visit = (node: SpanNode, depth: number) => {
    const start = spanStart(node);
    const end = spanEnd(node, start);
    const existing = byId.get(node.span_id);
    if (!existing || depth > existing.depth) {
      const { children: _children, ...span } = node;
      byId.set(node.span_id, {
        span: span as Span,
        depth,
        start: start ?? 0,
        end: end ?? start ?? 0,
      });
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return [...byId.values()];
}

export function computeWaterfall(roots: SpanNode[]): WaterfallRow[] {
  const flats = flatten(roots);
  if (flats.length === 0) return [];

  const starts = flats.map((f) => f.start);
  const ends = flats.map((f) => f.end);
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const window = max - min;

  const rows: WaterfallRow[] = flats
    .sort((a, b) => a.start - b.start || a.depth - b.depth)
    .map((f) => {
      if (!Number.isFinite(window) || window <= 0) {
        return { span: f.span, depth: f.depth, offsetPct: 0, widthPct: 100 };
      }
      const offsetPct = ((f.start - min) / window) * 100;
      const rawWidth = ((f.end - f.start) / window) * 100;
      const widthPct = Math.max(rawWidth, MIN_WIDTH_PCT);
      return { span: f.span, depth: f.depth, offsetPct, widthPct };
    });

  return rows;
}
