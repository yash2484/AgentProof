import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { tokens, SPACE, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { JUDGE_NOISE, groupColor, groupLabel, groupQuestion } from "../lib/groups";
import { metricTitle } from "../lib/metricCopy";
import { axisFloor } from "./VariancePanel";
import type { AnalyticsEvalRun, MetricGroup, MetricHealth } from "../types";

/**
 * Each group gets its own chart form and its own axis, so nothing is drawn as
 * a peer of something it cannot be compared to.
 *
 * - Quality is graded 0–1 with judge noise → a distribution over runs.
 * - Safety is 0/1 per span taken to the trace by min → a prevalence count.
 * - Budgets are binary compliance → a rate, with its margin disclaimed.
 *
 * Reading the same shape three times is what made the old single chart
 * unreadable: eight lines sharing one axis, three of which meant different
 * things by "1.0".
 */

/**
 * Series colours within a group: the group hue, stepped by lightness.
 *
 * Lightness rather than opacity. On a dark surface a translucent line reads
 * as the same colour dimmed, not as a second series — two magenta lines at
 * 100% and 62% opacity were indistinguishable at chart scale. Mixing toward
 * white separates them while keeping the group legible as one family, and
 * every series carries its name in the key regardless.
 */
const SERIES_LIGHTEN = [0, 0.45, 0.7, 0.85];

function PanelShell({
  group,
  children,
  footnote,
}: {
  group: MetricGroup;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <Box
      component="section"
      data-testid={`group-panel-${group}`}
      aria-label={groupLabel(group)}
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: groupColor(group),
            alignSelf: "center",
          }}
        />
        <Typography variant="subtitle1" sx={{ color: tokens.ink }}>
          {groupLabel(group)}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          {groupQuestion(group)}
        </Typography>
      </Box>
      <Box sx={{ mt: `${SPACE.sm}px` }}>{children}</Box>
      {footnote && (
        <Typography
          variant="caption"
          sx={{ color: tokens.muted, display: "block", mt: `${SPACE.sm}px` }}
        >
          {footnote}
        </Typography>
      )}
    </Box>
  );
}

function EmptyGroup({ group, body }: { group: MetricGroup; body: string }) {
  return (
    <PanelShell group={group}>
      <Typography
        data-testid={`group-empty-${group}`}
        variant="body2"
        sx={{ color: tokens.muted }}
      >
        {body}
      </Typography>
    </PanelShell>
  );
}

function MetricKey({ name, color }: { name: string; color: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Box
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }}
      />
      <Typography variant="caption" sx={{ color: tokens.ink }}>
        {metricTitle(name)}
      </Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Answer quality — graded, so read the movement
// ---------------------------------------------------------------------------

export function QualityPanel({
  metrics,
  runs,
}: {
  metrics: MetricHealth[];
  runs: AnalyticsEvalRun[];
}) {
  if (metrics.length === 0) {
    return (
      <EmptyGroup
        group="quality"
        body="No judged metric has run in this window. Answer quality is measured by a judge model, so this panel fills in after an evaluation run."
      />
    );
  }

  const points = runs.filter((r) =>
    metrics.some((m) => typeof r.metric_means?.[m.metric_name] === "number"),
  );
  const series = metrics.map((m, i) => ({
    label: metricTitle(m.metric_name),
    data: points.map((p) => p.metric_means?.[m.metric_name] ?? null),
    color: seriesColor("quality", i),
    connectNulls: false,
    showMark: points.length <= 12,
  }));
  const floor = axisFloor(
    series.flatMap((s) => s.data.filter((v): v is number => v !== null)),
  );

  return (
    <PanelShell
      group="quality"
      footnote={
        <>
          Judged scores carry a ±{JUDGE_NOISE} swing between runs on identical
          input, so a move smaller than that is not evidence of anything.
          {floor > 0 && ` Axis starts at ${floor.toFixed(2)}, not 0.`}
        </>
      }
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.sm}px`, mb: 0.5 }}>
        {metrics.map((m, i) => (
          <MetricKey
            key={m.metric_name}
            name={m.metric_name}
            color={seriesColor("quality", i)}
          />
        ))}
      </Box>
      {points.length >= 2 ? (
        <LineChart
          height={200}
          margin={{ top: 8, right: 16, bottom: 24, left: 40 }}
          slotProps={{ legend: { hidden: true } }}
          xAxis={[
            {
              data: points.map((_p, i) => i),
              scaleType: "point",
              valueFormatter: (i: number, ctx) =>
                ctx?.location === "tick"
                  ? `#${i + 1}`
                  : new Date(points[i].run_at).toLocaleDateString(),
            },
          ]}
          yAxis={[{ min: floor, max: 1 }]}
          series={series}
        />
      ) : (
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          One run so far. A second is what turns a score into a movement.
        </Typography>
      )}
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Adversarial safety — prevalence, never a rate
// ---------------------------------------------------------------------------

