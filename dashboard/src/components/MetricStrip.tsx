import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, TABULAR_NUMS } from "../theme";
import { GROUP_ORDER, groupColor, groupLabel, groupQuestion } from "../lib/groups";
import { metricTitle } from "../lib/metricCopy";
import { metricSeverity } from "../lib/analytics";
import { SeverityChip } from "./SeverityChip";
import type { AnalyticsEvalRun, GateVerdict, MetricGroup, MetricHealth } from "../types";

/**
 * How far this metric moved between the last two runs that measured it.
 *
 * Runs that did not measure the metric are skipped rather than read as zero.
 * A run where every judge call broke has no entry at all, and treating that
 * gap as 0 would draw a cliff followed by a recovery, neither of which
 * happened.
 */
export function deltaVsPreviousRun(
  runs: AnalyticsEvalRun[],
  metricName: string,
): number | null {
  const measured = runs
    .map((r) => r.metric_means?.[metricName])
    .filter((v): v is number => typeof v === "number");
  if (measured.length < 2) return null;
  return measured[measured.length - 1] - measured[measured.length - 2];
}

/** Direction in words, because a sign alone is not readable at a glance. */
function deltaCopy(delta: number | null): string {
  if (delta === null) return "first run — nothing to compare";
  if (delta === 0) return "unchanged since the previous run";
  const direction = delta > 0 ? "up" : "down";
  return `${direction} ${Math.abs(delta).toFixed(3)} since the previous run`;
}

/**
 * The scope travels in the link, not just in React context.
 *
 * Context is in-memory: a deep link opened in a fresh tab loses the project
 * and falls back to every project, which pools the generated corpus into a
 * real one's figures without saying so. The window travels for the same
 * reason — a tile reading "2 of 27" must not open a page reading 321.
 */
export function metricHref(
  metricName: string,
  project: string | null | undefined,
  days: number | undefined,
): string {
  const params = new URLSearchParams();
  if (project) params.set("project", project);
  if (days !== undefined) params.set("days", String(days));
  const query = params.toString();
  return `/evals/${metricName}${query ? `?${query}` : ""}`;
}

function MetricTile({
  metric,
  runs,
  gate,
  project,
  days,
}: {
  metric: MetricHealth;
  runs: AnalyticsEvalRun[];
  gate: GateVerdict | undefined;
  project: string | null | undefined;
  days: number | undefined;
}) {
  const delta = deltaVsPreviousRun(runs, metric.metric_name);
  const severity = metricSeverity(metric, gate);

  return (
    <Box
      component={RouterLink}
      to={metricHref(metric.metric_name, project, days)}
      data-testid={`metric-tile-${metric.metric_name}`}
      sx={{
        display: "block",
        minWidth: 208,
        flex: "1 1 208px",
        p: `${SPACE.sm}px`,
        borderRadius: 2,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        textDecoration: "none",
        transition: "background-color 120ms ease-out, border-color 120ms ease-out",
        "&:hover": { bgcolor: tokens.surfaceRaised, borderColor: tokens.muted },
        "&:focus-visible": {
          outline: `2px solid ${tokens.brand.solid}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: groupColor(metric.group),
            flexShrink: 0,
          }}
        />
        <Typography variant="body2" sx={{ color: tokens.ink, flex: 1 }} noWrap>
          {metricTitle(metric.metric_name)}
        </Typography>
        <SeverityChip severity={severity} />
      </Box>

      <Typography variant="h5" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
        {metric.mean_score === null ? "—" : metric.mean_score.toFixed(3)}
      </Typography>

      <Typography
        data-testid={`metric-delta-${metric.metric_name}`}
        variant="caption"
        sx={{ color: tokens.muted, display: "block", ...TABULAR_NUMS }}
      >
        {deltaCopy(delta)}
      </Typography>

      <Typography
        variant="caption"
        sx={{ color: tokens.muted, display: "block", ...TABULAR_NUMS }}
      >
        {metric.failed} of {metric.count} flagged
        {metric.degraded > 0 ? ` · ${metric.degraded} degraded` : ""}
      </Typography>
    </Box>
  );
}

/**
 * The page's navigation: every metric, clustered under the question its group
 * answers.
 *
 * Clustered rather than laid out as one uniform eight-up grid, because the
 * grouping *is* the information — a judge score and a breach flag sitting
 * side by side as peers is the reading this page exists to prevent. The
 * group's colour is a key, never the only channel: the cluster heading names
 * it and every tile carries its own words.
 */
export function MetricStrip({
  metrics,
  runs,
  gate,
  project,
  days,
}: {
  metrics: MetricHealth[];
  runs: AnalyticsEvalRun[];
  gate: GateVerdict[];
  project?: string | null;
  days?: number;
}) {
  if (metrics.length === 0) return null;

  const gateFor = (name: string) => gate.find((g) => g.metric_name === name);
  const byGroup = GROUP_ORDER.map((group) => ({
    group,
    members: metrics.filter((m) => m.group === group),
  })).filter((cluster) => cluster.members.length > 0);

  return (
    <Box data-testid="metric-strip" sx={{ display: "grid", gap: `${SPACE.lg}px` }}>
      {byGroup.map(({ group, members }) => (
        <GroupCluster key={group} group={group} members={members}>
          {members.map((metric) => (
            <MetricTile
              key={metric.metric_name}
              metric={metric}
              runs={runs}
              gate={gateFor(metric.metric_name)}
              project={project}
              days={days}
            />
          ))}
        </GroupCluster>
      ))}
    </Box>
  );
}

function GroupCluster({
  group,
  members,
  children,
}: {
  group: MetricGroup;
  members: MetricHealth[];
  children: React.ReactNode;
}) {
  return (
    <Box component="section" aria-label={groupLabel(group)}>
      <Typography variant="subtitle1" sx={{ color: tokens.ink }}>
        {groupLabel(group)}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.muted, mb: 1 }}>
        {groupQuestion(group)} · {members.length}{" "}
        {members.length === 1 ? "metric" : "metrics"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.sm}px` }}>
        {children}
      </Box>
    </Box>
  );
}
