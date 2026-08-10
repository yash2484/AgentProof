import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { metricSeverity, severityCopy } from "../lib/analytics";
import type { Severity } from "../lib/analytics";
import { SeverityChip } from "./SeverityChip";
import { metricHref } from "./MetricStrip";
import type { EvalAnalytics, GateVerdict, MetricHealth } from "../types";

const RANK: Record<Severity, number> = {
  serious: 0,
  watch: 1,
  degraded: 2,
  clear: 3,
};

export interface Finding {
  metric: MetricHealth;
  gate?: GateVerdict;
  severity: Severity;
}

/**
 * Findings worth showing, most serious first.
 *
 * A clear metric is not a finding, so it is left out — but a degraded one is
 * kept, because a measurement that never ran is something the reader needs to
 * know about even though it is not a fault in the agent.
 */
export function buildFindings(analytics: EvalAnalytics | undefined): Finding[] {
  const gate = analytics?.gate ?? [];
  return (analytics?.metric_health ?? [])
    .map((metric) => {
      const g = gate.find((x) => x.metric_name === metric.metric_name);
      return { metric, gate: g, severity: metricSeverity(metric, g) };
    })
    .filter((f) => f.severity !== "clear")
    .sort((a, b) => {
      const byRank = RANK[a.severity] - RANK[b.severity];
      if (byRank !== 0) return byRank;
      // Within a tier, the bigger fraction is the bigger problem.
      const rate = (f: Finding) =>
        f.metric.count === 0 ? 0 : f.metric.failed / f.metric.count;
      return rate(b) - rate(a);
    });
}

/**
 * Band 5 — the findings feed.
 *
 * Severity is earned, the fraction is always stated, and the drill-down goes
 * to the rows behind the claim rather than to a summary of it.
 */
export function FindingsFeed({ analytics, project }: {
  analytics: EvalAnalytics | undefined;
  project?: string | null;
}) {
  const findings = buildFindings(analytics);

  return (
    <Box
      component="section"
      aria-label="Where to look"
      data-testid="findings-feed"
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
        Findings
      </Typography>

      {findings.length === 0 && (
        <Typography data-testid="findings-empty" variant="body2" sx={{ color: tokens.muted, mt: 1 }}>
          Nothing flagged in this window. That is a statement about what ran,
          not about what was never tested.
        </Typography>
      )}

      {findings.map((f) => (
        <Box
          key={f.metric.metric_name}
          data-testid={`finding-${f.metric.metric_name}`}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
            py: 1.25,
            borderTop: `1px solid ${tokens.border}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <SeverityChip severity={f.severity} />
            <Typography variant="body2" sx={{ color: tokens.ink }}>
              {f.metric.metric_name}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
              {severityCopy(f.metric, f.gate)}
            </Typography>
          </Box>
          <Box
            component={RouterLink}
            // Straight to the metric's own page rather than a filtered list:
            // the reader has already chosen what they want to look at.
            to={metricHref(f.metric.metric_name, project, analytics?.days)}
            sx={{ color: tokens.brand.text, textDecoration: "none", fontSize: 14 }}
          >
            Inspect →
          </Box>
        </Box>
      ))}
    </Box>
  );
}
