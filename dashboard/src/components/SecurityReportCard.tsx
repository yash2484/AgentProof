import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, TABULAR_NUMS } from "../theme";
import type { EvalResult } from "../types";

/**
 * One security finding, always attributed to its trace.
 *
 * Attribution is unconditional: several traces evaluating the same metric to
 * the same all-PASS verdict used to render as identical, unattributable
 * cards with no way to tell which run each came from.
 */
export function SecurityReportCard({ result }: { result: EvalResult }) {
  const offendingSpan =
    (result.details?.offending_span_id as string | undefined) ?? result.span_id ?? undefined;

  return (
    <Card variant="outlined" data-testid="security-report-card">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">{result.metric_name}</Typography>
          <Chip
            size="small"
            color={result.passed ? "success" : "error"}
            label={result.passed ? "PASS" : "FAIL"}
          />
        </Stack>

        <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
          Trace{" "}
          <Typography
            component={RouterLink}
            to={`/traces/${result.trace_id}`}
            variant="body2"
            sx={{ color: tokens.brand.text, textDecoration: "none", ...TABULAR_NUMS }}
          >
            {result.trace_id}
          </Typography>
        </Typography>

        <Typography variant="body2" sx={{ mt: 1, ...TABULAR_NUMS }}>
          Score: {result.score ?? "—"} (threshold {result.threshold ?? "—"})
        </Typography>

        {result.explanation && (
          <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
            {result.explanation}
          </Typography>
        )}

        {offendingSpan && (
          <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
            Offending span: {offendingSpan}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
