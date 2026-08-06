import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { tokens, SPACE } from "../theme";

/** Guidance for a view with no data. Deliberately not an error. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: `${SPACE.xl}px`,
        textAlign: "center",
        border: `1px dashed ${tokens.border}`,
        borderRadius: 2.5,
        bgcolor: tokens.surface,
      }}
    >
      <Typography variant="subtitle1" sx={{ color: tokens.ink, mb: "4px" }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.muted }}>
        {body}
      </Typography>
      {action && <Box sx={{ mt: `${SPACE.md}px` }}>{action}</Box>}
    </Box>
  );
}
