import { Box, Typography } from "@mui/material";
import { tokens, TABULAR_NUMS } from "../theme";
import { metricSeverity, severityCopy, varianceLabel } from "../lib/analytics";
import { JUDGE_NOISE, groupHasJudgeNoise } from "../lib/groups";
import { SeverityChip, SEVERITY_COLOR } from "./SeverityChip";
import type { GateVerdict, MetricHealth, ScoreBucket } from "../types";

const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;

/**
 * Judge noise applies to judged metrics; a latency budget has no such band.
 *
 * Reads the server-assigned group rather than the metric type, so there is
 * one taxonomy on the client and not two.
 */
export function hasJudgeNoise(metric: MetricHealth): boolean {
  return groupHasJudgeNoise(metric.group);
}

/**
 * One metric as a distribution rather than a mean.
 *
 * A mean of 0.911 must not hide a run that scored 0.20, so the bars are the
 * subject and the mean is a marker on top of them.
 */
export function MetricDistribution({
  metric,
  buckets,
  gate,
}: {
  metric: MetricHealth;
  buckets: ScoreBucket[];
  gate?: GateVerdict;
}) {
  const severity = metricSeverity(metric, gate);
  const color = SEVERITY_COLOR[severity];
  const mine = buckets.filter((b) => b.metric_name === metric.metric_name);
  const tallest = Math.max(1, ...mine.map((b) => b.count));
  const mean = metric.mean_score;

  return (
    <Box
      data-testid={`metric-row-${metric.metric_name}`}
      sx={{ py: 1.5, borderTop: `1px solid ${tokens.border}` }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
          mb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="subtitle2" sx={{ color: tokens.ink }}>
            {metric.metric_name}
          </Typography>
          <SeverityChip severity={severity} />
          {!metric.ci_block && (
            <Typography variant="caption" sx={{ color: tokens.muted }}>
              advisory
            </Typography>
          )}
        </Box>
        <Typography variant="body2" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          {severityCopy(metric, gate)} · {varianceLabel(metric)}
        </Typography>
      </Box>

      {/* 0 -> 1 track. Everything below is positioned on this one scale. */}
      <Box
        data-testid={`distribution-${metric.metric_name}`}
        sx={{
          position: "relative",
          height: 46,
          bgcolor: tokens.surfaceRaised,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {hasJudgeNoise(metric) && mean !== null && (
          <Box
            data-testid={`noise-band-${metric.metric_name}`}
            title={`±${JUDGE_NOISE} judge noise`}
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: pct(mean - JUDGE_NOISE),
              width: pct(
                Math.min(1, mean + JUDGE_NOISE) - Math.max(0, mean - JUDGE_NOISE),
              ),
              bgcolor: tokens.brand.solid,
              opacity: 0.12,
            }}
          />
        )}

        {mine.map((b) => (
          <Box
            key={b.bucket}
            data-testid={`bucket-${metric.metric_name}-${b.bucket}`}
            title={`${b.count} at ${b.bucket.toFixed(1)}–${(b.bucket + 0.1).toFixed(1)}`}
            sx={{
              position: "absolute",
              bottom: 0,
              // Bins are 0.1 wide and the last one is 0.9-1.0, so a bar can
              // fill its bin without running off the end of the track.
              left: pct(b.bucket),
              width: "10%",
              height: `${(b.count / tallest) * 100}%`,
              bgcolor: color.fill,
              opacity: 0.85,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}

        {metric.threshold !== null && (
          <Box
            data-testid={`threshold-${metric.metric_name}`}
            title={`threshold ${metric.threshold}`}
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: pct(metric.threshold),
              width: "2px",
              bgcolor: tokens.status.fail.solid,
            }}
          />
        )}

        {mean !== null && (
          <Box
            data-testid={`mean-${metric.metric_name}`}
            title={`mean ${mean.toFixed(3)}`}
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: pct(mean),
              width: "2px",
              bgcolor: tokens.ink,
            }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
        <Typography variant="caption" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          0.0
        </Typography>
        <Typography variant="caption" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          mean {mean === null ? "—" : mean.toFixed(3)}
          {hasJudgeNoise(metric) && mean !== null ? ` ±${JUDGE_NOISE}` : ""}
          {metric.threshold !== null ? ` · threshold ${metric.threshold}` : ""}
        </Typography>
        <Typography variant="caption" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
          1.0
        </Typography>
      </Box>
    </Box>
  );
}
