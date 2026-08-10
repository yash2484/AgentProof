import { useEffect } from "react";
import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { formatDuration } from "../lib/format";
import { tokens, SPACE, DATA, MICRO, RADIUS } from "../theme";
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
            bgcolor: tokens.card,
            borderLeft: `1px solid ${tokens.hairStrong}`,
            borderRadius: 0,
          },
        },
      }}
    >
      <Box sx={{ p: `${SPACE.md}px` }}>
        {span && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ ...DATA, fontSize: 14, fontWeight: 500, color: tokens.ink }}>
                {span.name}
              </Typography>
              <IconButton
                onClick={onClose}
                aria-label="close"
                size="small"
                sx={{ color: tokens.dim }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography sx={{ ...DATA, color: tokens.dim }}>{span.span_type}</Typography>
            <Typography sx={{ ...DATA, color: tokens.ink, mt: 1 }}>
              latency {formatDuration(span.latency_ms)}
            </Typography>
            <Typography sx={{ ...DATA, color: tokens.ink }}>
              status {span.status}
            </Typography>
            {span.error_message && (
              <Typography sx={{ ...DATA, mt: 1, color: tokens.status.fail }}>
                {span.error_message}
              </Typography>
            )}
            <Typography sx={{ ...MICRO, color: tokens.dim, mt: 2, mb: "5px" }}>
              Metadata
            </Typography>
            <Box
              component="pre"
              sx={{
                ...DATA,
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: tokens.ink2,
                bgcolor: tokens.data,
                border: `1px solid ${tokens.hair}`,
                borderRadius: `${RADIUS}px`,
                p: `${SPACE.xs}px`,
                m: 0,
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
