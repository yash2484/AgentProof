import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { EvalResult } from "../types";

export function SecurityReportCard({ result }: { result: EvalResult }) {
  const offendingSpan =
    (result.details?.offending_span_id as string | undefined) ?? result.span_id ?? undefined;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">{result.metric_name}</Typography>
          <Chip
            size="small"
            color={result.passed ? "success" : "error"}
            label={result.passed ? "PASS" : "FAIL"}
          />
        </Stack>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Score: {result.score ?? "—"} (threshold {result.threshold ?? "—"})
        </Typography>
        {result.explanation && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {result.explanation}
          </Typography>
        )}
        {offendingSpan && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Offending span:{" "}
            <RouterLink to={`/traces/${result.trace_id}`}>{offendingSpan}</RouterLink>
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
