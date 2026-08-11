import { ReactNode } from "react";
import { Box, Button, Skeleton } from "@mui/material";
import { tokens, SPACE, RADIUS, PROSE } from "../theme";
import { NoteBlock } from "./Ledger";

interface Props {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * The three states every query surface has to answer for.
 *
 * Loading is skeletons on the data tint rather than a spinner, so the page
 * keeps its shape and the reader's eye does not have to re-find the panel
 * once figures arrive.
 *
 * The error state is a `fail` note rather than a MUI Alert: an Alert paints
 * its own pink from the theme's error colour, which would put a fill on the
 * page that Ledger never approved, and it shouts a severity without saying
 * what the reader can do.
 */
export function QueryBoundary({
  isLoading,
  isError,
  isEmpty,
  emptyMessage,
  onRetry,
  children,
}: Props) {
  if (isLoading) {
    return (
      <Box
        data-testid="query-loading"
        sx={{
          p: `${SPACE.sm}px`,
          bgcolor: tokens.data,
          border: `1px solid ${tokens.hair}`,
          borderRadius: `${RADIUS}px`,
        }}
      >
        {[68, 44, 44].map((height, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={height}
            sx={{
              bgcolor: tokens.hair,
              borderRadius: "3px",
              mb: i === 2 ? 0 : `${SPACE.xs}px`,
            }}
          />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <NoteBlock tone="fail" data-testid="query-error">
        Something went wrong loading this data. Nothing below is missing — it
        was never fetched, so no figure on this screen is understated.
        {onRetry && (
          <Box sx={{ mt: `${SPACE.xs}px` }}>
            <Button size="small" variant="outlined" color="inherit" onClick={onRetry}>
              Retry
            </Button>
          </Box>
        )}
      </NoteBlock>
    );
  }

  if (isEmpty) {
    return (
      <Box
        sx={{
          py: `${SPACE.lg}px`,
          textAlign: "center",
          ...PROSE,
          maxWidth: "none",
          color: tokens.ink2,
        }}
      >
        {emptyMessage ?? "Nothing to show yet."}
      </Box>
    );
  }

  return <>{children}</>;
}
