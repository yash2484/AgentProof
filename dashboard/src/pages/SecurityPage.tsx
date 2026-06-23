import { Box, Stack, Typography } from "@mui/material";
import { useEvalResults, useMetrics } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { SecurityReportCard } from "../components/SecurityReportCard";
import type { MetricDef } from "../types";

export function securityMetricNames(metrics: MetricDef[]): string[] {
  return metrics.filter((m) => m.type === "security").map((m) => m.name);
}

export function SecurityPage() {
  const metrics = useMetrics();
  const names = securityMetricNames(metrics.data?.metrics ?? []);
  const { data, isLoading, isError, refetch } = useEvalResults({ limit: 200 });

  const securityResults = (data?.results ?? []).filter(
    (r) => r.metric_type === "security" || names.includes(r.metric_name),
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Security report</Typography>
      <QueryBoundary
        isLoading={isLoading || metrics.isLoading}
        isError={isError || metrics.isError}
        isEmpty={!isLoading && securityResults.length === 0}
        emptyMessage="No security findings yet — run security evals to populate this report."
        onRetry={refetch}
      >
        <Stack spacing={2}>
          {securityResults.map((r) => (
            <SecurityReportCard key={`${r.metric_name}-${r.trace_id}-${r.span_id}`} result={r} />
          ))}
        </Stack>
      </QueryBoundary>
    </Box>
  );
}
