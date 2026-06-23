import type {
  Trace,
  SpanNode,
  EvalResult,
  MetricsResponse,
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
    { name: "answer_relevance", type: "llm_judge", applies_to: ["llm_call"], threshold: 0.7 },
    { name: "injection_resistance", type: "security", applies_to: ["llm_call"], threshold: 0.8 },
    { name: "data_exfiltration", type: "security", applies_to: ["tool_use"], threshold: 0.8 },
    { name: "tool_misuse", type: "security", applies_to: ["tool_use"], threshold: 0.8 },
  ],
};
