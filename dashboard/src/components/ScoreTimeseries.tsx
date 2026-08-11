import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { tokens } from "../theme";
import type { EvalResult, MetricDef } from "../types";

export interface SeriesPoint {
  /** Position on the shared run axis. */
  runIndex: number;
  /** The real evaluation instant, for the tooltip. */
  at: number;
  y: number;
}

export interface Series {
  name: string;
  points: SeriesPoint[];
}

/**
 * Distinct evaluation instants, ascending. These are the run positions.
 *
 * Plotting raw timestamps compressed the whole history into about four
 * seconds, because a batch export writes every trace's results at once. The
 * axis is therefore ordinal — run 0, run 1, run 2 — and the timestamp moves
 * to the tooltip, where it is still exact.
 */
export function runTimestamps(results: EvalResult[]): number[] {
  const instants = results
    .filter((r) => r.score !== null && r.evaluated_at !== null)
    .map((r) => Date.parse(r.evaluated_at as string))
    .filter((ms) => Number.isFinite(ms));
  return [...new Set(instants)].sort((a, b) => a - b);
}

export function seriesFromResults(results: EvalResult[]): Series[] {
  const runs = runTimestamps(results);
  const indexOf = new Map(runs.map((at, i) => [at, i]));

  const byMetric = new Map<string, SeriesPoint[]>();
  for (const r of results) {
    if (r.score === null || r.evaluated_at === null) continue;
    const at = Date.parse(r.evaluated_at);
    const runIndex = indexOf.get(at);
    if (runIndex === undefined) continue;
    const points = byMetric.get(r.metric_name) ?? [];
    points.push({ runIndex, at, y: r.score });
    byMetric.set(r.metric_name, points);
  }
  return [...byMetric.entries()].map(([name, points]) => ({
    name,
    points: points.sort((a, b) => a.runIndex - b.runIndex),
  }));
}

/** Distinct threshold values among the metrics actually plotted. */
export function thresholdsFor(series: Series[], metrics: MetricDef[]): number[] {
  const plotted = new Set(series.map((s) => s.name));
  const values = metrics
    .filter((m) => plotted.has(m.name) && m.threshold !== null)
    .map((m) => m.threshold as number);
  return [...new Set(values)].sort((a, b) => a - b);
}

export function ScoreTimeseries({
  results,
  metrics = [],
}: {
  results: EvalResult[];
  metrics?: MetricDef[];
}) {
  const series = seriesFromResults(results);

  if (series.length === 0) {
    return (
      <Box data-testid="score-timeseries" sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No scored results to chart.</Typography>
      </Box>
    );
  }

  const runs = runTimestamps(results);
  const axis = runs.map((_at, i) => i);
  const thresholds = thresholdsFor(series, metrics);

  return (
    <Box data-testid="score-timeseries" sx={{ width: "100%" }}>
      <LineChart
        height={360}
        xAxis={[
          {
            data: axis,
            scaleType: "point",
            // Ticks stay short; the tooltip carries the exact instant.
            valueFormatter: (i: number, ctx) =>
              ctx?.location === "tick"
                ? `#${i + 1}`
                : new Date(runs[i]).toLocaleString(),
          },
        ]}
        series={series.map((s) => ({
          label: s.name,
          data: axis.map((i) => s.points.find((p) => p.runIndex === i)?.y ?? null),
          connectNulls: true,
        }))}
      >
        {thresholds.map((t) => (
          <ChartsReferenceLine
            key={t}
            y={t}
            label={`threshold ${t}`}
            lineStyle={{
              stroke: tokens.status.fail,
              strokeDasharray: "4 4",
            }}
          />
        ))}
      </LineChart>
    </Box>
  );
}
