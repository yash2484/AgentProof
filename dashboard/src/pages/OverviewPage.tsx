import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useEvalAnalytics } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { QueryBoundary } from "../components/QueryBoundary";
import { ScopeBar } from "../components/ScopeBar";
import { VerdictBand } from "../components/VerdictBand";
import { VariancePanel } from "../components/VariancePanel";
import { TrustBand } from "../components/TrustBand";
import { FindingsFeed } from "../components/FindingsFeed";
import { tokens, TILE_GAP, SPACE } from "../theme";

/**
 * Overview — triage, not detail.
 *
 * Every other page answers a question. This one answers the question no other
 * page does:
 *
 *   Since last time — did anything get worse, and can I trust today's numbers?
 *
 * It used to try to answer a different one ("how is every metric doing?"),
 * which is `/evals`' job, and it answered it with a worse chart than the one
 * `/evals/:metric` already had — a 46px track carrying a histogram, a
 * threshold, a mean and a ±0.2 band with no legend, in which a single data
 * exfiltration breach rendered 0.45px tall because bar height was normalised
 * by the tallest bin. Rare events became invisible in proportion to their
 * rarity. That panel is deleted rather than redesigned; the detail it
 * duplicated is one click away and correct there.
 *
 * Four bands, ordered by what a reader does with them:
 *
 *   1. Verdict     — the conclusion, in words, on the page ground.
 *   2. What changed — run to run, per group, with the noise floor stated.
 *   3. What you can trust — coverage, broken measurements, provenance.
 *   4. Where to look — findings, each routing to the page that owns it.
 *
 * Hierarchy comes from structure rather than chrome: band 1 is not a card, so
 * nothing competes with it; bands 2 and 3 are cards; band 4 is a list. Five
 * bordered boxes of equal weight is what made the old page unreadable.
 */
export function OverviewPage() {
  const { project } = useProject();
  const [days, setDays] = useState(30);
  const analytics = useEvalAnalytics(project, days);

  const data = analytics.data;
  const isEmpty = !analytics.isLoading && (data?.totals.traces ?? 0) === 0;

  return (
    <Box>
      <ScopeBar
        title="Overview"
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
          <VerdictBand analytics={data} project={project} />

          <VariancePanel runs={data?.eval_runs ?? []} />

          <TrustBand analytics={data} />

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
