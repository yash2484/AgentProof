import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useEvalAnalytics } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { QueryBoundary } from "../components/QueryBoundary";
import { ScopeBar } from "../components/ScopeBar";
import { MetricStrip } from "../components/MetricStrip";
import { BudgetsPanel, QualityPanel, SafetyPanel } from "../components/GroupPanels";
import { tokens, TILE_GAP, SPACE } from "../theme";

/**
 * Evals, organised by what a metric *is* rather than by when it ran.
 *
 * The page it replaces drew eight metrics as eight lines on one 0–1 axis. Three
 * of those lines meant different things by "1.0": a judge's graded estimate, a
 * binary breach flag, and a budget check. Reading them as peers was the whole
 * problem — so the axis is gone and each group gets its own form.
 *
 * Order: scope, then the strip (which is also the navigation), then one panel
 * per group. Nothing else.
 */
export function EvalsPage() {
  const { project } = useProject();
  const [days, setDays] = useState(30);
  const analytics = useEvalAnalytics(project, days);

  const data = analytics.data;
  const metrics = data?.metric_health ?? [];
  const runs = data?.eval_runs ?? [];
  const inGroup = (group: string) => metrics.filter((m) => m.group === group);

  return (
    <Box>
      <Typography variant="h4" sx={{ color: tokens.ink, mb: "4px" }}>
        Evals
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
        isEmpty={!analytics.isLoading && metrics.length === 0}
        emptyMessage="No eval results in this window — widen the range or run evals against a trace."
        onRetry={() => analytics.refetch()}
      >
        <Box sx={{ display: "grid", gap: `${TILE_GAP}px` }}>
          {/* Scope travels into every tile's href: context is in-memory, and
            * a link opened fresh would otherwise pool every project. */}
          <MetricStrip
            metrics={metrics}
            runs={runs}
            gate={data?.gate ?? []}
            project={project}
            days={days}
          />

          <QualityPanel metrics={inGroup("quality")} runs={runs} />
          <SafetyPanel metrics={inGroup("safety")} />
          <BudgetsPanel metrics={inGroup("budgets")} />

          <Typography
            variant="caption"
            sx={{ color: tokens.muted, display: "block", mb: `${SPACE.md}px` }}
          >
            Every figure counts measurements — eval rows, not traces and not
            evaluation runs. Open any metric for its distribution, its history,
            and the judge's own reasoning.
          </Typography>
        </Box>
      </QueryBoundary>
    </Box>
  );
}
