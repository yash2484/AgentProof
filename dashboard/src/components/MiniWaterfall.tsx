import { Box, Stack, Typography } from "@mui/material";
import { computeWaterfall, MIN_BAR_PX } from "../lib/waterfall";
import { spanColor } from "../lib/format";
import { tokens } from "../theme";
import type { SpanNode } from "../types";

const TRACK_HEIGHT = 28;

/**
 * A compact, non-interactive waterfall for the overview's latest-trace tile.
 * Every span shares one track; names are listed beneath rather than inside
 * the bars, which is what keeps it legible at this height.
 */
export function MiniWaterfall({ roots }: { roots: SpanNode[] }) {
  const rows = computeWaterfall(roots);
  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          position: "relative",
          height: TRACK_HEIGHT,
          bgcolor: tokens.bg,
          border: `1px solid ${tokens.border}`,
          borderRadius: 1.5,
          overflow: "hidden",
        }}
      >
        {rows.map((row) => (
          <Box
            key={row.span.span_id}
            data-testid={`mini-bar-${row.span.span_id}`}
            sx={{
              position: "absolute",
              left: `${row.offsetPct}%`,
              width: `${row.widthPct}%`,
              minWidth: `${MIN_BAR_PX}px`,
              top: 4,
              height: TRACK_HEIGHT - 8,
              borderRadius: 0.75,
              bgcolor: spanColor(row.span.span_type),
            }}
          />
        ))}
      </Box>
      <Stack direction="row" flexWrap="wrap" sx={{ mt: 1, gap: "4px 12px" }}>
        {rows.map((row) => (
          <Stack
            key={row.span.span_id}
            direction="row"
            alignItems="center"
            spacing={0.75}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "2px",
                bgcolor: spanColor(row.span.span_type),
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: tokens.muted }}>
              {row.span.name}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
