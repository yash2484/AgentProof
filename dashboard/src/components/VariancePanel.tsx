import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { JUDGE_NOISE } from "./MetricDistribution";
import type { AnalyticsEvalRun } from "../types";

/** At this many runs a line stops being an extrapolation invitation. */
export const TREND_MIN_RUNS = 3;

const scored = (runs: AnalyticsEvalRun[]) =>
  runs.filter((r) => r.mean_score !== null) as (AnalyticsEvalRun & {
    mean_score: number;
  })[];

const when = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * Two runs are a line segment, not a trend.
 *
 * Drawing a trend line through two points invites an extrapolation the data
 * cannot support, so below three runs this renders a paired slope with the
 * delta stated and nothing else implied.
 */
function PairedSlope({ runs }: { runs: (AnalyticsEvalRun & { mean_score: number })[] }) {
  const [first, last] = [runs[0], runs[runs.length - 1]];
  const delta = last.mean_score - first.mean_score;
  const beyondNoise = Math.abs(delta) > JUDGE_NOISE;

  return (
    <Box data-testid="paired-slope" sx={{ mt: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {runs.map((r, i) => (
          <Box key={r.run_at} sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: tokens.muted }}>
              run {i + 1} · {when(r.run_at)}
            </Typography>
            <Typography variant="h6" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
              {r.mean_score.toFixed(3)}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography
        data-testid="paired-delta"
        variant="body2"
        sx={{ color: tokens.muted, mt: 1, ...TABULAR_NUMS }}
      >
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(3)} between runs
        {beyondNoise
          ? ` — larger than the ±${JUDGE_NOISE} judge swing`
          : ` — within the ±${JUDGE_NOISE} judge swing`}
      </Typography>
    </Box>
  );
}

/**
 * Band 3 — run-to-run variance. The panel never disappears; only its form
 * changes with n, so nothing shifts on the page when run 3 lands.
 *
 * Labelled variance, never trend. Same trace, same frozen fixture, same
 * model, 0.20 on one run and 0.40 on the next — that swing is a first-class
 * statistic here, and it is the reason the gate needs an effect-size guard
 * rather than significance alone.
 */
export function VariancePanel({ runs }: { runs: AnalyticsEvalRun[] }) {
  const points = scored(runs);

  return (
    <Box
      data-testid="variance-panel"
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
        minHeight: 180,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Run-to-run variance
      </Typography>

      {points.length === 0 && (
        <Typography data-testid="variance-empty" variant="body2" sx={{ color: tokens.muted, mt: 1.5 }}>
          No scored runs in this window yet. This panel fills in once evaluation
          has run twice.
        </Typography>
      )}

      {points.length === 1 && (
        <Box data-testid="variance-single" sx={{ mt: 1.5 }}>
          <Typography variant="h6" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
            {points[0].mean_score.toFixed(3)}
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.muted }}>
            One run. Variance needs a second — the slot is held so nothing moves
            when it arrives.
          </Typography>
        </Box>
      )}

      {points.length >= 2 && points.length < TREND_MIN_RUNS && <PairedSlope runs={points} />}

      {points.length >= TREND_MIN_RUNS && (
        <Box data-testid="variance-trend" sx={{ mt: 1 }}>
          <LineChart
            height={160}
            margin={{ top: 10, right: 16, bottom: 24, left: 40 }}
            xAxis={[
              {
                data: points.map((_p, i) => i),
                scaleType: "point",
                valueFormatter: (i: number, ctx) =>
                  ctx?.location === "tick" ? `#${i + 1}` : when(points[i].run_at),
              },
            ]}
            yAxis={[{ min: 0, max: 1 }]}
            series={[
              {
                label: "mean score",
                data: points.map((p) => p.mean_score),
                color: tokens.brand.solid,
              },
            ]}
          />
        </Box>
      )}

      {points.length >= 2 && (
        <Typography variant="caption" sx={{ color: tokens.muted, display: "block", mt: 1 }}>
          Variance, not trend. A ±{JUDGE_NOISE} swing between runs on identical
          input is expected from the judge.
        </Typography>
      )}
    </Box>
  );
}
