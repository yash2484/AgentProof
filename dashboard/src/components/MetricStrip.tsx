import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, DATA, UI, RADIUS, H3 } from "../theme";

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
        minWidth: 196,
        flex: "1 1 196px",
        p: `${SPACE.sm}px`,
        borderRadius: `${RADIUS}px`,
        bgcolor: tokens.data,
        border: `1px solid ${tokens.hair}`,
        textDecoration: "none",
        transition: "background-color 150ms ease-out, border-color 150ms ease-out",
        "&:hover": { bgcolor: tokens.card, borderColor: tokens.hairStrong },
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
        <Box
          component="span"
          sx={{ ...DATA, color: tokens.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {metricTitle(metric.metric_name)}
        </Box>
        <SeverityChip severity={severity} />
      </Box>

      <Box
        component="div"
        sx={{ ...DATA, fontSize: 19, fontWeight: 500, lineHeight: 1.2, color: tokens.ink }}
      >
        {metric.mean_score === null ? "—" : metric.mean_score.toFixed(3)}
      </Box>

      <Typography
        data-testid={`metric-delta-${metric.metric_name}`}
        sx={{ ...DATA, fontSize: 11, color: tokens.dim, display: "block", mt: "3px" }}
      >
        {deltaCopy(delta)}
      </Typography>

      <Typography
        sx={{ ...DATA, fontSize: 11, color: tokens.dim, display: "block" }}
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
      <Typography component="h2" sx={{ ...H3, color: tokens.ink }}>
        {groupLabel(group)}
      </Typography>
      {/* Sans, not serif. The group panels further down lead with this same
        * question and are the place it is argued; here it is a signpost over
        * a row of tiles. Setting both in serif prose put the identical
        * sentence on screen twice in the same voice, which read as a stutter
        * rather than as reinforcement. */}
      <Box
        component="p"
        sx={{ ...UI, fontSize: 13, color: tokens.dim, mb: "6px" }}
      >
        {groupQuestion(group)} · {members.length}{" "}
        {members.length === 1 ? "metric" : "metrics"}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.sm}px` }}>
        {children}
      </Box>
    </Box>
  );
}
