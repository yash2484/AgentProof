import { Box, Typography } from "@mui/material";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { CountChip } from "./SeverityChip";
import type { EvalAnalytics } from "../types";

/** Below this, a rate is not a rate. Matches the severity small-sample rule. */
export const SMALL_SAMPLE = 10;

/**
 * Trace volume and momentum.
 *
 * The small-sample chip is not decoration. Everything else on the page reads
 * differently at n=6 than at n=600, and the chip is what stops a reader
 * carrying a percentage away from a handful of runs.
 */
export function VolumeCard({ analytics }: { analytics: EvalAnalytics | undefined }) {
  const traces = analytics?.totals.traces ?? 0;
  const volume = analytics?.trace_volume ?? [];
  const errors = analytics?.status_split.error ?? 0;
  // One day is a dot, not a trend; a sparkline through it invites a reading
  // the data cannot support.
  const spark = volume.length >= 2 ? volume.map((d) => d.total) : [];

  return (
    <Box
      data-testid="volume-card"
      sx={{
        height: "100%",
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Volume
      </Typography>

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
          {traces}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          {traces === 1 ? "trace" : "traces"}
        </Typography>
        {traces > 0 && traces < SMALL_SAMPLE && (
          <Box data-testid="small-sample-chip">
            <CountChip n={traces} label="traces — small sample" />
          </Box>
        )}
      </Box>

      {spark.length > 0 && (
        <Box data-testid="volume-spark" sx={{ height: 40 }}>
          <SparkLineChart
            data={spark}
            height={40}
            colors={[tokens.brand.solid]}
            showHighlight
            showTooltip
          />
        </Box>
      )}

      <Typography variant="body2" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
        {errors} of {traces} ended in error
      </Typography>
    </Box>
  );
}
