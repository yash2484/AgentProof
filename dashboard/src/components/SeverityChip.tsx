import { Box } from "@mui/material";
import { tokens, TABULAR_NUMS } from "../theme";
import type { Severity } from "../lib/analytics";

/**
 * The one severity->colour map.
 *
 * `degraded` is deliberately muted grey and never borrows security language:
 * a judge that timed out is a broken measurement, not a breach. Making it
 * alarming is the exact failure this page exists to correct.
 *
 * Fill colours use the `.solid` tokens, which clear the 3.0 non-text contrast
 * floor. Text uses the `.text` variants, which clear 4.5.
 */
export const SEVERITY_COLOR: Record<Severity, { fill: string; text: string }> = {
  degraded: { fill: tokens.muted, text: tokens.muted },
  clear: { fill: tokens.status.pass, text: tokens.status.pass },
  watch: { fill: tokens.status.warn, text: tokens.status.warn },
  serious: { fill: tokens.status.fail.solid, text: tokens.status.fail.text },
};

const LABEL: Record<Severity, string> = {
  degraded: "Degraded",
  clear: "Clear",
  watch: "Watch",
  serious: "Serious",
};

/** A small tier badge. The tier is always accompanied by its fraction in copy. */
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
        px: 1,
        py: 0.25,
        borderRadius: 1,
        border: `1px solid ${color.fill}`,
        color: color.text,
        fontSize: 12,
        lineHeight: 1.6,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <Box
        component="span"
        sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color.fill }}
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
 */
export function SyntheticBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Box
      component="span"
      data-testid="synthetic-badge"
      title="Generated data — not a measurement"
      sx={{
        display: "inline-block",
        px: 0.75,
        py: 0.125,
        borderRadius: 1,
        border: `1px dashed ${tokens.muted}`,
        color: tokens.muted,
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
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
        display: "inline-block",
        px: 0.75,
        py: 0.125,
        borderRadius: 1,
        bgcolor: tokens.surfaceRaised,
        color: tokens.muted,
        fontSize: 12,
        ...TABULAR_NUMS,
      }}
    >
      n={n} {label}
    </Box>
  );
}
