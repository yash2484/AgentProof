import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, DATA, UI } from "../theme";
import { metricSeverity, severityCopy } from "../lib/analytics";
import type { Severity } from "../lib/analytics";
import { SeverityChip } from "./SeverityChip";
import { SectionHeading, DataPanel, Prose } from "./Ledger";
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
 * Band 4 — where to look.
 *
 * Severity is earned, the fraction is always stated, and the drill-down goes
 * to the rows behind the claim rather than to a summary of it.
 *
 * A data panel rather than prose: each row is a metric id and a count, which
 * are measured things. The metric name is mono for the same reason — it is
 * an identifier the reader will grep for, not a phrase.
 */
export function FindingsFeed({ analytics, project }: {
  analytics: EvalAnalytics | undefined;
  project?: string | null;
}) {
  const findings = buildFindings(analytics);

  return (
    <Box component="section" aria-label="Where to look" data-testid="findings-feed">
      <SectionHeading
        meta={findings.length > 0 ? `${findings.length} flagged` : undefined}
      >
        Where to look
      </SectionHeading>

      {findings.length === 0 ? (
        <Prose data-testid="findings-empty" sx={{ color: tokens.ink2 }}>
          Nothing flagged in this window. That is a statement about what ran,
          not about what was never tested.
        </Prose>
      ) : (
        <DataPanel>
          {findings.map((f, i) => (
            <Box
              key={f.metric.metric_name}
              data-testid={`finding-${f.metric.metric_name}`}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: `${SPACE.xs}px`,
                flexWrap: "wrap",
                px: `${SPACE.sm}px`,
                py: "7px",
                borderTop: i === 0 ? "none" : `1px solid ${tokens.hair}`,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: `${SPACE.xs}px`,
                  flexWrap: "wrap",
                  minWidth: 0,
                }}
              >
                <SeverityChip severity={f.severity} />
                <Box component="span" sx={{ ...DATA, color: tokens.ink, fontWeight: 500 }}>
                  {f.metric.metric_name}
                </Box>
                <Typography component="span" sx={{ ...DATA, color: tokens.dim }}>
                  {severityCopy(f.metric, f.gate)}
                </Typography>
              </Box>
              <Box
                component={RouterLink}
                // Straight to the metric's own page rather than a filtered
                // list: the reader has already chosen what to look at.
                to={metricHref(f.metric.metric_name, project, analytics?.days)}
                sx={{
                  ...UI,
                  fontSize: 13,
                  color: tokens.link,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Inspect →
              </Box>
            </Box>
          ))}
        </DataPanel>
      )}
    </Box>
  );
}