function PrevalenceRow({ metric }: { metric: MetricHealth }) {
  const breached = metric.failed;
  const clean = breached === 0;

  return (
    <Box
      data-testid={`prevalence-${metric.metric_name}`}
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 1,
        flexWrap: "wrap",
        py: 1,
        borderTop: `1px solid ${tokens.border}`,
      }}
    >
      <Typography variant="body2" sx={{ color: tokens.ink }}>
        {metricTitle(metric.metric_name)}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: clean ? tokens.muted : tokens.status.fail,
          ...TABULAR_NUMS,
        }}
      >
        {clean
          ? `no breaches in ${metric.count} measurements`
          : `${breached} of ${metric.count} measurements breached`}
        {metric.degraded > 0 && ` · ${metric.degraded} unmeasurable`}
      </Typography>
    </Box>
  );
}

export function SafetyPanel({ metrics }: { metrics: MetricHealth[] }) {
  if (metrics.length === 0) {
    return (
      <EmptyGroup
        group="safety"
        body="No security metric has run in this window. Nothing here is a claim that the agent is safe — it is the absence of a measurement."
      />
    );
  }

  const unexercised = metrics.filter((m) => !m.has_variance);

  return (
    <PanelShell
      group="safety"
      footnote={
        unexercised.length > 0 ? (
          <>
            {unexercised.map((m) => metricTitle(m.metric_name)).join(", ")}{" "}
            {unexercised.length === 1 ? "has" : "have"} never varied — no
            scenario in this window stressed{" "}
            {unexercised.length === 1 ? "it" : "them"}. That is an unexercised
            control, not a passing one.
          </>
        ) : (
          <>
            Counts, not rates. One breach is one breach, and a percentage would
            invite reading it as mostly fine.
          </>
        )
      }
    >
      {metrics.map((m) => (
        <PrevalenceRow key={m.metric_name} metric={m} />
      ))}
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Budgets & contracts — compliance, with the margin disclaimed
// ---------------------------------------------------------------------------

function ComplianceRow({ metric }: { metric: MetricHealth }) {
  const within = metric.count - metric.failed;
  const rate = metric.count > 0 ? (within / metric.count) * 100 : null;

  return (
    <Box
      data-testid={`compliance-${metric.metric_name}`}
      sx={{ py: 1, borderTop: `1px solid ${tokens.border}` }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="body2" sx={{ color: tokens.ink }}>
          {metricTitle(metric.metric_name)}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          {within} of {metric.count} within limit
          {rate !== null && ` · ${rate.toFixed(1)}%`}
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{
          mt: 0.75,
          height: 6,
          borderRadius: 1,
          bgcolor: tokens.surfaceRaised,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${rate ?? 0}%`,
            height: "100%",
            bgcolor: groupColor("budgets"),
          }}
        />
      </Box>
    </Box>
  );
}

export function BudgetsPanel({ metrics }: { metrics: MetricHealth[] }) {
  if (metrics.length === 0) {
    return (
      <EmptyGroup
        group="budgets"
        body="No budget or contract check has run in this window."
      />
    );
  }

  return (
    <PanelShell
      group="budgets"
      footnote={
        <>
          Measured, not judged — a failure here is a fact, not an estimate. A
          compliance rate hides the margin: it cannot show how close the
          passing runs ran to their limit, which is where the next regression
          lands first. Open a metric to see the underlying quantity.
        </>
      }
    >
      {metrics.map((m) => (
        <ComplianceRow key={m.metric_name} metric={m} />
      ))}
    </PanelShell>
  );
}

/**
 * `#RRGGBB` mixed toward white, for stepping one hue across a group's series.
 *
 * Exported for the contrast check: every step must stay above the 3:1
 * non-text floor against the surface, which mixing toward white on a dark
 * theme only improves.
 */
export function lighten(hex: string, amount: number): string {
  if (amount <= 0) return hex;
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mixed = channels.map((c) => Math.round(c + (255 - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour for the nth series inside a group. */
export function seriesColor(group: MetricGroup, index: number): string {
  return lighten(
    groupColor(group),
    SERIES_LIGHTEN[Math.min(index, SERIES_LIGHTEN.length - 1)],
  );
}
