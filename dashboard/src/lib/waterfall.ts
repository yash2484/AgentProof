import type { Span, SpanNode } from "../types";

/**
 * Minimum *rendered* bar width, in pixels.
 *
 * This is a rendering floor only: the axis stays linearly truthful and the
 * tooltip reports the real duration. A bar at the floor is not proportional,
 * and that is the accepted trade — an invisible span is worse than a
 * slightly overstated one. It is pixels rather than a percentage because a
 * percentage floor scales with container width and so guarantees nothing.
 */
export const MIN_BAR_PX = 3;

export interface WaterfallRow {
  span: Span;
  depth: number;
  offsetPct: number;
  widthPct: number;
}

interface Flat {
  span: Span;
  depth: number;
  /** Null when the span carries no parseable start_time. */
  start: number | null;
  end: number | null;
}

function parse(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function spanEnd(s: Span, start: number | null): number | null {
  const end = parse(s.end_time);
  if (end !== null) return end;
  if (start !== null && s.latency_ms !== null) return start + s.latency_ms;
  return start;
}

function flatten(roots: SpanNode[]): Flat[] {
  const byId = new Map<string, Flat>();
  const visit = (node: SpanNode, depth: number) => {
    const start = parse(node.start_time);
    const existing = byId.get(node.span_id);
    if (!existing || depth > existing.depth) {
      const { children: _children, ...span } = node;
      // NOTE: start/end stay null when unknown. Coercing them to 0 was the
      // defect — one untimed span dragged the window back to the Unix epoch,
      // collapsing every real bar to a speck at the far right of the track.
      byId.set(node.span_id, {
        span: span as Span,
        depth,
        start,
        end: spanEnd(node, start),
      });
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return [...byId.values()];
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Lay spans out against the trace's own extent.
 *
 * Spans without a timestamp anchor at the start of the track with zero
 * width; the renderer's pixel floor keeps them visible. When no span has a
 * usable timestamp at all, or every span shares one instant, bars are laid
 * out in equal sequence so each stays distinguishable — the tooltip carries
 * the real (near-zero) durations.
 */
export function computeWaterfall(roots: SpanNode[]): WaterfallRow[] {
  const flats = flatten(roots);
  if (flats.length === 0) return [];

  const timed = flats.filter((f): f is Flat & { start: number } => f.start !== null);
  const starts = timed.map((f) => f.start);
  const ends = timed.map((f) => f.end ?? f.start);
  const min = starts.length ? Math.min(...starts) : 0;
  const max = ends.length ? Math.max(...ends) : 0;
  const window = max - min;

  const ordered = [...flats].sort(
    (a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.depth - b.depth,
  );

  if (!Number.isFinite(window) || window <= 0) {
    const share = 100 / ordered.length;
    return ordered.map((f, i) => ({
      span: f.span,
      depth: f.depth,
      offsetPct: ordered.length === 1 ? 0 : i * share,
      widthPct: ordered.length === 1 ? 100 : share,
    }));
  }

  return ordered.map((f) => {
    const start = f.start ?? min;
    const end = f.end ?? start;
    const offsetPct = clamp(((start - min) / window) * 100, 0, 100);
    const widthPct = clamp(((end - start) / window) * 100, 0, 100 - offsetPct);
    return { span: f.span, depth: f.depth, offsetPct, widthPct };
  });
}
