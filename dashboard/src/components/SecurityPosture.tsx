import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, TILE_PADDING, TABULAR_NUMS } from "../theme";
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
    <Box
      component="section"
      aria-label={title}
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
      }}
      {...rest}
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
        {title}
      </Typography>
      {children}
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
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          No security metric has run in this window. Nothing here is a claim
          that the agent is safe — it is the absence of a measurement.
        </Typography>
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
            sx={{ py: 1.25, borderTop: `1px solid ${tokens.border}` }}
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
                {metricTitle(m.metric_name)}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: clean ? tokens.muted : tokens.status.fail.text,
                  ...TABULAR_NUMS,
                }}
              >
                {clean
                  ? `no breaches in ${m.measured} measurements`
                  : `${m.breached} of ${m.measured} measurements breached`}
                {m.degraded > 0 && ` · ${m.degraded} unmeasurable`}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: tokens.muted, display: "block" }}>
              {attemptCopy(m)}
              {!m.has_variance && ` · ${varianceCopy(m)}`}
            </Typography>
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
        <Typography
          data-testid="attack-surface-empty"
          variant="body2"
          sx={{ color: tokens.muted }}
        >
          No trace carries a security measurement in this window.
        </Typography>
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
        <Typography variant="body2" sx={{ color: tokens.ink }}>
          No attack was attempted against any of the {surface.traces} measured
          traces. Their security scores record that nothing tried, not that
          something failed.
        </Typography>
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
                    color: tokens.surfaceRaised,
                  },
                ],
              },
            ]}
          />
          <Box sx={{ display: "grid", gap: 0.5, ...TABULAR_NUMS }}>
            <Typography variant="h5" sx={{ color: tokens.ink }}>
              {surface.attacked}{" "}
              <Box component="span" sx={{ color: tokens.muted, fontSize: 14 }}>
                of {surface.traces} traces attacked ({pct.toFixed(1)}%)
              </Box>
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.muted }}>
              {surface.unattacked} were never probed
            </Typography>
          </Box>
        </Box>
      )}
    </Panel>
  );
}

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
        <Typography
          data-testid="breach-timeline-empty"
          variant="body2"
          sx={{ color: tokens.muted }}
        >
          No evaluation run in this window.
        </Typography>
      </Panel>
    );
  }

  const total = runs.reduce((sum, r) => sum + r.breached, 0);

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
        xAxis={[
          {
            scaleType: "band",
            data: runs.map((_r, i) => `#${i + 1}`),
            valueFormatter: (label: string, ctx) =>
              ctx?.location === "tick"
                ? label
                : new Date(
                    runs[Number(label.slice(1)) - 1]?.run_at ?? "",
                  ).toLocaleDateString(),
          },
        ]}
        yAxis={[{ min: 0 }]}
        series={[
          { data: runs.map((r) => r.breached), label: "breached", color: tokens.status.fail.solid },
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
        <Typography
          data-testid="findings-empty"
          variant="body2"
          sx={{ color: tokens.muted }}
        >
          No security failure in this window. Read that alongside the attack
          surface above — nothing failed, and much of it was never attacked.
        </Typography>
      ) : (
        <Box sx={{ display: "grid", gap: `${SPACE.md}px` }}>
          {findings.map((f) => (
            <Box
              key={`${f.trace_id}-${f.metric_name}-${f.evaluated_at}`}
              data-testid={`finding-${f.trace_id}`}
              sx={{ borderTop: `1px solid ${tokens.border}`, pt: 1.5 }}
            >
              <Box
                sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: tokens.status.fail.text, fontWeight: 600 }}
                >
                  {metricTitle(f.metric_name)}
                </Typography>
                <Box
                  component={RouterLink}
                  to={`/traces/${f.trace_id}`}
                  data-testid={`finding-link-${f.trace_id}`}
                  sx={{
                    color: tokens.brand.text,
                    textDecoration: "none",
                    fontSize: 13,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {f.trace_id.slice(0, 12)}… →
                </Box>
                <Typography variant="caption" sx={{ color: tokens.muted }}>
                  {f.attempted === true
                    ? "attack attempted"
                    : f.attempted === false
                      ? "no attack attempted — failed anyway"
                      : "attack status not recorded"}
                  {f.evaluated_at &&
                    ` · ${new Date(f.evaluated_at).toLocaleString()}`}
                </Typography>
              </Box>
              {f.explanation && (
                <Typography variant="body2" sx={{ color: tokens.ink, mt: 0.5 }}>
                  {f.explanation}
                </Typography>
              )}
              {f.reasoning.map((r, i) => (
                <Typography
                  key={`${r.span_id}-${i}`}
                  variant="body2"
                  sx={{
                    color: r.error ? tokens.status.warn : tokens.muted,
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                    maxWidth: "72ch",
                    borderLeft: `1px solid ${tokens.border}`,
                    pl: 1.5,
                  }}
                >
                  {r.error ?? r.reasoning}
                </Typography>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Panel>
  );
}
