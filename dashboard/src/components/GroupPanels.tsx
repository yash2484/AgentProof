import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { tokens, SPACE, TILE_PADDING, DATA, UI, PROSE, H3 } from "../theme";
import { DataPanel, Prose, CHART_SX } from "./Ledger";
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
 * Series steps within a group: the group hue, moved along lightness.
 *
 * Lightness rather than opacity. A translucent line reads as the same colour
 * dimmed, not as a second series — two lines at 100% and 62% opacity were
 * indistinguishable at chart scale.
 *
 * Negative steps darken toward ink, positive steps lighten toward paper. On
 * the old dark ground every step went toward white and got *more* legible;
 * on paper that same ramp walks the last three series into the background.
 * Only one lightening step survives the 3:1 non-text floor here, so the rest
 * of the ramp goes the other way. `GroupPanels.test.tsx` asserts the floor
 * for every step of every group hue.
 */
const SERIES_STEPS = [0, -0.42, 0.18, -0.72];

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
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: "2px" }}>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: groupColor(group),
            flexShrink: 0,
          }}
        />
        <Typography component="h2" sx={{ ...H3, color: tokens.ink }}>
          {groupLabel(group)}
        </Typography>
      </Box>
      {/* The question the group answers, in serif. It is the one line on this
        * page written for someone who does not run evals, and the panel leads
        * with it on purpose — the statistic underneath means nothing without
        * knowing what was being asked. */}
      <Prose sx={{ fontSize: 15, color: tokens.ink2, mb: `${SPACE.xs}px` }}>
        {groupQuestion(group)}
      </Prose>

      <DataPanel sx={{ p: `${TILE_PADDING}px` }}>
        {children}
        {footnote && (
          <Typography
            sx={{
              ...PROSE,
              fontSize: 14,
              maxWidth: "88ch",
              color: tokens.dim,
              mt: `${SPACE.sm}px`,
            }}
          >
            {footnote}
          </Typography>
        )}
      </DataPanel>
    </Box>
  );
}

function EmptyGroup({ group, body }: { group: MetricGroup; body: string }) {
  return (
    <PanelShell group={group}>
      <Typography
        data-testid={`group-empty-${group}`}
        sx={{ ...PROSE, fontSize: 15, color: tokens.ink2 }}
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
      <Box component="span" sx={{ ...UI, fontSize: 12.5, color: tokens.ink2 }}>
        {metricTitle(name)}
      </Box>
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
          grid={{ horizontal: true }}
          sx={CHART_SX}
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
        <Typography sx={{ ...PROSE, fontSize: 15, color: tokens.ink2 }}>
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
        py: "6px",
        borderTop: `1px solid ${tokens.hair}`,
        "&:first-of-type": { borderTop: "none" },
      }}
    >
      <Box component="span" sx={{ ...DATA, color: tokens.ink }}>
        {metricTitle(metric.metric_name)}
      </Box>
      <Box
        component="span"
        sx={{ ...DATA, color: clean ? tokens.dim : tokens.status.fail }}
      >
        {clean
          ? `no breaches in ${metric.count} measurements`
          : `${breached} of ${metric.count} measurements breached`}
        {metric.degraded > 0 && ` · ${metric.degraded} unmeasurable`}
      </Box>
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
      sx={{
        py: "6px",
        borderTop: `1px solid ${tokens.hair}`,
        "&:first-of-type": { borderTop: "none" },
      }}
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
        <Box component="span" sx={{ ...DATA, color: tokens.ink }}>
          {metricTitle(metric.metric_name)}
        </Box>
        <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
          {within} of {metric.count} within limit
          {rate !== null && ` · ${rate.toFixed(1)}%`}
        </Box>
      </Box>
      <Box
        aria-hidden
        sx={{
          mt: "5px",
          height: 5,
          borderRadius: "2px",
          // The track is the shortfall, so it must read against the panel.
          bgcolor: tokens.hair,
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
 * `#RRGGBB` moved along lightness: negative toward ink, positive toward paper.
 *
 * Exported for the contrast check — every step must stay above the 3:1
 * non-text floor against the ground it is drawn on, which no longer comes
 * for free the way mixing toward white did on a dark theme.
 */
export function shade(hex: string, amount: number): string {
  if (amount === 0) return hex;
  const target = amount < 0 ? tokens.ink : tokens.paper;
  const weight = Math.min(Math.abs(amount), 1);
  const read = (s: string) =>
    [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const from = read(hex);
  const to = read(target);
  const mixed = from.map((c, i) => Math.round(c * (1 - weight) + to[i] * weight));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour for the nth series inside a group. */
export function seriesColor(group: MetricGroup, index: number): string {
  return shade(
    groupColor(group),
    SERIES_STEPS[Math.min(index, SERIES_STEPS.length - 1)],
  );
}
