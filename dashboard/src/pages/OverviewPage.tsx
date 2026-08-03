import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useEvalSummary, useTraces, useTraceTree } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { QueryBoundary } from "../components/QueryBoundary";
import { VerdictTile } from "../components/VerdictTile";
import { StatTile } from "../components/StatTile";
import { MiniWaterfall } from "../components/MiniWaterfall";
import { EmptyState } from "../components/EmptyState";
import { gateStatus, formatPct } from "../lib/overview";
import { formatDuration } from "../lib/format";
import { tokens, TILE_GAP, TILE_PADDING, SPACE } from "../theme";

/**
 * Bento overview. Tile size encodes importance: the security verdict gets
 * 2x2, latency and the gate get 1x1. The 2x2 goes full-width at the smallest
 * breakpoint rather than shrinking into illegibility.
 */
export function OverviewPage() {
  const { project } = useProject();
  const summary = useEvalSummary(project);
  const latest = useTraces({ project, limit: 1 });
  const latestTrace = latest.data?.traces[0];
  const tree = useTraceTree(latestTrace?.trace_id ?? "");

  const gate = gateStatus(summary.data);
  const isEmpty =
    !summary.isLoading &&
    (summary.data?.trace_count ?? 0) === 0 &&
    (latest.data?.traces.length ?? 0) === 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ color: tokens.ink, mb: "4px" }}>
        Overview
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.muted, mb: `${SPACE.lg}px` }}>
        {project ?? "All projects"}
      </Typography>

      <QueryBoundary
        isLoading={summary.isLoading || latest.isLoading}
        isError={summary.isError || latest.isError}
        isEmpty={isEmpty}
        emptyMessage="No traces yet — run the demo agent, or POST a trace to /api/v1/traces."
        onRetry={() => {
          summary.refetch();
          latest.refetch();
        }}
      >
        {/*
         * The spec's breakpoints (3 cols >=1024px, 2 >=768px, 1 below) don't
         * line up with MUI's default sm/lg keys (600px/1200px) and this repo
         * defines no custom breakpoints. Scoped media queries here express
         * the spec exactly without a global `breakpoints` override — this
         * page is the only breakpoint consumer in the codebase today, and a
         * global change would be invisible action-at-a-distance the moment a
         * second consumer appears.
         */}
        <Box
          sx={{
            display: "grid",
            gap: `${TILE_GAP}px`,
            gridTemplateColumns: "1fr",
            "@media (min-width:768px)": { gridTemplateColumns: "repeat(2, 1fr)" },
            "@media (min-width:1024px)": { gridTemplateColumns: "repeat(3, 1fr)" },
          }}
        >
          <Box
            sx={{
              gridColumn: "span 1",
              gridRow: "auto",
              "@media (min-width:768px)": {
                gridColumn: "span 2",
                gridRow: "span 2",
                minHeight: 240,
              },
            }}
          >
            <VerdictTile summary={summary.data} />
          </Box>

          <StatTile
            label="Gate"
            value={gate.passed ? "PASS" : "FAIL"}
            sublabel={gate.label}
            tone={gate.passed ? "pass" : "fail"}
          />

          <StatTile
            label="p99 latency"
            value={formatDuration(summary.data?.p99_latency_ms ?? null)}
            sublabel={`${summary.data?.trace_count ?? 0} traces`}
          />

          <StatTile
            label="Overall pass rate"
            value={formatPct(summary.data?.overall_pass_rate ?? null)}
            sublabel={`${summary.data?.metrics.length ?? 0} metrics`}
          />

          <Box
            sx={{
              gridColumn: "1 / -1",
              p: `${TILE_PADDING}px`,
              bgcolor: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: 2.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: tokens.muted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                mb: 1,
              }}
            >
              Latest trace
            </Typography>
            {latestTrace ? (
              <>
                <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                  <Box
                    component={RouterLink}
                    to={`/traces/${latestTrace.trace_id}`}
                    sx={{ color: tokens.brand.text, textDecoration: "none" }}
                  >
                    {latestTrace.name}
                  </Box>
                </Typography>
                <MiniWaterfall roots={tree.data ?? []} />
              </>
            ) : (
              <EmptyState
                title="No traces yet"
                body="Run the demo agent to populate this view."
              />
            )}
          </Box>
        </Box>
      </QueryBoundary>
    </Box>
  );
}
