import { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { metricRegister, metricSeverity, varianceLabel } from "../lib/analytics";
import { MetricDistribution } from "./MetricDistribution";
import { CountChip, SeverityChip } from "./SeverityChip";
import type { EvalAnalytics, GateVerdict, MetricHealth } from "../types";

function gateFor(gate: GateVerdict[], name: string): GateVerdict | undefined {
  return gate.find((g) => g.metric_name === name);
}

/**
 * One row of the ceiling strip.
 *
 * The whole point of this row is the distinction between "passed, and we
 * watched it move" and "never varied — no evidence either way". It carries an
 * n-count chip and a muted label, and **no icon**: an icon reads as a warning,
 * and this is an absence of evidence rather than a fault. Six of eight metrics
 * sit here at 1.000 because nothing stresses them, and rendering those as
 * green ticks would launder untested into passing — the exact failure this
 * product exists to catch.
 */
function CeilingRow({
  metric,
  buckets,
  gate,
}: {
  metric: MetricHealth;
  buckets: EvalAnalytics["score_buckets"];
  gate?: GateVerdict;
}) {
  const [expanded, setExpanded] = useState(false);
  const severity = metricSeverity(metric, gate);

  if (expanded) {
    return (
      <Box>
        <MetricDistribution metric={metric} buckets={buckets} gate={gate} />
        <Button
          size="small"
          onClick={() => setExpanded(false)}
          sx={{ color: tokens.brand.text, textTransform: "none", px: 0, minWidth: 0 }}
        >
          Collapse {metric.metric_name}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      data-testid={`ceiling-row-${metric.metric_name}`}
      onClick={() => setExpanded(true)}
      aria-expanded={false}
      // Without this the accessible name is the whole row — name, tier,
      // score, n-count and variance label run together as one string.
      aria-label={`${metric.metric_name}: show distribution`}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        flexWrap: "wrap",
        py: 1,
        px: 0,
        bgcolor: "transparent",
        border: "none",
        borderTop: `1px solid ${tokens.border}`,
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
        "&:hover": { bgcolor: tokens.surfaceRaised },
        "&:focus-visible": { outline: `2px solid ${tokens.brand.solid}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ color: tokens.ink }}>
          {metric.metric_name}
        </Typography>
        <SeverityChip severity={severity} />
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          {metric.mean_score === null ? "—" : metric.mean_score.toFixed(3)}
        </Typography>
        <CountChip n={metric.count} />
        <Typography
          data-testid={`variance-label-${metric.metric_name}`}
          variant="caption"
          sx={{ color: tokens.muted }}
        >
          {varianceLabel(metric)}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Band 2 — metric health in two registers.
 *
 * All metrics stay visible. The ones whose scores move get the full
 * distribution; the ones pinned at a single value get a compact strip they
 * can be expanded out of. Nothing is hidden and nothing is flattened into a
 * single green number.
 */
export function MetricHealthPanel({ analytics }: { analytics: EvalAnalytics | undefined }) {
  const metrics = analytics?.metric_health ?? [];
  const buckets = analytics?.score_buckets ?? [];
  const gate = analytics?.gate ?? [];

  const signal = metrics.filter((m) => metricRegister(m) === "signal");
  const ceiling = metrics.filter((m) => metricRegister(m) === "ceiling");

  return (
    <Box
      data-testid="metric-health"
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Metric health
      </Typography>

      {metrics.length === 0 && (
        <Typography variant="body2" sx={{ color: tokens.muted, mt: 1 }}>
          Nothing has been evaluated in this window.
        </Typography>
      )}

      {signal.length > 0 && (
        <Box data-testid="signal-register" sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ color: tokens.muted, mb: 0.5 }}>
            Scores that vary — ranked by uncertainty
          </Typography>
          {[...signal]
            .sort((a, b) => (b.std ?? 0) - (a.std ?? 0))
            .map((m) => (
              <MetricDistribution
                key={m.metric_name}
                metric={m}
                buckets={buckets}
                gate={gateFor(gate, m.metric_name)}
              />
            ))}
        </Box>
      )}

      {ceiling.length > 0 && (
        <Box data-testid="ceiling-strip" sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ color: tokens.muted, mb: 0.5 }}>
            No variance observed — {ceiling.length} of {metrics.length}{" "}
            {metrics.length === 1 ? "metric" : "metrics"} never moved in this window
          </Typography>
          {ceiling.map((m) => (
            <CeilingRow
              key={m.metric_name}
              metric={m}
              buckets={buckets}
              gate={gateFor(gate, m.metric_name)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
