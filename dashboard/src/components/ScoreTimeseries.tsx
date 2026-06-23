import { Box } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import type { EvalResult } from "../types";

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

export function ScoreTimeseries({ results }: { results: EvalResult[] }) {
  const series = seriesFromResults(results);
  // Shared, sorted x-axis across all metrics.
  const xValues = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);

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
      />
    </Box>
  );
}
