import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client";

export const queryKeys = {
  traces: (params: unknown) => ["traces", params] as const,
  traceTree: (id: string) => ["traceTree", id] as const,
  evalResultsForTrace: (id: string) => ["evalResults", "trace", id] as const,
  evalResults: (params: unknown) => ["evalResults", "list", params] as const,
  metrics: () => ["metrics"] as const,
  evalSummary: (project: string | undefined) => ["evalSummary", project] as const,
  evalAnalytics: (project: string | undefined, days: number) =>
    ["evalAnalytics", project, days] as const,
  metricDetail: (name: string, project: string | undefined, days: number) =>
    ["metricDetail", name, project, days] as const,
  securityAnalytics: (project: string | undefined, days: number) =>
    ["securityAnalytics", project, days] as const,
};

export function useTraces(params: Parameters<typeof api.listTraces>[0] = {}) {
  return useQuery({ queryKey: queryKeys.traces(params), queryFn: () => api.listTraces(params) });
}

export function useTraceTree(id: string) {
  return useQuery({
    queryKey: queryKeys.traceTree(id),
    queryFn: () => api.getTraceTree(id),
    enabled: !!id,
  });
}

export function useEvalResultsForTrace(id: string) {
  return useQuery({
    queryKey: queryKeys.evalResultsForTrace(id),
    queryFn: () => api.getEvalResultsForTrace(id),
    enabled: !!id,
  });
}

export function useEvalResults(params: Parameters<typeof api.listEvalResults>[0] = {}) {
  return useQuery({ queryKey: queryKeys.evalResults(params), queryFn: () => api.listEvalResults(params) });
}

export function useMetrics() {
  return useQuery({ queryKey: queryKeys.metrics(), queryFn: () => api.listMetrics() });
}

/** Distinct project names, derived from recent traces (no dedicated endpoint). */
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      // Was derived from a page of traces, which broke twice over: it saw only
      // the first 200 rows, and once aggregates began excluding generated
      // corpora the generated project disappeared from the switcher entirely.
      const res = await api.listProjects();
      return res.projects.map((p) => p.name);
    },
  });
}

export function useDeleteTrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTrace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["traces"] }),
  });
}

export function useRunEval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.runEval(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalResultsForTrace(id) });
      qc.invalidateQueries({ queryKey: ["evalResults"] });
    },
  });
}

export function useEvalSummary(project?: string) {
  return useQuery({
    queryKey: queryKeys.evalSummary(project),
    queryFn: () => api.getEvalSummary({ project }),
  });
}

/**
 * The Overview's single data source.
 *
 * `days` is part of the key: the scope bar shows the window above every figure
 * it scopes, so changing it must refetch rather than re-label stale numbers.
 */
export function useEvalAnalytics(project?: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.evalAnalytics(project, days),
    queryFn: () => api.getEvalAnalytics({ project, days }),
  });
}

/** The Security page's single data source. */
export function useSecurityAnalytics(project?: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.securityAnalytics(project, days),
    queryFn: () => api.getSecurityAnalytics({ project, days }),
  });
}

/** One metric in depth, behind `/evals/:metric`. */
export function useMetricDetail(name: string, project?: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.metricDetail(name, project, days),
    queryFn: () => api.getMetricDetail(name, { project, days }),
    enabled: !!name,
    // A 404 here means the metric does not exist in this window. Retrying
    // asks the same question three more times and delays the answer.
    retry: false,
  });
}
