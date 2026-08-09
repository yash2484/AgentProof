import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useEvalAnalytics } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { QueryBoundary } from "../components/QueryBoundary";
import { ScopeBar } from "../components/ScopeBar";
import { GateVerdictCard } from "../components/GateVerdictCard";
import { VolumeCard } from "../components/VolumeCard";
import { MeasurementHealth } from "../components/MeasurementHealth";
import { MetricHealthPanel } from "../components/MetricHealthPanel";
import { VariancePanel } from "../components/VariancePanel";
import { FindingsFeed } from "../components/FindingsFeed";
import { tokens, TILE_GAP, SPACE } from "../theme";

/**
 * Overview, ordered by cost of being wrong.
 *
 * Band 1 is the 60-second read: the gate verdict, how much ran, and whether
 * the measurements themselves held up. Band 2 is the hero — every metric
 * visible, split into the ones that move and the ones that never have. Band 3
 * is run-to-run variance, and Band 5 the findings.
 *
 * The governing principle throughout: every alarming statement carries a
 * denominator and a time window, every judge number shows its ±0.2 noise, and
 * the screen never launders untested or unmeasured into passing.
 */
export function OverviewPage() {
  const { project } = useProject();
  const [days, setDays] = useState(30);
  const analytics = useEvalAnalytics(project, days);

  const data = analytics.data;
  const isEmpty = !analytics.isLoading && (data?.totals.traces ?? 0) === 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ color: tokens.ink, mb: "4px" }}>
        Overview
      </Typography>

      <ScopeBar
        project={project}
        days={days}
        onDaysChange={setDays}
        runs={data?.eval_runs}
      />

      <QueryBoundary
        isLoading={analytics.isLoading}
        isError={analytics.isError}
        isEmpty={isEmpty}
        emptyMessage="No traces in this window — widen the range, run the demo agent, or POST a trace to /api/v1/traces."
        onRetry={() => analytics.refetch()}
      >
        <Box sx={{ display: "grid", gap: `${TILE_GAP}px` }}>
          {/* Band 1 — the 60-second read. The gate takes two of three columns
            * because it is the only card carrying a claim about change. */}
          <Box
            sx={{
              display: "grid",
              gap: `${TILE_GAP}px`,
              gridTemplateColumns: "1fr",
              "@media (min-width:768px)": { gridTemplateColumns: "repeat(2, 1fr)" },
              "@media (min-width:1024px)": { gridTemplateColumns: "2fr 1fr 1fr" },
            }}
          >
            <Box sx={{ "@media (min-width:768px)": { gridColumn: "span 2" }, "@media (min-width:1024px)": { gridColumn: "span 1" } }}>
              <GateVerdictCard gate={data?.gate ?? []} />
            </Box>
            <VolumeCard analytics={data} />
            <MeasurementHealth totals={data?.totals} />
          </Box>

          {/* Band 2 — hero, full width. */}
          <MetricHealthPanel analytics={data} />

          {/* Band 3 — variance. The slot is reserved at every n. */}
          <VariancePanel runs={data?.eval_runs ?? []} />

          {/* Band 5 — findings. */}
          <FindingsFeed analytics={data} project={project} />

          <Typography
            variant="caption"
            sx={{ color: tokens.muted, display: "block", mb: `${SPACE.md}px` }}
          >
            {data
              ? `${data.outcome_split.passed} passed · ${data.outcome_split.failed} failed · ${data.outcome_split.degraded} degraded measurements, across ${data.totals.eval_runs} ${data.totals.eval_runs === 1 ? "run" : "runs"} ${days === 0 ? "over all history" : `in the last ${days} days`}.`
              : null}
          </Typography>
        </Box>
      </QueryBoundary>
    </Box>
  );
}
