import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { BarChart, BarChartProps } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, TILE_PADDING, DATA, UI, PROSE } from "../theme";
import { SectionHeading, DataPanel, Prose, CHART_SX } from "./Ledger";
import { groupColor } from "../lib/groups";
import { metricTitle } from "../lib/metricCopy";
import type {
  SecurityFinding,
  SecurityMetricPosture,
  SecurityRunPoint,
} from "../types";

/**
 * Security reads as prevalence, not as a score.
 *
 * A security metric is 0/1 per span taken to the trace by `min`, so a mean is
 * close to meaningless and a percentage is worse — "97% safe" is not a
 * sentence anyone should be comfortable saying about a control. Every figure
 * here is a count against a denominator.
 */

const SAFE = groupColor("safety");

function Panel({
  title,
  children,
  footnote,
  ...rest
}: {
  title: string;
  children: ReactNode;
  footnote?: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Box component="section" aria-label={title} {...rest}>
      <SectionHeading>{title}</SectionHeading>
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

/**
 * The attempted denominator, in words.
 *
 * Tri-state because the three cases are genuinely different and only one of
 * them is reassuring: attacked N times, checked and never attacked, or never
 * checked at all.
 */
export function attemptCopy(metric: SecurityMetricPosture): string {
  if (!metric.attempt_signal || metric.attempted === null) {
    return "no attempt signal recorded — this control cannot say whether it was ever tested";
  }
  if (metric.attempted === 0) {
    return `no attack was attempted in ${metric.measured} measurements`;
  }
  return `${metric.attempted} of ${metric.measured} measurements were under attack`;
}

/**
 * What a flat score means, which depends on whether anything attacked it.
 *
 * The honesty rule cuts both ways. A control nothing probed has not been
 * shown to work — but a control that took five recorded attacks and never
 * moved has been, and calling that "unexercised" understates real evidence
 * exactly as badly as the reverse overstates it.
 */
export function varianceCopy(metric: SecurityMetricPosture): string {
  if (metric.attempted && metric.attempted > 0 && metric.breached === 0) {
    return `resisted every recorded attack (${metric.attempted})`;
  }
  return "never varied — an unexercised control, not a passing one";
}

export function PostureStrip({ metrics }: { metrics: SecurityMetricPosture[] }) {
  if (metrics.length === 0) {
    return (
      <Panel title="Posture" data-testid="posture-strip">
        <Prose sx={{ fontSize: 15, color: tokens.ink2 }}>
          No security metric has run in this window. Nothing here is a claim
          that the agent is safe — it is the absence of a measurement.
        </Prose>
      </Panel>
    );
  }

  return (
    <Panel
      title="Posture"
      data-testid="posture-strip"
      footnote="Counts, not rates. One breach is one breach, and a percentage would invite reading it as mostly fine."
    >
      {metrics.map((m) => {
        const clean = m.breached === 0;
        return (
          <Box
            key={m.metric_name}
            data-testid={`posture-${m.metric_name}`}
            sx={{
              py: "7px",
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
                {metricTitle(m.metric_name)}
              </Box>
              <Box
                component="span"
                sx={{ ...DATA, color: clean ? tokens.dim : tokens.status.fail }}
              >
                {clean
                  ? `no breaches in ${m.measured} measurements`
                  : `${m.breached} of ${m.measured} measurements breached`}
                {m.degraded > 0 && ` · ${m.degraded} unmeasurable`}
              </Box>
            </Box>
            <Box component="span" sx={{ ...DATA, fontSize: 11, color: tokens.dim }}>
              {attemptCopy(m)}
              {!m.has_variance && ` · ${varianceCopy(m)}`}
            </Box>
          </Box>
        );
      })}
    </Panel>
  );
}

/**
 * How much of the surface was actually probed.
 *
 * A donut is the right form here and only here: two categories, one clearly
 * dominant, and the question is proportion rather than magnitude. Pie forms
 * rely on colour alone, so the counts and the percentage sit in text beside
 * the ring rather than only inside the slices.
 */
export function AttackSurface({
  surface,
}: {
  surface: { traces: number; attacked: number; unattacked: number };
}) {
  if (surface.traces === 0) {
    return (
      <Panel title="Attack surface" data-testid="attack-surface">
        <Prose data-testid="attack-surface-empty" sx={{ fontSize: 15, color: tokens.ink2 }}>
          No trace carries a security measurement in this window.
        </Prose>
      </Panel>
    );
  }

  const pct = (surface.attacked / surface.traces) * 100;

  return (
    <Panel
      title="Attack surface"
      data-testid="attack-surface"
      footnote="A breach count means little without knowing how much of the surface was probed. Traces nobody attacked have not been shown to resist anything."
    >
      {surface.attacked === 0 ? (
        <Prose sx={{ fontSize: 15, color: tokens.ink }}>
          No attack was attempted against any of the {surface.traces} measured
          traces. Their security scores record that nothing tried, not that
          something failed.
        </Prose>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: `${SPACE.md}px`,
            flexWrap: "wrap",
          }}
        >
          <PieChart
            width={148}
            height={148}
            slotProps={{ legend: { hidden: true } }}
            series={[
              {
                innerRadius: 42,
                outerRadius: 70,
                paddingAngle: 2,
                cornerRadius: 3,
                data: [
                  { id: 0, value: surface.attacked, label: "attacked", color: SAFE },
                  {
                    id: 1,
                    value: surface.unattacked,
                    label: "not attacked",
                    // The unprobed remainder has to read against the panel it
                    // sits on, which the old raised-surface fill does not on
                    // a light ground.
                    color: tokens.hair,
                  },
                ],
              },
            ]}
          />
          <Box sx={{ display: "grid", gap: "3px", minWidth: 0 }}>
            <Box
              component="span"
              sx={{ ...DATA, fontSize: 20, fontWeight: 500, color: tokens.ink }}
            >
              {surface.attacked} of {surface.traces}
            </Box>
            <Box component="span" sx={{ ...UI, fontSize: 12.5, color: tokens.dim }}>
              traces attacked ({pct.toFixed(1)}%)
            </Box>
            <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
              {surface.unattacked} were never probed
            </Box>
          </Box>
        </Box>
      )}
    </Panel>
  );
}

/**
 * The band axis, plus the two gap ratios its own scale config defines.
 *
 * `@mui/x-charts` types `xAxis` as `AxisConfig<keyof AxisScaleConfig>`,
 * which instantiates the generic with the whole union and so exposes only
 * the members every scale shares. `categoryGapRatio` and `barGapRatio` are
 * declared on `AxisScaleConfig['band']` and read at runtime; this widens the
 * element type to admit them rather than casting the object through
 * `unknown`, so everything else on the axis stays checked.
 */
type BandAxis = NonNullable<BarChartProps["xAxis"]>[number] & {
  categoryGapRatio?: number;
  barGapRatio?: number;
};

/**
 * Breaches by run.
 *
 * Columns, not a line: runs are discrete buckets and a line between them
 * would imply a continuous quantity that was never measured in between.
 */
export function BreachTimeline({ runs }: { runs: SecurityRunPoint[] }) {
  if (runs.length === 0) {
    return (
      <Panel title="Breaches by run" data-testid="breach-timeline">
        <Prose data-testid="breach-timeline-empty" sx={{ fontSize: 15, color: tokens.ink2 }}>
          No evaluation run in this window.
        </Prose>
      </Panel>
    );
  }

  const total = runs.reduce((sum, r) => sum + r.breached, 0);

  // Declared here rather than inline: an object literal handed straight to a
  // prop stays "fresh" and gets excess-property-checked against the narrower
  // declared type, which rejects the gap ratios even though they are real.
  const runAxis: BandAxis = {
    scaleType: "band",
    // Two runs at the default gap render as two slabs filling half the frame
    // each, which reads as an area rather than a count. A column should look
    // like a measurement.
    categoryGapRatio: 0.7,
    barGapRatio: 0.2,
    data: runs.map((_r, i) => `#${i + 1}`),
    valueFormatter: (label: string, ctx) =>
      ctx?.location === "tick"
        ? label
        : new Date(
            runs[Number(label.slice(1)) - 1]?.run_at ?? "",
          ).toLocaleDateString(),
  };

  return (
    <Panel
      title="Breaches by run"
      data-testid="breach-timeline"
      footnote={
        total === 0
          ? `No breaches recorded across ${runs.length} ${runs.length === 1 ? "run" : "runs"}. That is the good outcome, stated rather than left as a blank frame.`
          : "Each column is one evaluation run. Runs are discrete, so nothing is drawn between them."
      }
    >
      <BarChart
        height={180}
        margin={{ top: 8, right: 16, bottom: 24, left: 32 }}
        slotProps={{ legend: { hidden: true } }}
        grid={{ horizontal: true }}
        sx={CHART_SX}
        xAxis={[runAxis]}
        // Breaches are counted, so the axis is stepped in whole ones. The
        // default scale labelled a single breach as "0.0 / 0.5 / 1.0", which
        // invites reading half a breach as a thing that can happen.
        yAxis={[{ min: 0, tickMinStep: 1 }]}
        series={[
          { data: runs.map((r) => r.breached), label: "breached", color: tokens.status.fail },
        ]}
      />
    </Panel>
  );
}

export function FindingsList({ findings }: { findings: SecurityFinding[] }) {
  return (
    <Panel
      title="Findings"
      data-testid="security-findings"
      footnote="Only failures are listed. Passing rows are counted above, never enumerated."
    >
      {findings.length === 0 ? (
        <Prose data-testid="findings-empty" sx={{ fontSize: 15, color: tokens.ink2 }}>
          No security failure in this window. Read that alongside the attack
          surface above — nothing failed, and much of it was never attacked.
        </Prose>
      ) : (
        <Box sx={{ display: "grid", gap: `${SPACE.md}px` }}>
          {findings.map((f) => (
            <Box
              key={`${f.trace_id}-${f.metric_name}-${f.evaluated_at}`}
              data-testid={`finding-${f.trace_id}`}
              sx={{
                borderTop: `1px solid ${tokens.hair}`,
                pt: `${SPACE.sm}px`,
                "&:first-of-type": { borderTop: "none", pt: 0 },
              }}
            >
              <Box
                sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}
              >
                <Box
                  component="span"
                  sx={{ ...DATA, color: tokens.status.fail, fontWeight: 600 }}
                >
                  {metricTitle(f.metric_name)}
                </Box>
                <Box
                  component={RouterLink}
                  to={`/traces/${f.trace_id}`}
                  data-testid={`finding-link-${f.trace_id}`}
                  sx={{
                    ...DATA,
                    color: tokens.link,
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {f.trace_id.slice(0, 12)}… →
                </Box>
                <Box component="span" sx={{ ...DATA, fontSize: 11, color: tokens.dim }}>
                  {f.attempted === true
                    ? "attack attempted"
                    : f.attempted === false
                      ? "no attack attempted — failed anyway"
                      : "attack status not recorded"}
                  {f.evaluated_at &&
                    ` · ${new Date(f.evaluated_at).toLocaleString()}`}
                </Box>
              </Box>
              {f.explanation && (
                <Box component="div" sx={{ ...DATA, color: tokens.ink, mt: "4px" }}>
                  {f.explanation}
                </Box>
              )}
              {f.reasoning.map((r, i) => (
                <Prose
                  key={`${r.span_id}-${i}`}
                  sx={{
                    color: r.error ? tokens.status.watch : tokens.ink,
                    mt: `${SPACE.xs}px`,
                    whiteSpace: "pre-wrap",
                    borderLeft: `2px solid ${r.error ? tokens.status.watch : tokens.hairStrong}`,
                    pl: `${SPACE.sm}px`,
                  }}
                >
                  {r.error ?? r.reasoning}
                </Prose>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Panel>
  );
}
