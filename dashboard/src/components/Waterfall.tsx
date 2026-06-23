import { Box, Tooltip, Typography } from "@mui/material";
import { computeWaterfall } from "../lib/waterfall";
import { spanColor, formatDuration } from "../lib/format";
import type { Span, SpanNode } from "../types";

const ROW_HEIGHT = 28;

export function Waterfall({ roots, onSelect }: { roots: SpanNode[]; onSelect: (span: Span) => void }) {
  const rows = computeWaterfall(roots);
  return (
    <Box sx={{ width: "100%" }}>
      {rows.map((row) => (
        <Box
          key={row.span.span_id}
          sx={{ display: "flex", alignItems: "center", height: ROW_HEIGHT, pl: `${row.depth * 16}px` }}
        >
          <Box sx={{ position: "relative", flexGrow: 1, height: "100%" }}>
            <Tooltip title={`${row.span.name} · ${formatDuration(row.span.latency_ms)}`}>
              <Box
                role="button"
                onClick={() => onSelect(row.span)}
                sx={{
                  position: "absolute",
                  left: `${row.offsetPct}%`,
                  width: `${row.widthPct}%`,
                  top: 4,
                  height: ROW_HEIGHT - 8,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: spanColor(row.span.span_type),
                  outline: row.span.status === "error" ? "2px solid #d32f2f" : "none",
                  display: "flex",
                  alignItems: "center",
                  px: 1,
                  overflow: "hidden",
                }}
              >
                <Typography variant="caption" sx={{ color: "#fff", whiteSpace: "nowrap" }}>
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
