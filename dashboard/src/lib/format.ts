import type { SpanType } from "../types";

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "—";
  return `$${usd.toFixed(4)}`;
}

export function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

export const SPAN_TYPE_COLORS: Record<SpanType, string> = {
  llm_call: "#3949ab",
  tool_use: "#00897b",
  retrieval: "#8e24aa",
  agent_handoff: "#fb8c00",
  human_decision: "#546e7a",
};

const FALLBACK_COLOR = "#9e9e9e";

export function spanColor(type: string): string {
  return SPAN_TYPE_COLORS[type as SpanType] ?? FALLBACK_COLOR;
}
