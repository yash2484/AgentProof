import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, TABULAR_NUMS } from "../theme";
import { overviewVerdict } from "../lib/verdict";
import type { VerdictTone } from "../lib/verdict";
import { metricHref } from "./MetricStrip";
import type { EvalAnalytics } from "../types";

/**
 * Band 1 — the conclusion, before any evidence for it.
 *
 * Deliberately **not a card**. Every other element on this page sits on a
 * surface with a border, so the one thing that sits directly on the page
 * ground reads as the page speaking rather than as another tile competing for
 * attention. Uniform card weight is what flattened the old Overview: five
 * bordered boxes, and the largest type on the screen belonged to the least
 * important number.
 *
 * Severity colour appears here and on severity chips, nowhere else on the
 * page. A rule with one exception is not a rule.
 */

const TONE: Record<VerdictTone, { rule: string; text: string }> = {
  // The rule is a 3px left edge on the *band*, not a decorative stripe on a
  // card — it marks where the page's voice starts and carries the one piece of
  // colour a reader should read as severity.
  serious: { rule: tokens.status.fail.solid, text: tokens.status.fail.text },
  watch: { rule: tokens.status.warn, text: tokens.status.warn },
  clear: { rule: tokens.status.pass, text: tokens.status.pass },
  unknown: { rule: tokens.border, text: tokens.muted },
};

export function VerdictBand({
  analytics,
  project,
}: {
  analytics: EvalAnalytics | undefined;
  project?: string | null;
}) {
  const verdict = overviewVerdict({
    metrics: analytics?.metric_health ?? [],
    gate: analytics?.gate ?? [],
    scored: analytics?.outcome_split
      ? analytics.outcome_split.passed + analytics.outcome_split.failed
      : 0,
  });
  const tone = TONE[verdict.tone];

  return (
    <Box
      component="section"
      aria-label="Verdict"
      data-testid="verdict-band"
      data-tone={verdict.tone}
      sx={{
        borderLeft: `3px solid ${tone.rule}`,
        pl: `${SPACE.md}px`,
        py: `${SPACE.xs}px`,
      }}
    >
      <Typography
        data-testid="verdict-headline"
        component="h2"
        sx={{
          color: tone.text,
          // Larger than the page title, because the conclusion outranks the
          // name of the page it is on.
          fontSize: "clamp(1.5rem, 3.2vw, 2rem)",
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        {verdict.headline}
      </Typography>

      <Typography
        data-testid="verdict-detail"
        sx={{
          color: tokens.ink,
          mt: `${SPACE.xs}px`,
          fontSize: 15,
          lineHeight: 1.6,
          // Body copy stays inside a readable measure even on a wide screen.
          maxWidth: "68ch",
          ...TABULAR_NUMS,
        }}
      >
        {verdict.detail}
      </Typography>

      {verdict.focus && (
        <Box
          component={RouterLink}
          data-testid="verdict-focus"
          to={metricHref(verdict.focus, project, analytics?.days)}
          sx={{
            display: "inline-block",
            mt: `${SPACE.sm}px`,
            color: tokens.brand.text,
            textDecoration: "none",
            fontSize: 14,
            "&:hover": { textDecoration: "underline" },
            "&:focus-visible": {
              outline: `2px solid ${tokens.brand.solid}`,
              outlineOffset: 3,
              borderRadius: "2px",
            },
          }}
        >
          Open {verdict.focus} →
        </Box>
      )}
    </Box>
  );
}
