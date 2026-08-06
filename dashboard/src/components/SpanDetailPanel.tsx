import { useEffect } from "react";
import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { formatDuration } from "../lib/format";
import { tokens, SPACE, TABULAR_NUMS } from "../theme";
import type { Span } from "../types";

const PANEL_WIDTH = 380;

/**
 * Span detail, in a panel that stays inside its own bounds.
 *
 * The default temporary Drawer mounts a full-viewport backdrop and a focus
 * trap, which swallowed clicks on the nav rail while the panel was open.
 * Hiding the backdrop and scoping pointer events to the paper keeps the rail
 * reachable without turning the panel into a persistent layout element.
 */
export function SpanDetailPanel({
  span,
  onClose,
}: {
  span: Span | null;
  onClose: () => void;
}) {
  // MUI wires Escape-to-close as onKeyDown on the Modal root, so it stops
  // working the moment focus leaves the panel -- and disableEnforceFocus
  // lets that happen by design. With no backdrop to click either, the panel
  // would otherwise be a keyboard trap. Listen on document instead.
  useEffect(() => {
    if (span === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [span, onClose]);

  return (
    <Drawer
      anchor="right"
      open={span !== null}
      onClose={onClose}
      hideBackdrop
      disableScrollLock
      disableEnforceFocus
      slotProps={{
        root: { sx: { pointerEvents: "none" } },
        paper: {
          sx: {
            pointerEvents: "auto",
            width: PANEL_WIDTH,
            bgcolor: tokens.surface,
            borderLeft: `1px solid ${tokens.border}`,
            borderRadius: 0,
          },
        },
      }}
    >
      <Box sx={{ p: `${SPACE.md}px` }}>
        {span && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">{span.name}</Typography>
              <IconButton onClick={onClose} aria-label="close" size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: tokens.muted }}>
              {span.span_type}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, ...TABULAR_NUMS }}>
              Latency: {formatDuration(span.latency_ms)}
            </Typography>
            <Typography variant="body2">Status: {span.status}</Typography>
            {span.error_message && (
              <Typography variant="body2" sx={{ mt: 1, color: tokens.status.fail.text }}>
                {span.error_message}
              </Typography>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Metadata</Typography>
            <Box
              component="pre"
              sx={{
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: tokens.muted,
                bgcolor: tokens.bg,
                border: `1px solid ${tokens.border}`,
                borderRadius: 1.5,
                p: `${SPACE.xs}px`,
                ...TABULAR_NUMS,
              }}
            >
              {JSON.stringify(span.metadata, null, 2)}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
