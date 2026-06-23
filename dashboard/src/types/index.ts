export type SpanType =
  | "llm_call"
  | "tool_use"
  | "retrieval"
  | "agent_handoff"
  | "human_decision";

export type Status = "ok" | "error" | "running" | string;

export interface Trace {
  trace_id: string;
  project: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  total_latency_ms: number | null;
  total_tokens: number | null;
  total_cost_usd: number | null;
  status: Status;
  tags: Record<string, unknown>;
  created_at: string | null;
}

export interface Span {
  span_id: string;
  trace_id: string;
  parent_span_ids: string[];
  span_type: SpanType;
  name: string;
  start_time: string | null;
  end_time: string | null;
  latency_ms: number | null;
  status: Status;
  error_message: string | null;
  metadata: Record<string, unknown>;
  tags: Record<string, unknown>;
}

export type SpanNode = Span & { children: SpanNode[] };

export interface EvalResult {
  trace_id: string;
  span_id: string | null;
  metric_name: string;
  metric_type: string;
  score: number | null;
  explanation: string | null;
  threshold: number | null;
  passed: boolean | null;
  details: Record<string, unknown> | null;
  raw_judge_output: string | null;
  baseline_id: string | null;
  evaluated_at: string | null;
}

export interface MetricDef {
  name: string;
  type: string;
  applies_to: string[];
  threshold: number | null;
}

export interface MetricsResponse {
  project: string;
  judge_model: string;
  metrics: MetricDef[];
}

export interface TraceListResponse {
  traces: Trace[];
  total: number;
  limit: number;
  offset: number;
}

export interface EvalResultsResponse {
  results: EvalResult[];
  limit?: number;
  offset?: number;
  trace_id?: string;
}
