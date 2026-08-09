import { Box, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import type { AnalyticsTotals } from "../types";

/**
 * Scored / degraded / pending, in neutral grey throughout.
 *
 * This card exists for one reason: to keep degraded measurements out of the
 * failing count. A judge call that errored or refused failed *closed* to 0.0,
 * and without somewhere honest to put it, that zero reads as a finding. Every
 * figure here is grey, including the degraded one — it is a reliability
 * signal about the harness, not a verdict about the agent.
 */
export function MeasurementHealth({ totals }: { totals: AnalyticsTotals | undefined }) {
  const scored = totals?.scored ?? 0;
  const degraded = totals?.degraded ?? 0;
  const pending = totals?.pending ?? 0;

  return (
    <Box
      data-testid="measurement-health"
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
        Measurement health
      </Typography>

      <Typography
        data-testid="measurement-counts"
        variant="h5"
        sx={{ color: tokens.ink, ...TABULAR_NUMS }}
      >
        {scored} scored · {degraded} failed · {pending} pending
      </Typography>

      <Typography variant="body2" sx={{ color: tokens.muted }}>
        {degraded > 0
          ? `${degraded} judge ${degraded === 1 ? "call" : "calls"} errored or refused — excluded from every score above.`
          : "Every measurement completed."}
      </Typography>
    </Box>
  );
}
