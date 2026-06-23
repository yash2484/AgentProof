import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { formatDuration } from "../lib/format";
import type { Span } from "../types";

export function SpanDetailPanel({ span, onClose }: { span: Span | null; onClose: () => void }) {
  return (
    <Drawer anchor="right" open={span !== null} onClose={onClose}>
      <Box sx={{ width: 380, p: 2 }}>
        {span && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">{span.name}</Typography>
              <IconButton onClick={onClose} aria-label="close"><CloseIcon /></IconButton>
            </Stack>
            <Typography variant="body2" color="text.secondary">{span.span_type}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>Latency: {formatDuration(span.latency_ms)}</Typography>
            <Typography variant="body2">Status: {span.status}</Typography>
            {span.error_message && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>{span.error_message}</Typography>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Metadata</Typography>
            <Box component="pre" sx={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(span.metadata, null, 2)}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
