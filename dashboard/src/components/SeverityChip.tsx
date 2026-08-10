import { Box } from "@mui/material";
import { tokens, MICRO, DATA } from "../theme";
import type { Severity } from "../lib/analytics";

/**
 * The one severity->colour map.
 *
 * `degraded` is deliberately neutral grey and never borrows security
 * language: a judge that timed out is a broken measurement, not a breach.
 * Making it alarming is the exact failure this page exists to correct.
 *
 * Ledger's `watch` covers "flagged, or a broken measurement" as a *token*,
 * but the broken case is marked where it is explained — the provenance note
 * — rather than on a chip, where amber next to a metric name would read as
 * a verdict on that metric.
 */
export const SEVERITY_COLOR: Record<Severity, { fill: string; text: string }> = {
  degraded: { fill: tokens.dim, text: tokens.dim },
  clear: { fill: tokens.status.pass, text: tokens.status.pass },
  watch: { fill: tokens.status.watch, text: tokens.status.watch },
  serious: { fill: tokens.status.fail, text: tokens.status.fail },
};

const LABEL: Record<Severity, string> = {
  degraded: "Degraded",
  clear: "Clear",
  watch: "Watch",
  serious: "Serious",
};

/**
 * A small tier badge. The tier is always accompanied by its fraction in copy.
 *
 * Outlined rather than filled. A tinted fill was measured against all four
 * Ledger grounds and the label fell under 4.5:1 on two of them for `clear`
 * and `degraded`; keeping the label on the page's own ground keeps every
 * chip legible on every surface, which a fill cannot promise.
 */
export function SeverityChip({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <Box
      component="span"
      data-testid={`severity-${severity}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 0.875,
        py: 0.125,
        borderRadius: "3px",
        border: `1px solid ${color.fill}`,
        color: color.text,
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      <Box
        component="span"
        sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: color.fill }}
      />
      {LABEL[severity]}
    </Box>
  );
}

/**
 * Marks a project whose data is generated rather than measured.
 *
 * Deliberately neutral, not a warning: generated data is legitimate for
 * evaluating a design, and the only failure mode is mistaking it for a
 * measurement. So it states the fact and nothing more.
 *
 * The dashed border is the one piece of ornament in Ledger that earns its
 * place — it reads as "provisional" before the word is read.
 */
export function SyntheticBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Box
      component="span"
      data-testid="synthetic-badge"
      title="Generated data — not a measurement"
      sx={{
        ...MICRO,
        display: "inline-block",
        px: 0.75,
        py: 0.125,
        borderRadius: "3px",
        border: `1px dashed ${tokens.dim}`,
        color: tokens.dim,
        whiteSpace: "nowrap",
      }}
    >
      {compact ? "generated" : "generated data"}
    </Box>
  );
}

/**
 * An n-count chip.
 *
 * Pairs with the ceiling strip's muted "no variance observed" label: the
 * sample size is what turns "passed" into "passed, on this much evidence".
 *
 * The default noun is "measurements" because that is what a metric's `count`
 * holds — eval rows. It is neither traces (25 traces produced 35 rows for a
 * deterministic metric) nor evaluation runs (the scope bar's noun).
 */
export function CountChip({ n, label = "measurements" }: { n: number; label?: string }) {
  return (
    <Box
      component="span"
      data-testid="count-chip"
      sx={{
        ...DATA,
        display: "inline-block",
        px: 0.75,
        py: 0.125,
        borderRadius: "3px",
        bgcolor: tokens.data,
        border: `1px solid ${tokens.hair}`,
        color: tokens.dim,
      }}
    >
      n={n} {label}
    </Box>
  );
}
