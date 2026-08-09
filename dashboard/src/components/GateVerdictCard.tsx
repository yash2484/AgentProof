import { useState } from "react";
import { Box, Button, Collapse, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { describeGate } from "../lib/analytics";
import { SEVERITY_COLOR } from "./SeverityChip";
import type { GateVerdict } from "../types";

/**
 * The verdict the whole page hangs on, and the reason it is the largest card.
 *
 * When several metrics have a baseline, the one that fired wins; otherwise
 * the closest call — smallest p-value — is the most informative thing to
 * lead with, because it is the verdict most likely to change next run.
 */
export function leadVerdict(gate: GateVerdict[]): GateVerdict | undefined {
  const fired = gate.find((g) => g.is_regression);
  if (fired) return fired;
  const comparable = gate.filter((g) => g.comparable && g.p_value !== null);
  if (comparable.length === 0) return gate[0];
  return comparable.reduce((a, b) =>
    (a.p_value as number) <= (b.p_value as number) ? a : b,
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2" sx={{ color: tokens.muted }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
        {value}
      </Typography>
    </Box>
  );
}

const fmt = (v: number | null, digits = 3) =>
  v === null || v === undefined ? "—" : v.toFixed(digits);

export function GateVerdictCard({ gate }: { gate: GateVerdict[] }) {
  const [open, setOpen] = useState(false);
  const verdict = leadVerdict(gate);
  const described = describeGate(verdict);
  const color = SEVERITY_COLOR[described.severity];

  return (
    <Box
      data-testid="gate-verdict"
      sx={{
        height: "100%",
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${color.fill}`,
        borderRadius: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Regression gate
      </Typography>

      <Typography
        data-testid="gate-headline"
        variant="h5"
        sx={{ color: color.text }}
      >
        {described.headline}
        {verdict && (
          <Box component="span" sx={{ color: tokens.muted, fontSize: "0.6em", ml: 1 }}>
            {verdict.metric_name}
          </Box>
        )}
      </Typography>

      {/* Always visible, never behind the expander: the statistics are the
        * difference between a verdict and an assertion. */}
      <Typography
        data-testid="gate-statline"
        variant="body2"
        sx={{ color: tokens.muted, ...TABULAR_NUMS }}
      >
        {described.statLine}
      </Typography>

      {verdict && (
        <>
          <Button
            size="small"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            sx={{
              alignSelf: "flex-start",
              color: tokens.brand.text,
              textTransform: "none",
              px: 0,
              minWidth: 0,
            }}
          >
            {open ? "Hide the numbers" : "Show the numbers"}
          </Button>
          <Collapse in={open}>
            <Box
              data-testid="gate-details"
              sx={{ display: "grid", gap: 0.5, pt: 1, borderTop: `1px solid ${tokens.border}` }}
            >
              <Detail label="Baseline mean" value={fmt(verdict.baseline_mean)} />
              <Detail label="Candidate mean" value={fmt(verdict.candidate_mean)} />
              <Detail label="Delta" value={fmt(verdict.delta)} />
              <Detail label="t-statistic" value={fmt(verdict.t_statistic)} />
              <Detail label="p-value" value={fmt(verdict.p_value, 4)} />
              <Detail label="Cohen's d" value={fmt(verdict.cohens_d)} />
              <Detail
                label="Sample sizes"
                value={`baseline ${verdict.baseline_n} · candidate ${verdict.candidate_n}`}
              />
              <Typography
                variant="body2"
                sx={{ color: tokens.muted, mt: 1, wordBreak: "break-word" }}
              >
                {verdict.reason}
              </Typography>
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}
