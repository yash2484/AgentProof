import { Box, Tooltip, Typography } from "@mui/material";
import { computeWaterfall, MIN_BAR_PX } from "../lib/waterfall";
import { spanColor, formatDuration } from "../lib/format";
import { tokens } from "../theme";
import type { Span, SpanNode } from "../types";

const ROW_HEIGHT = 28;
const BAR_INSET = 8;

export function Waterfall({
  roots,
  onSelect,
}: {
  roots: SpanNode[];
  onSelect: (span: Span) => void;
}) {
  const rows = computeWaterfall(roots);
  return (
    <Box sx={{ width: "100%" }}>
      {rows.map((row) => (
        <Box
          key={row.span.span_id}
          sx={{
            display: "flex",
            alignItems: "center",
            height: ROW_HEIGHT,
            pl: `${row.depth * 16}px`,
          }}
        >
          <Box sx={{ position: "relative", flexGrow: 1, height: "100%" }}>
            <Tooltip
              title={`${row.span.name} · ${formatDuration(row.span.latency_ms)}`}
            >
              <Box
                role="button"
                data-testid={`waterfall-bar-${row.span.span_id}`}
                onClick={() => onSelect(row.span)}
                sx={{
                  position: "absolute",
                  left: `${row.offsetPct}%`,
                  width: `${row.widthPct}%`,
                  // Rendering floor: a near-zero span stays clickable and
                  // visible. The axis above is still linearly truthful.
                  minWidth: `${MIN_BAR_PX}px`,
                  top: 4,
                  height: ROW_HEIGHT - BAR_INSET,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: spanColor(row.span.span_type),
                  outline:
                    row.span.status === "error"
                      ? `2px solid ${tokens.status.fail.solid}`
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  px: 1,
                  overflow: "hidden",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: tokens.onFill, whiteSpace: "nowrap", fontWeight: 500 }}
                >
                  {row.span.name}
                </Typography>
              </Box>
            </Tooltip>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
