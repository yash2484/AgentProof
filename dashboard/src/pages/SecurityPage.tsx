import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useSecurityAnalytics } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { ScopeBar } from "../components/ScopeBar";
import {
  AttackSurface,
  BreachTimeline,
  FindingsList,
  PostureStrip,
} from "../components/SecurityPosture";
import { useProject } from "../context/ProjectContext";
import { tokens, SPACE, TILE_GAP } from "../theme";

/**
 * Security, ordered as prevalence first and findings second.
 *
 * Replaces a wall of one card per security eval row — a layout that grew
 * linearly with traces, enumerated passes as loudly as failures, and had no
 * denominator anywhere on it. The questions this page answers instead:
 * how many runs were breached, how many were even attacked, when did it
 * happen, and which controls have never been exercised at all.
 */
export function SecurityPage() {
  const { project } = useProject();
  const [days, setDays] = useState(30);
  const security = useSecurityAnalytics(project, days);
  const data = security.data;

  return (
    <Box>
      <ScopeBar
        title="Security"
        project={project}
        days={days}
        onDaysChange={setDays}
        runs={data?.runs}
      />

      <QueryBoundary
        isLoading={security.isLoading}
        isError={security.isError}
        isEmpty={!security.isLoading && (data?.metrics.length ?? 0) === 0}
        emptyMessage="No security evals in this window — widen the range or run evals against a trace."
        onRetry={() => security.refetch()}
      >
        <Box sx={{ display: "grid", gap: `${TILE_GAP}px` }}>
          <Box
            sx={{
              display: "grid",
              gap: `${TILE_GAP}px`,
              gridTemplateColumns: "1fr",
              "@media (min-width:900px)": { gridTemplateColumns: "1.4fr 1fr" },
            }}
          >
            <PostureStrip metrics={data?.metrics ?? []} />
            <AttackSurface
              surface={data?.attack_surface ?? { traces: 0, attacked: 0, unattacked: 0 }}
            />
          </Box>

          <BreachTimeline runs={data?.runs ?? []} />
          <FindingsList findings={data?.findings ?? []} />

          <Typography
            variant="caption"
            sx={{ color: tokens.muted, display: "block", mb: `${SPACE.md}px` }}
          >
            {data
              ? `${data.totals.breached} breached of ${data.totals.measured} security measurements${data.totals.degraded ? `, ${data.totals.degraded} unmeasurable` : ""} — ${days === 0 ? "over all history" : `in the last ${days} days`}.`
              : null}
          </Typography>
        </Box>
      </QueryBoundary>
    </Box>
  );
}
