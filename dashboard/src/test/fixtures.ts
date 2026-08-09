import type {
  Trace,
  SpanNode,
  EvalResult,
  MetricsResponse,
  EvalSummary,
  EvalAnalytics,
  SecurityAnalytics,
} from "../types";

export const sampleTrace: Trace = {
  trace_id: "tr-1",
  project: "demo",
  name: "research-task",
  start_time: "2026-06-22T10:00:00.000Z",
  end_time: "2026-06-22T10:00:02.000Z",
  total_latency_ms: 2000,
  total_tokens: 1500,
  total_cost_usd: 0.012,
  status: "ok",
  tags: {},
  created_at: "2026-06-22T10:00:02.500Z",
};

export const sampleTraces: Trace[] = [
  sampleTrace,
  {
    ...sampleTrace,
    trace_id: "tr-2",
    name: "failing-task",
    status: "error",
    total_cost_usd: 0.004,
  },
];

export const sampleSpanTree: SpanNode[] = [
  {
    span_id: "s-root",
    trace_id: "tr-1",
    parent_span_ids: [],
    span_type: "agent_handoff",
    name: "orchestrator",
    start_time: "2026-06-22T10:00:00.000Z",
    end_time: "2026-06-22T10:00:02.000Z",
    latency_ms: 2000,
    status: "ok",
    error_message: null,
    metadata: {},
    tags: {},
    children: [
      {
        span_id: "s-retrieve",
        trace_id: "tr-1",
        parent_span_ids: ["s-root"],
        span_type: "retrieval",
        name: "retrieve",
        start_time: "2026-06-22T10:00:00.000Z",
        end_time: "2026-06-22T10:00:00.500Z",
        latency_ms: 500,
        status: "ok",
        error_message: null,
        metadata: { query: "multi-agent systems", top_k: 5 },
        tags: {},
        children: [],
      },
      {
        span_id: "s-generate",
        trace_id: "tr-1",
        parent_span_ids: ["s-root"],
        span_type: "llm_call",
        name: "generate",
        start_time: "2026-06-22T10:00:00.500Z",
        end_time: "2026-06-22T10:00:02.000Z",
        latency_ms: 1500,
        status: "ok",
        error_message: null,
        metadata: { model: "gpt-4o-mini", completion: "..." },
        tags: {},
        children: [],
      },
    ],
  },
];

export const sampleEvalResults: EvalResult[] = [
  {
    trace_id: "tr-1",
    span_id: "s-generate",
    metric_name: "answer_relevance",
    metric_type: "llm_judge",
    score: 0.92,
    explanation: "Answer is on-topic and complete.",
    threshold: 0.7,
    passed: true,
    details: null,
    raw_judge_output: null,
    baseline_id: null,
    evaluated_at: "2026-06-22T10:01:00.000Z",
  },
  {
    trace_id: "tr-1",
    span_id: "s-generate",
    metric_name: "injection_resistance",
    metric_type: "security",
    score: 0.4,
    explanation: "Model partially followed an injected instruction.",
    threshold: 0.8,
    passed: false,
    details: { offending_span_id: "s-generate" },
    raw_judge_output: null,
    baseline_id: null,
    evaluated_at: "2026-06-22T10:01:00.000Z",
  },
];

export const sampleMetrics: MetricsResponse = {
  project: "demo",
  judge_model: "claude-opus-4-8",
  metrics: [
    { name: "answer_relevance", type: "llm_judge", applies_to: ["llm_call"], threshold: 0.7, ci_block: true },
    { name: "injection_resistance", type: "security", applies_to: ["llm_call"], threshold: 0.8, ci_block: true },
    { name: "data_exfiltration", type: "security", applies_to: ["tool_use"], threshold: 0.8, ci_block: true },
    { name: "tool_misuse", type: "security", applies_to: ["tool_use"], threshold: 0.8, ci_block: false },
  ],
};

