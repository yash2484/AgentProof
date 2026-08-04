import { useState } from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { useEvalResults, useMetrics } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { ScoreTimeseries } from "../components/ScoreTimeseries";
import { useProject } from "../context/ProjectContext";
import { tokens, SPACE } from "../theme";

export function EvalsPage() {
  const [metricName, setMetricName] = useState<string>("");
  const metrics = useMetrics();
  const { project } = useProject();
  const { data, isLoading, isError, refetch } = useEvalResults({
    ...(metricName ? { metric_name: metricName } : {}),
    project,
    limit: 200,
  });
  const results = data?.results ?? [];

  return (
    <Box>
      <Typography variant="h5" sx={{ color: tokens.ink, mb: `${SPACE.md}px` }}>Eval scores over time</Typography>
      <TextField
        label="Metric"
        size="small"
        select
        sx={{ minWidth: 220, mb: `${SPACE.md}px` }}
        value={metricName}
        onChange={(e) => setMetricName(e.target.value)}
      >
        <MenuItem value="">All metrics</MenuItem>
        {(metrics.data?.metrics ?? []).map((m) => (
          <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>
        ))}
      </TextField>
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && results.length === 0}
        emptyMessage="No eval results yet — run evals to populate this chart."
        onRetry={refetch}
      >
        <Box
          sx={{
            p: `${SPACE.md}px`,
            bgcolor: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 2.5,
          }}
        >
          <ScoreTimeseries results={results} metrics={metrics.data?.metrics ?? []} />
        </Box>
      </QueryBoundary>
    </Box>
  );
}
