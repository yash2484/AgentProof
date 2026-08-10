export type SpanType =
  | "llm_call"
  | "tool_use"
  | "retrieval"
  | "agent_handoff"
  | "human_decision";

export type Status = "ok" | "error" | "running" | string;

/**
 * How a trace's measurements turned out.
 *
 * `outcome` is the one word the grid sorts and filters on, ordered by the
 * same severity rule as the Overview: a failure outranks a broken
 * measurement, and a trace whose measurements all broke is `degraded` rather
 * than `not_evaluated` — something ran and it broke, which is different from
 * nobody trying.
 */
export type TraceOutcome = "passed" | "failed" | "degraded" | "not_evaluated";

export interface EvalOutcome {
  /** Non-degraded eval rows. */
  total: number;
  passed: number;
  failed: number;
  degraded: number;
  /** Lowest-scoring metric on this trace — the column that makes it scannable. */
  worst_metric: string | null;
  worst_score: number | null;
  outcome: TraceOutcome;
}

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
  /** Absent on responses from before the outcome columns shipped. */
  eval_outcome?: EvalOutcome;
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

/**
 * The panel a metric belongs to, assigned server-side from `metric_type`.
 *
 * Three types, three units, three questions — see `lib/groups.ts`. `other`
 * catches `composite` (in the type system, no members) and anything the
 * server adds later.
 */
export type MetricGroup = "quality" | "safety" | "budgets" | "other";

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
  /**
   * Mean per metric in this run, degraded rows excluded.
   *
   * A metric absent from a run is absent from this map — the strip reads "no
   * previous value" from the missing key, which a null could not be told
   * apart from a genuinely null mean.
   */
  metric_means: Record<string, number | null>;
  /**
   * Row-weighted mean per group, degraded rows excluded. Never pooled across
   * groups — a judge score and a breach flag do not share a unit.
   *
   * Every group seen anywhere in the window has a key, so series stay aligned
   * across runs. Null means that run measured nothing in that group, which is
   * not the same as scoring zero.
   */
  group_means: Partial<Record<MetricGroup, number | null>>;
  degraded: number;
}

export interface MetricHealth {
  metric_name: string;
  metric_type: MetricType | string;
  /** Assigned server-side from `metric_type`; the client re-derives nothing. */
  group: MetricGroup | string;
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

/** One span's judge output on a single eval row. */
export interface SpanReasoning {
  span_id: string | null;
  /** Null when the judge call failed rather than scored. */
  score: number | null;
  /** The judge's own prose. Absent when the call errored. */
  reasoning?: string;
  /** Present instead of `reasoning` when the judge errored or refused. */
  error?: string;
}

export interface WorstRow {
  trace_id: string;
  span_id: string | null;
  score: number | null;
  passed: boolean;
  evaluated_at: string | null;
  explanation: string | null;
  reasoning: SpanReasoning[];
}

export interface MetricRunPoint {
  run_at: string;
  /** Null when every measurement in that run was degraded. */
  mean_score: number | null;
  count: number;
  failed: number;
}

/** GET /evals/metric/{name} — the drill-down behind `/evals/:metric`. */
export interface MetricDetail {
  metric_name: string;
  metric_type: MetricType | string;
  group: MetricGroup | string;
  ci_block: boolean;
  project: string | null;
  days: number;
  health: Omit<MetricHealth, "metric_name" | "metric_type" | "group" | "ci_block">;
  buckets: { bucket: number; count: number }[];
  runs: MetricRunPoint[];
  /** Lowest-scoring measurements, worst first. Degraded rows excluded. */
  worst: WorstRow[];
}

// ---------------------------------------------------------------------------
// Security posture — GET /security/analytics
// ---------------------------------------------------------------------------

export interface SecurityMetricPosture {
  metric_name: string;
  /** Non-degraded rows. */
  measured: number;
  breached: number;
  degraded: number;
  /**
   * Runs where an attack was attempted, or null when the metric records no
   * attempt signal at all. Null is not zero: "0 of 34 attempted" and "nobody
   * checked" are different facts and only one is reassuring.
   */
  attempted: number | null;
  attempt_signal: boolean;
  /** False means nothing ever moved it — unexercised, not proven safe. */
  has_variance: boolean;
}

export interface SecurityRunPoint {
  run_at: string;
  measured: number;
  breached: number;
  attempted: number;
}

export interface SecurityFinding {
  trace_id: string;
  span_id: string | null;
  metric_name: string;
  score: number | null;
  evaluated_at: string | null;
  explanation: string | null;
  /** Whether an attack was attempted on this trace. Null when unrecorded. */
  attempted: boolean | null;
  reasoning: SpanReasoning[];
}

export interface SecurityAnalytics {
  project: string | null;
  days: number;
  generated_at: string;
  metrics: SecurityMetricPosture[];
  totals: { measured: number; breached: number; degraded: number };
  /** Traces carrying any security measurement, split by whether one was attacked. */
  attack_surface: { traces: number; attacked: number; unattacked: number };
  runs: SecurityRunPoint[];
  /** Only failures. Passing rows are counted, never enumerated. */
  findings: SecurityFinding[];
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
