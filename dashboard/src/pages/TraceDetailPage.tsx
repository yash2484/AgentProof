import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useTraceTree, useEvalResultsForTrace, useRunEval } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { Waterfall } from "../components/Waterfall";
import { SpanDetailPanel } from "../components/SpanDetailPanel";
import { SectionHeading, DataPanel } from "../components/Ledger";
import { metricTitle } from "../lib/metricCopy";
import { outcomeColor } from "../lib/outcome";
import { tokens, SPACE, TILE_PADDING, DATA, UI } from "../theme";
import type { Span } from "../types";

/**
 * One trace, in full: what the agent did, and what was measured on it.
 *
 * Everything here is an identifier, a duration or a score, so the whole page
 * is mono on tint — there is nothing written to set in serif. That is the
 * register working rather than being applied: this page has no argument to
 * make, only a record to show.
 */
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
      <Box
        component={RouterLink}
        to="/traces"
        sx={{
          ...UI,
          fontSize: 13,
          color: tokens.dim,
          textDecoration: "none",
          "&:hover": { color: tokens.link },
        }}
      >
        ← Traces
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: `${SPACE.sm}px`,
          mt: "2px",
          pb: `${SPACE.xs}px`,
          mb: `${SPACE.lg}px`,
          borderBottom: `1px solid ${tokens.hairStrong}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "baseline", gap: `${SPACE.xs}px`, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ color: tokens.ink }}>
            Trace
          </Typography>
          <Box component="span" sx={{ ...DATA, color: tokens.dim, wordBreak: "break-all" }}>
            {traceId}
          </Box>
        </Box>
        <Button
          variant="outlined"
          size="small"
          disabled={runEval.isPending}
          onClick={() => runEval.mutate(traceId)}
          sx={{ ...UI, fontSize: 13, borderColor: tokens.hairStrong, color: tokens.ink }}
        >
          {runEval.isPending ? "Running…" : "Run eval"}
        </Button>
      </Box>

      <Box component="section" aria-label="Waterfall" sx={{ mb: `${SPACE.lg}px` }}>
        <SectionHeading meta={roots.length > 0 ? `${roots.length} root spans` : undefined}>
          Waterfall
        </SectionHeading>
        <QueryBoundary
          isLoading={tree.isLoading}
          isError={tree.isError}
          isEmpty={roots.length === 0}
          emptyMessage="No spans for this trace."
          onRetry={tree.refetch}
        >
          <DataPanel sx={{ p: `${TILE_PADDING}px` }}>
            <Waterfall roots={roots} onSelect={setSelected} />
          </DataPanel>
        </QueryBoundary>
      </Box>

      <Box component="section" aria-label="Eval results">
        <SectionHeading meta={results.length > 0 ? `${results.length} measurements` : undefined}>
          What was measured
        </SectionHeading>
        <QueryBoundary
          isLoading={evals.isLoading}
          isError={evals.isError}
          isEmpty={results.length === 0}
          emptyMessage="Nothing has been measured on this trace. That is not a pass — it is the absence of a measurement."
          onRetry={evals.refetch}
        >
          <DataPanel>
            {results.map((r, i) => (
              <Box
                key={`${r.metric_name}-${r.span_id ?? "trace"}-${r.evaluated_at}`}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: `${SPACE.sm}px`,
                  flexWrap: "wrap",
                  px: `${SPACE.sm}px`,
                  py: "7px",
                  borderTop: i === 0 ? "none" : `1px solid ${tokens.hair}`,
                }}
              >
                {/* A basis, not a floor. `minWidth: 150` aligned the column
                  * nicely at desktop widths and could not collapse at 390px,
                  * where it pushed the row — and the document — into
                  * horizontal scroll. */}
                <Box
                  component="span"
                  sx={{ ...DATA, color: tokens.ink, flex: "0 1 150px", minWidth: 0 }}
                >
                  {metricTitle(r.metric_name)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    ...DATA,
                    fontWeight: 500,
                    color: outcomeColor(r.passed === false ? "failed" : "passed"),
                  }}
                >
                  {r.score === null ? "—" : r.score.toFixed(3)}
                </Box>
                <Box
                  component="span"
                  sx={{ ...DATA, color: tokens.dim, flex: "1 1 170px", minWidth: 0 }}
                >
                  {r.explanation}
                </Box>
              </Box>
            ))}
          </DataPanel>
        </QueryBoundary>
      </Box>

      <SpanDetailPanel span={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
