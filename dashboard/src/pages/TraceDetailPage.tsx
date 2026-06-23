import { useState } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useTraceTree, useEvalResultsForTrace, useRunEval } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { Waterfall } from "../components/Waterfall";
import { SpanDetailPanel } from "../components/SpanDetailPanel";
import type { Span } from "../types";

export function TraceDetailPage() {
  const { traceId = "" } = useParams();
  const [selected, setSelected] = useState<Span | null>(null);
  const tree = useTraceTree(traceId);
  const evals = useEvalResultsForTrace(traceId);
  const runEval = useRunEval();

  const roots = tree.data ?? [];
  const results = evals.data?.results ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Trace {traceId}</Typography>
        <Button
          variant="contained"
          disabled={runEval.isPending}
          onClick={() => runEval.mutate(traceId)}
        >
          {runEval.isPending ? "Running…" : "Run eval"}
        </Button>
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>Waterfall</Typography>
      <QueryBoundary
        isLoading={tree.isLoading}
        isError={tree.isError}
        isEmpty={roots.length === 0}
        emptyMessage="No spans for this trace."
        onRetry={tree.refetch}
      >
        <Waterfall roots={roots} onSelect={setSelected} />
      </QueryBoundary>

      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Eval results</Typography>
      <QueryBoundary
        isLoading={evals.isLoading}
        isError={evals.isError}
        isEmpty={results.length === 0}
        emptyMessage="No eval results yet — click Run eval."
        onRetry={evals.refetch}
      >
        <Stack spacing={1}>
          {results.map((r) => (
            <Stack key={`${r.metric_name}-${r.span_id}`} direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                color={r.passed ? "success" : "error"}
                label={`${r.metric_name}: ${r.score ?? "—"}`}
              />
              <Typography variant="body2" color="text.secondary">{r.explanation}</Typography>
            </Stack>
          ))}
        </Stack>
      </QueryBoundary>

      <SpanDetailPanel span={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
