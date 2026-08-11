import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { tokens, SPACE, RADIUS, H3, PROSE } from "../theme";

/**
 * Guidance for a view with no data. Deliberately not an error.
 *
 * Serif, because an empty state is written rather than measured — it is the
 * one place the interface speaks to the reader in sentences. The dashed
 * border says "nothing has been drawn here yet" without the alarm of a
 * status colour, since having no data is not a verdict.
 */
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
        px: `${SPACE.lg}px`,
        py: `${SPACE.xl}px`,
        textAlign: "center",
        border: `1px dashed ${tokens.hairStrong}`,
        borderRadius: `${RADIUS}px`,
      }}
    >
      <Typography component="p" sx={{ ...H3, fontSize: 16, color: tokens.ink, mb: "6px" }}>
        {title}
      </Typography>
      <Typography
        component="p"
        sx={{ ...PROSE, fontSize: 15, color: tokens.ink2, mx: "auto" }}
      >
        {body}
      </Typography>
      {action && <Box sx={{ mt: `${SPACE.md}px` }}>{action}</Box>}
    </Box>
  );
}
