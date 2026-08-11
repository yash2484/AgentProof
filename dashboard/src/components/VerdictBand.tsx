import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, SPACE, LEDE, PROSE, UI } from "../theme";
import { overviewVerdict } from "../lib/verdict";
import type { VerdictTone } from "../lib/verdict";
import { metricHref } from "./MetricStrip";
import type { EvalAnalytics } from "../types";

/**
 * Band 1 — the conclusion, before any evidence for it.
 *
 * Deliberately **not a panel**. Every figure on this page sits on a tinted
 * data surface, so the one thing that sits directly on paper reads as the
 * page speaking rather than as another tile competing for attention. Uniform
 * weight is what flattened the old Overview: five bordered boxes, and the
 * largest type on the screen belonged to the least important number.
 *
 * The lede is 22px serif — the same register as the judge's own reasoning,
 * because both are written rather than measured. It is not the largest type
 * on the page by much, and it does not need to be: nothing else is serif at
 * that size, so it is unmistakably the page's voice.
 *
 * Severity colour appears here and on severity chips, nowhere else on this
 * page. A rule with one exception is not a rule.
 */

const TONE: Record<VerdictTone, string> = {
  serious: tokens.status.fail,
  watch: tokens.status.watch,
  clear: tokens.status.pass,
  unknown: tokens.ink2,
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

  return (
    <Box
      component="section"
      aria-label="Verdict"
      data-testid="verdict-band"
      data-tone={verdict.tone}
      sx={{ pb: `${SPACE.xs}px` }}
    >
      <Typography
        data-testid="verdict-headline"
        component="h2"
        sx={{
          ...LEDE,
          color: TONE[verdict.tone],
          textWrap: "balance",
          maxWidth: "34ch",
        }}
      >
        {verdict.headline}
      </Typography>

      <Typography
        data-testid="verdict-detail"
        component="p"
        sx={{ ...PROSE, color: tokens.ink2, mt: "6px" }}
      >
        {verdict.detail}
      </Typography>

      {verdict.focus && (
        <Box
          component={RouterLink}
          data-testid="verdict-focus"
          to={metricHref(verdict.focus, project, analytics?.days)}
          sx={{
            ...UI,
            display: "inline-block",
            mt: `${SPACE.sm}px`,
            color: tokens.link,
            textDecoration: "none",
            borderBottom: `1px solid ${tokens.hairStrong}`,
            "&:hover": { borderBottomColor: tokens.link },
          }}
        >
          Open {verdict.focus} →
        </Box>
      )}
    </Box>
  );
}
