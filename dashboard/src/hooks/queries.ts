import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client";

export const queryKeys = {
  traces: (params: unknown) => ["traces", params] as const,
  traceTree: (id: string) => ["traceTree", id] as const,
  evalResultsForTrace: (id: string) => ["evalResults", "trace", id] as const,
  evalResults: (params: unknown) => ["evalResults", "list", params] as const,
  metrics: () => ["metrics"] as const,
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
      const res = await api.listTraces({ limit: 200 });
      return [...new Set(res.traces.map((t) => t.project))].sort();
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
