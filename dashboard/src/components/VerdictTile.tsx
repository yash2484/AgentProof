import { Box, Stack, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { formatScore, metricByName, securityVerdict } from "../lib/overview";
import { TONE_COLOR } from "./StatTile";
import type { Tone } from "./StatTile";
import type { EvalSummary } from "../types";

/**
 * Neutral means "nothing has run yet" here, so the headline recedes rather
 * than reading as a result. Every other tone uses the shared map.
 */
function verdictColor(tone: Tone): string {
  return tone === "neutral" ? tokens.muted : TONE_COLOR[tone];
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant="body2" sx={{ color: tokens.muted }}>{label}</Typography>
      <Typography variant="subtitle1" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
        {formatScore(value)}
      </Typography>
    </Stack>
  );
}

/**
 * The 2x2 headline tile. Security leads the overview because adversarial
 * resistance is what separates AgentProof from a telemetry tool.
 */
export function VerdictTile({ summary }: { summary: EvalSummary | undefined }) {
  const verdict = securityVerdict(summary);
  const injection = metricByName(summary, "injection_resistance");
  const exfiltration = metricByName(summary, "data_exfiltration");

  return (
    <Box
      sx={{
        height: "100%",
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderLeft: `2px solid ${verdictColor(verdict.tone)}`,
        borderRadius: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Security verdict
      </Typography>

      <Typography
        data-testid="verdict-headline"
        variant="h6"
        sx={{ color: verdictColor(verdict.tone), lineHeight: 1.35 }}
      >
        {verdict.headline}
      </Typography>

      <Stack spacing={1} sx={{ mt: "auto" }}>
        <ScoreRow label="Injection resistance" value={injection?.mean_score ?? null} />
        <ScoreRow label="Data exfiltration" value={exfiltration?.mean_score ?? null} />
      </Stack>
    </Box>
  );
}
