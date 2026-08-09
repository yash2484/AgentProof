import type {
  TraceListResponse,
  SpanNode,
  EvalResultsResponse,
  MetricsResponse,
  EvalSummary,
  EvalAnalytics,
  MetricDetail,
} from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? "http://localhost:8000";
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listTraces(params: {
  project?: string;
  status?: string;
  start_after?: string;
  start_before?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<TraceListResponse> {
  return request<TraceListResponse>(`/traces${qs(params)}`);
}

export function getTraceTree(traceId: string): Promise<SpanNode[]> {
  return request<SpanNode[]>(`/traces/${traceId}/tree`);
}

export function deleteTrace(traceId: string): Promise<void> {
  return request<void>(`/traces/${traceId}`, { method: "DELETE" });
}

export function listEvalResults(params: {
  trace_id?: string;
  metric_name?: string;
  passed?: boolean;
  project?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<EvalResultsResponse> {
  return request<EvalResultsResponse>(`/evals/results${qs(params)}`);
}

export function getEvalResultsForTrace(traceId: string): Promise<EvalResultsResponse> {
  return request<EvalResultsResponse>(`/evals/results/${traceId}`);
}

export function listMetrics(): Promise<MetricsResponse> {
  return request<MetricsResponse>(`/evals/metrics`);
}

export function runEval(traceId: string): Promise<EvalResultsResponse> {
  return request<EvalResultsResponse>(`/evals/run`, {
    method: "POST",
    body: JSON.stringify({ trace_id: traceId }),
  });
}

export function getEvalSummary(
  params: { project?: string } = {},
): Promise<EvalSummary> {
  return request<EvalSummary>(`/evals/summary${qs(params)}`);
}

/**
 * Everything the Overview needs, aggregated server-side.
 *
 * `days` defaults to 30 on the server; pass 0 for all history. One call, not
 * seven: every figure is already reduced in SQL, so there is nothing left for
 * the client to aggregate over a truncated page of rows.
 */
export function getEvalAnalytics(
  params: { project?: string; days?: number } = {},
): Promise<EvalAnalytics> {
  return request<EvalAnalytics>(`/evals/analytics${qs(params)}`);
}

/**
 * One metric in depth. 404s when the metric has no rows in scope, which the
 * page surfaces as "no such metric" rather than an empty state — a rotted
 * link and a metric that passed are different things.
 */
export function getMetricDetail(
  metricName: string,
  params: { project?: string; days?: number; worst?: number } = {},
): Promise<MetricDetail> {
  return request<MetricDetail>(
    `/evals/metric/${encodeURIComponent(metricName)}${qs(params)}`,
  );
}
