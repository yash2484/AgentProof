import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import type { EvalResult, MetricDef } from "../types";

export interface Series {
  name: string;
  points: { x: number; y: number }[];
}

export function seriesFromResults(results: EvalResult[]): Series[] {
  const byMetric = new Map<string, { x: number; y: number }[]>();
  for (const r of results) {
    if (r.score === null || r.evaluated_at === null) continue;
    const x = Date.parse(r.evaluated_at);
    if (!Number.isFinite(x)) continue;
    const points = byMetric.get(r.metric_name) ?? [];
    points.push({ x, y: r.score });
    byMetric.set(r.metric_name, points);
  }
  return [...byMetric.entries()].map(([name, points]) => ({
    name,
    points: points.sort((a, b) => a.x - b.x),
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

  // Shared, sorted x-axis across all metrics.
  const xValues = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const thresholds = thresholdsFor(series, metrics);

  return (
    <Box data-testid="score-timeseries" sx={{ width: "100%" }}>
      <LineChart
        height={360}
        xAxis={[{ data: xValues, scaleType: "time", valueFormatter: (v) => new Date(v).toLocaleString() }]}
        series={series.map((s) => ({
          label: s.name,
          data: xValues.map((x) => s.points.find((p) => p.x === x)?.y ?? null),
          connectNulls: true,
        }))}
      >
        {thresholds.map((t) => (
          <ChartsReferenceLine
            key={t}
            y={t}
            label={`threshold ${t}`}
            lineStyle={{ stroke: "#d32f2f", strokeDasharray: "4 4" }}
          />
        ))}
      </LineChart>
    </Box>
  );
}
