import { Box, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";

export type Tone = "neutral" | "pass" | "fail" | "warn";

/** The one tone->colour map. Imported by anything that renders a verdict. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: tokens.ink,
  pass: tokens.status.pass,
  fail: tokens.status.fail.text,
  warn: tokens.status.warn,
};

/** A small bento tile: one figure, its label, and optional context beneath. */
export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: Tone;
}) {
  return (
    <Box
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
        {label}
      </Typography>
      <Typography
        data-testid="stat-tile-value"
        variant="h5"
        sx={{ color: TONE_COLOR[tone], ...TABULAR_NUMS }}
      >
        {value}
      </Typography>
      {sublabel && (
        <Typography
          data-testid="stat-tile-sublabel"
          variant="body2"
          sx={{ color: tokens.muted, ...TABULAR_NUMS }}
        >
          {sublabel}
        </Typography>
      )}
    </Box>
  );
}
