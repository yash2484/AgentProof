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
  /** Whether a regression on this metric blocks CI. Defaults true server-side. */
  ci_block: boolean;
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

export interface EvalSummaryMetric {
  metric_name: string;
  mean_score: number | null;
  pass_rate: number | null;
  count: number;
  last_evaluated_at: string | null;
}

export interface EvalSummary {
  /** Null when the summary spans every project. */
  project: string | null;
  trace_count: number;
  /** Null when there is nothing to average — distinct from 0.0. */
  overall_pass_rate: number | null;
  p99_latency_ms: number | null;
  metrics: EvalSummaryMetric[];
}

// ---------------------------------------------------------------------------
// Overview analytics — GET /evals/analytics
// ---------------------------------------------------------------------------

export type MetricType = "deterministic" | "llm_judge" | "security" | "composite";

export interface AnalyticsTotals {
  traces: number;
  /** Gap-clustered runs, not distinct `evaluated_at` values. */
  eval_runs: number;
  /** Traces measured successfully. scored + degraded + pending === traces. */
  scored: number;
  /** Traces whose measurement broke — a judge error or refusal, not a finding. */
  degraded: number;
  /** Traces nobody has evaluated. Not passing; unmeasured. */
  pending: number;
  /** Null when nothing was measured — distinct from zero cost. */
  tokens: number | null;
  cost_usd: number | null;
}

export interface TraceVolumeDay {
  /** ISO date, `YYYY-MM-DD`. */
  day: string;
  total: number;
  ok: number;
  error: number;
}

export interface AnalyticsEvalRun {
  run_at: string;
  /** Distinct traces in the run. */
  trace_count: number;
  /** Row-weighted mean; null when the run scored nothing. */
  mean_score: number | null;
  degraded: number;
}

export interface MetricHealth {
  metric_name: string;
  metric_type: MetricType | string;
  ci_block: boolean;
  /** Over non-degraded rows only. */
  mean_score: number | null;
  /** Sample std. Null at n=1 — "cannot tell", not "perfectly stable". */
  std: number | null;
  pass_rate: number | null;
  threshold: number | null;
  /** Rows the stats above cover; excludes `degraded`. */
  count: number;
  failed: number;
  degraded: number;
  /**
   * `std > 0`. Drives the distribution register vs the ceiling strip — it is
   * what keeps "never varied" out of the healthy bucket.
   */
  has_variance: boolean;
}

export interface ScoreBucket {
  metric_name: string;
  /** Lower edge of a 0.1-wide bucket. */
  bucket: number;
  count: number;
}

export interface GateVerdict {
  metric_name: string;
  is_regression: boolean;
  /** False when the baseline had no candidate scores this run. */
  comparable: boolean;
  baseline_mean: number;
  candidate_mean: number | null;
  delta: number | null;
  /** Null when the detector short-circuited before running a t-test. */
  p_value: number | null;
  cohens_d: number | null;
  t_statistic: number | null;
  baseline_n: number;
  candidate_n: number;
  reason: string;
}

export interface EvalAnalytics {
  project: string | null;
  /** Window in days; 0 means all history. */
  days: number;
  generated_at: string;
  totals: AnalyticsTotals;
  trace_volume: TraceVolumeDay[];
  eval_runs: AnalyticsEvalRun[];
  metric_health: MetricHealth[];
  score_buckets: ScoreBucket[];
  outcome_split: { passed: number; failed: number; degraded: number };
  status_split: { ok: number; error: number };
  gate: GateVerdict[];
}
