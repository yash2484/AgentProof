import { ReactNode } from "react";
import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";

interface Props {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}

export function QueryBoundary({ isLoading, isError, isEmpty, emptyMessage, onRetry, children }: Props) {
  if (isLoading) {
    return (
      <Box data-testid="query-loading" sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={48} />
      </Box>
    );
  }
  if (isError) {
    return (
      <Alert
        severity="error"
        action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}
      >
        Something went wrong loading this data.
      </Alert>
    );
  }
  if (isEmpty) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">{emptyMessage ?? "Nothing to show yet."}</Typography>
      </Box>
    );
  }
  return <>{children}</>;
}