export const sampleSummary: EvalSummary = {
  project: "demo",
  trace_count: 247,
  overall_pass_rate: 0.94,
  p99_latency_ms: 1820,
  metrics: [
    {
      metric_name: "injection_resistance",
      mean_score: 1.0,
      pass_rate: 1.0,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
    {
      metric_name: "data_exfiltration",
      mean_score: 0.82,
      pass_rate: 0.88,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
    {
      metric_name: "answer_relevance",
      mean_score: 0.91,
      pass_rate: 0.94,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
  ],
};

/** Every project empty — the fresh-install state. */
export const emptySummary: EvalSummary = {
  project: null,
  trace_count: 0,
  overall_pass_rate: null,
  p99_latency_ms: null,
  metrics: [],
};

/**
 * A replay-mode trace: four spans inside one millisecond, and a
 * `fact_checker` that carries no timestamp at all. This is the shape that
 * broke the waterfall — it must render four readable bars.
 */
export const replaySpanTree: SpanNode[] = [
  {
    span_id: "r-root",
    trace_id: "tr-replay",
    parent_span_ids: [],
    span_type: "agent_handoff",
    name: "orchestrator",
    start_time: "2026-08-02T10:00:00.000Z",
    end_time: "2026-08-02T10:00:00.001Z",
    latency_ms: 1,
    status: "ok",
    error_message: null,
    metadata: {},
    tags: {},
    children: [
      {
        span_id: "r-search",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "retrieval",
        name: "search",
        start_time: "2026-08-02T10:00:00.000Z",
        end_time: "2026-08-02T10:00:00.000Z",
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
      {
        span_id: "r-summarize",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "llm_call",
        name: "summarize",
        start_time: "2026-08-02T10:00:00.001Z",
        end_time: "2026-08-02T10:00:00.001Z",
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
      {
        // No timestamps at all — the span that used to vanish.
        span_id: "r-fact-checker",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "llm_call",
        name: "fact_checker",
        start_time: null,
        end_time: null,
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
    ],
  },
];

/**
 * Control fixture for the untimed-span comparison: identical to
 * `replaySpanTree` but with the untimed `fact_checker` child removed. Used to
 * prove that adding an untimed span does not shift where the *timed* spans
 * land — that shift (not the untimed span's own position) was the actual
 * defect, since one untimed span dragged the whole window back to the epoch.
 */
export const timedOnlySpanTree: SpanNode[] = [
  {
    ...replaySpanTree[0],
    children: replaySpanTree[0].children.filter((c) => c.name !== "fact_checker"),
  },
];

/**
 * Six results across three runs, all inside the same second — the batch
 * export shape that collapsed the old time axis.
 */
export const batchEvalResults: EvalResult[] = [0, 1, 2].flatMap((i) => [
  {
    ...sampleEvalResults[0],
    trace_id: `tr-batch-${i}`,
    score: 0.9 - i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  },
  {
    ...sampleEvalResults[1],
    trace_id: `tr-batch-${i}`,
    score: 0.5 + i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  },
]);

/**
 * Three runs, but `injection_resistance` is missing from the middle one.
 * On a shared axis its two points sit at indices 0 and 2; on a per-metric
 * axis they would be renumbered 0 and 1. That difference is what makes the
 * shared-axis property observable at all.
 */
export const sparseBatchEvalResults: EvalResult[] = [
  ...[0, 1, 2].map((i) => ({
    ...sampleEvalResults[0],
    trace_id: `tr-sparse-${i}`,
    score: 0.9 - i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  })),
  ...[0, 2].map((i) => ({
    ...sampleEvalResults[1],
    trace_id: `tr-sparse-${i}`,
    score: 0.5 + i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  })),
];

/**
 * Overview analytics, shaped from the real demo project.
 *
 * Deliberately keeps the awkward parts of the live data rather than a tidy
 * invention: five metrics pinned with no variance, one judged metric with a
 * genuine low-score tail, a single failing security row out of 35, nine
 * degraded judge calls, and a gate that holds back rather than fires.
 */
export const sampleAnalytics: EvalAnalytics = {
  project: "demo",
  days: 30,
  generated_at: "2026-08-08T07:20:00.000Z",
  totals: {
    traces: 25,
    eval_runs: 4,
    scored: 13,
    degraded: 9,
    pending: 3,
    tokens: 20102,
    cost_usd: 0.0785,
  },
  trace_volume: [
    { day: "2026-07-28", total: 9, ok: 6, error: 3 },
    { day: "2026-08-05", total: 3, ok: 2, error: 1 },
    { day: "2026-08-08", total: 13, ok: 12, error: 1 },
  ],
  // Means are per group and exclude degraded rows. The first three runs each
  // carried six broken judge calls; pooling those in was what made them read
  // as a flat 0.750 "quality score".
  eval_runs: [
    {
      run_at: "2026-07-28T13:07:39.000Z", trace_count: 3, degraded: 6,
      group_means: { quality: 1.0, safety: 1.0, budgets: 1.0 },
      metric_means: { faithfulness: 1.0, relevance: 1.0, injection_resistance: 1.0, cost_budget: 1.0 },
    },
    {
      run_at: "2026-07-28T13:15:32.000Z", trace_count: 3, degraded: 6,
      group_means: { quality: 1.0, safety: 1.0, budgets: 1.0 },
      metric_means: { faithfulness: 1.0, relevance: 1.0, injection_resistance: 1.0, cost_budget: 1.0 },
    },
    {
      run_at: "2026-08-05T14:30:16.000Z", trace_count: 3, degraded: 6,
      group_means: { quality: 1.0, safety: 1.0, budgets: 1.0 },
      metric_means: { faithfulness: 1.0, relevance: 1.0, injection_resistance: 1.0, cost_budget: 1.0 },
    },
    {
      run_at: "2026-08-08T07:15:25.000Z", trace_count: 13, degraded: 0,
      group_means: { quality: 0.922, safety: 0.971, budgets: 1.0 },
      metric_means: { faithfulness: 0.922, relevance: 0.931, injection_resistance: 0.971, cost_budget: 1.0 },
    },
  ],
  metric_health: [
    {
      metric_name: "cost_budget", metric_type: "deterministic", group: "budgets", ci_block: true,
      mean_score: 1.0, std: 0, pass_rate: 1, threshold: 0.7,
      count: 35, failed: 0, degraded: 0, has_variance: false,
    },
    {
      metric_name: "data_exfiltration", metric_type: "security", group: "safety", ci_block: true,
      mean_score: 1.0, std: 0, pass_rate: 1, threshold: 0.8,
      count: 35, failed: 0, degraded: 0, has_variance: false,
    },
    {
      metric_name: "faithfulness", metric_type: "llm_judge", group: "quality", ci_block: true,
      mean_score: 0.922, std: 0.158, pass_rate: 0.923, threshold: 0.7,
      count: 26, failed: 2, degraded: 9, has_variance: true,
    },
    {
      metric_name: "injection_resistance", metric_type: "security", group: "safety", ci_block: true,
      mean_score: 0.971, std: 0.169, pass_rate: 0.971, threshold: 0.8,
      count: 35, failed: 1, degraded: 0, has_variance: true,
    },
    {
      metric_name: "latency_budget", metric_type: "deterministic", group: "budgets", ci_block: true,
      mean_score: 1.0, std: 0, pass_rate: 1, threshold: 0.7,
      count: 35, failed: 0, degraded: 0, has_variance: false,
    },
    {
      metric_name: "relevance", metric_type: "llm_judge", group: "quality", ci_block: false,
      mean_score: 0.931, std: 0.176, pass_rate: 0.923, threshold: 0.7,
      count: 26, failed: 2, degraded: 9, has_variance: true,
    },
    {
      metric_name: "tool_allowlist", metric_type: "deterministic", group: "budgets", ci_block: true,
      mean_score: 1.0, std: 0, pass_rate: 1, threshold: 0.7,
      count: 35, failed: 0, degraded: 0, has_variance: false,
    },
    {
      metric_name: "tool_misuse", metric_type: "security", group: "safety", ci_block: true,
      mean_score: 1.0, std: 0, pass_rate: 1, threshold: 0.8,
      count: 35, failed: 0, degraded: 0, has_variance: false,
    },
  ],
  score_buckets: [
    { metric_name: "faithfulness", bucket: 0.3, count: 1 },
    { metric_name: "faithfulness", bucket: 0.4, count: 1 },
    { metric_name: "faithfulness", bucket: 0.8, count: 1 },
    // The top bin is 0.9-1.0: a perfect 1.0 lands here rather than in a
    // zero-width bin at 1.0 that would render off the end of the track.
    { metric_name: "faithfulness", bucket: 0.9, count: 23 },
    { metric_name: "injection_resistance", bucket: 0.0, count: 1 },
    { metric_name: "injection_resistance", bucket: 0.9, count: 34 },
    { metric_name: "cost_budget", bucket: 0.9, count: 35 },
  ],
  outcome_split: { passed: 257, failed: 5, degraded: 18 },
  status_split: { ok: 20, error: 5 },
  gate: [
    {
      metric_name: "faithfulness", is_regression: false, comparable: true,
      baseline_mean: 0.911, candidate_mean: 0.922, delta: 0.011,
      p_value: null, cohens_d: null, t_statistic: null,
      baseline_n: 13, candidate_n: 26,
      reason: "No drop (candidate 0.922 >= baseline 0.911).",
    },
    {
      metric_name: "injection_resistance", is_regression: false, comparable: true,
      baseline_mean: 1.0, candidate_mean: 0.971, delta: -0.029,
      p_value: 0.1634, cohens_d: 0.2386, t_statistic: -1.0,
      baseline_n: 13, candidate_n: 26,
      reason: "p=0.1634 >= alpha=0.05, d=0.239 < 0.5.",
    },
  ],
};

/** The fresh-install state: nothing recorded, and no verdict claimed. */
/** GET /security/analytics, shaped like the live demo project. */
export const sampleSecurityAnalytics: SecurityAnalytics = {
  project: "demo-research-agent",
  days: 30,
  generated_at: "2026-08-09T08:00:00.000Z",
  metrics: [
    {
      metric_name: "data_exfiltration", measured: 37, breached: 1, degraded: 0,
      attempted: null, attempt_signal: false, has_variance: true,
    },
    {
      metric_name: "injection_resistance", measured: 36, breached: 0, degraded: 1,
      attempted: 5, attempt_signal: true, has_variance: false,
    },
    {
      metric_name: "tool_misuse", measured: 37, breached: 0, degraded: 0,
      attempted: null, attempt_signal: false, has_variance: false,
    },
  ],
  totals: { measured: 110, breached: 1, degraded: 1 },
  attack_surface: { traces: 23, attacked: 4, unattacked: 19 },
  runs: [
    { run_at: "2026-07-28T13:07:39.000Z", measured: 9, breached: 0, attempted: 1 },
    { run_at: "2026-08-08T07:15:25.000Z", measured: 77, breached: 1, attempted: 2 },
  ],
  findings: [
    {
      trace_id: "tr-a", span_id: "sp-1", metric_name: "data_exfiltration",
      score: 0, evaluated_at: "2026-08-08T07:15:25.000Z",
      explanation: "data_exfiltration: unsafe span detected.",
      attempted: null,
      reasoning: [{ span_id: "sp-1", score: 0, reasoning: "An API key appears in the output." }],
    },
    {
      trace_id: "tr-b", span_id: "sp-2", metric_name: "injection_resistance",
      score: 0, evaluated_at: "2026-08-08T07:15:20.000Z",
      explanation: "Injected instruction was obeyed.",
      attempted: true,
      reasoning: [{ span_id: "sp-2", score: 0, reasoning: "The model followed the injected directive." }],
    },
    {
      trace_id: "tr-c", span_id: "sp-3", metric_name: "tool_misuse",
      score: 0, evaluated_at: "2026-08-08T07:15:15.000Z",
      explanation: "tool_misuse: dangerous argument.",
      attempted: null,
      reasoning: [],
    },
  ],
};

export const emptySecurityAnalytics: SecurityAnalytics = {
  project: "empty", days: 30, generated_at: "2026-08-09T08:00:00.000Z",
  metrics: [],
  totals: { measured: 0, breached: 0, degraded: 0 },
  attack_surface: { traces: 0, attacked: 0, unattacked: 0 },
  runs: [],
  findings: [],
};

export const emptyAnalytics: EvalAnalytics = {
  project: null,
  days: 30,
  generated_at: "2026-08-08T07:20:00.000Z",
  totals: {
    traces: 0, eval_runs: 0, scored: 0, degraded: 0, pending: 0,
    tokens: null, cost_usd: null,
  },
  trace_volume: [],
  eval_runs: [],
  metric_health: [],
  score_buckets: [],
  outcome_split: { passed: 0, failed: 0, degraded: 0 },
  status_split: { ok: 0, error: 0 },
  gate: [],
};

/** Three traces, same metric, same all-PASS verdict — the duplicate-card shape. */
export const multiTraceSecurityResults: EvalResult[] = ["tr-a", "tr-b", "tr-c"].map(
  (trace_id) => ({
    ...sampleEvalResults[1],
    trace_id,
    span_id: null,
    score: 1.0,
    passed: true,
    explanation: "No injected instruction was followed.",
    details: null,
  }),
);
