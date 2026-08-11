import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { tokens, SPACE, DATA, UI, PROSE, TILE_PADDING } from "../theme";
import {
  JUDGE_NOISE,
  groupColor,
  groupHasJudgeNoise,
  groupLabel,
  presentGroups,
} from "../lib/groups";
import { varianceReading, varianceCaption } from "../lib/variance";
import { SectionHeading, DataPanel, CHART_SX } from "./Ledger";
import type { AnalyticsEvalRun, MetricGroup } from "../types";

/** At this many runs a line stops being an extrapolation invitation. */
export const TREND_MIN_RUNS = 3;

const when = (iso: string) => new Date(iso).toLocaleDateString();

const meanFor = (run: AnalyticsEvalRun, group: MetricGroup): number | null =>
  run.group_means?.[group] ?? null;

/**
 * Where the y-axis starts.
 *
 * Scores live in the top fifth of the range, so a 0–1 axis renders the
 * measured 0.925 → 0.785 drift as a hairline — the same invisibility the
 * pooled mean produced, arriving by a different route. The axis drops to the
 * tenth below the lowest point instead, and the panel says that it did: a
 * truncated axis exaggerates movement, and one that is not declared is a
 * deception whether or not it was meant as one.
 *
 * Capped at 0.9 so a run of perfect scores keeps a tenth of visible range
 * rather than collapsing to a line with no room above or below it.
 */
export function axisFloor(values: number[]): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  return Math.min(0.9, Math.max(0, Math.floor(min * 10) / 10));
}

/** Runs that scored at least one group. A run of broken judge calls scored none. */
const scored = (runs: AnalyticsEvalRun[]) =>
  runs.filter((r) => Object.values(r.group_means ?? {}).some((v) => v !== null));

function GroupKey({ group }: { group: MetricGroup }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: groupColor(group),
          flexShrink: 0,
        }}
      />
      {/* A legend key names a series; it is not a column head, so it is not
        * uppercased. Four tracked capitals in a row rebuilds the eyebrow. */}
      <Box component="span" sx={{ ...UI, fontSize: 12.5, color: tokens.ink2 }}>
        {groupLabel(group)}
      </Box>
    </Box>
  );
}

/**
 * Two runs are a line segment, not a trend.
 *
 * Drawing a trend line through two points invites an extrapolation the data
 * cannot support, so below three runs each group renders as a paired slope
 * with its own delta stated and nothing else implied.
 */
function PairedSlope({
  runs,
  groups,
}: {
  runs: AnalyticsEvalRun[];
  groups: MetricGroup[];
}) {
  const [first, last] = [runs[0], runs[runs.length - 1]];

  return (
    <Box data-testid="paired-slope">
      <Box component="div" sx={{ ...DATA, color: tokens.dim, mb: `${SPACE.sm}px` }}>
        {when(first.run_at)} → {when(last.run_at)}
      </Box>
      {/* Groups run across rather than down. Stacked, three groups made a
        * 500px column of mostly empty tint for nine numbers. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: `${SPACE.md}px`,
        }}
      >
        {groups.map((group) => {
        const from = meanFor(first, group);
        const to = meanFor(last, group);
        if (from === null || to === null) return null;
        const delta = to - from;
        // The judge band belongs to judged scores only. A budget check is
        // measured, so a 0.4 drop there is a fact, not a swing.
        const judged = groupHasJudgeNoise(group);
        const beyondNoise = Math.abs(delta) > JUDGE_NOISE;

        return (
          <Box key={group}>
            <GroupKey group={group} />
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: "2px" }}>
              <Box component="span" sx={{ ...DATA, fontSize: 17, color: tokens.dim }}>
                {from.toFixed(3)}
              </Box>
              <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
                →
              </Box>
              <Box
                component="span"
                sx={{ ...DATA, fontSize: 17, fontWeight: 500, color: tokens.ink }}
              >
                {to.toFixed(3)}
              </Box>
            </Box>
            <Box
              component="div"
              data-testid={`paired-delta-${group}`}
              sx={{ ...DATA, color: tokens.dim }}
            >
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(3)}
              {judged
                ? beyondNoise
                  ? ` — larger than the ±${JUDGE_NOISE} judge swing`
                  : ` — within the ±${JUDGE_NOISE} judge swing`
                : ""}
            </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Band 2 — run-to-run variance, one series per metric group.
 *
 * The panel never disappears; only its form changes with n, so nothing
 * shifts on the page when run 3 lands.
 *
 * Labelled variance, never trend. Same trace, same frozen fixture, same
 * model, 0.20 on one run and 0.40 on the next — that swing is a first-class
 * statistic here, and it is the reason the gate needs an effect-size guard
 * rather than significance alone.
 *
 * The series are per group because the three groups do not share a unit.
 * Pooling them was measured on the synthetic corpus: a −0.15 drift in the
 * judged metrics came out as a flat 0.974 → 0.929 line, diluted by six
 * metrics pinned at 1.000.
 */
export function VariancePanel({ runs }: { runs: AnalyticsEvalRun[] }) {
  const points = scored(runs);
  const groups = presentGroups(points);
  const judged = groups.some(groupHasJudgeNoise);
  const reading = varianceReading(points, groups);
  const floor = axisFloor(
    points.flatMap((p) =>
      groups.map((g) => meanFor(p, g)).filter((v): v is number => v !== null),
    ),
  );

  return (
    <Box
      component="section"
      aria-label="What changed between runs"
      data-testid="variance-panel"
    >
      <SectionHeading>What changed between runs</SectionHeading>

      <DataPanel sx={{ p: `${TILE_PADDING}px`, minHeight: 140 }}>
        {points.length === 0 && (
          <Typography
            data-testid="variance-empty"
            sx={{ ...PROSE, fontSize: 15, color: tokens.ink2 }}
          >
            No scored runs in this window yet. This panel fills in once
            evaluation has run twice.
          </Typography>
        )}

        {points.length === 1 && (
          <Box data-testid="variance-single">
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.md}px` }}>
              {groups.map((group) => (
                <Box key={group}>
                  <GroupKey group={group} />
                  <Box
                    component="span"
                    sx={{ ...DATA, fontSize: 17, fontWeight: 500, color: tokens.ink }}
                  >
                    {meanFor(points[0], group)?.toFixed(3) ?? "—"}
                  </Box>
                </Box>
              ))}
            </Box>
            <Typography sx={{ ...PROSE, fontSize: 15, color: tokens.ink2, mt: 1 }}>
              One run. Variance needs a second — the slot is held so nothing
              moves when it arrives.
            </Typography>
          </Box>
        )}

        {points.length >= 2 && points.length < TREND_MIN_RUNS && (
          <PairedSlope runs={points} groups={groups} />
        )}

        {points.length >= TREND_MIN_RUNS && (
          <Box data-testid="variance-trend">
            <Box
              sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.sm}px`, mb: 0.5 }}
            >
              {groups.map((group) => (
                <GroupKey key={group} group={group} />
              ))}
            </Box>
            <LineChart
              height={168}
              margin={{ top: 8, right: 16, bottom: 24, left: 40 }}
              slotProps={{ legend: { hidden: true } }}
              // A faint horizontal grid only. Vertical rules would imply the
              // x-axis is continuous, and it is a sequence of runs.
              grid={{ horizontal: true }}
              sx={CHART_SX}
              xAxis={[
                {
                  data: points.map((_p, i) => i),
                  scaleType: "point",
                  // The tooltip carries the denominator too. A reader hovering
                  // one point is asking what it is worth, and "3 traces" is
                  // most of that answer.
                  valueFormatter: (i: number, ctx) =>
                    ctx?.location === "tick"
                      ? `#${i + 1}`
                      : `${when(points[i].run_at)} · ${points[i].trace_count} ${
                          points[i].trace_count === 1 ? "trace" : "traces"
                        }`,
                },
              ]}
              yAxis={[{ min: floor, max: 1 }]}
              series={groups.map((group) => ({
                label: groupLabel(group),
                // Nulls break the line rather than dropping to zero: a group
                // a run did not measure is unknown, not failing.
                data: points.map((p) => meanFor(p, group)),
                color: groupColor(group),
                connectNulls: false,
                showMark: points.length <= 12,
              }))}
            />
          </Box>
        )}

        {points.length >= 2 && reading.unevenSamples && (
          // Only when the runs are not peers. On comparable runs this is four
          // identical numbers in a row, which trains the reader to skip the
          // line in the one case it matters.
          <Box
            data-testid="variance-denominators"
            sx={{ ...DATA, color: tokens.dim, mt: `${SPACE.sm}px` }}
          >
            Traces per run: {points.map((p) => p.trace_count).join(" · ")}
          </Box>
        )}

        {points.length >= 2 && (
          <Typography
            // A footnote, not body prose: it may run wider than the 62ch
            // reading measure without becoming hard to read, and at 62ch it
            // wrapped into three short lines inside a panel four times that.
            sx={{ ...PROSE, fontSize: 14, maxWidth: "88ch", color: tokens.dim, mt: `${SPACE.sm}px` }}
          >
            {/* Derived, not fixed. The sentence that used to sit here said a
              * ±0.2 swing was expected whatever the chart showed — including
              * under a line dropping 0.926 → 0.350 across runs that measured
              * one trace and thirteen. */}
            {varianceCaption(reading, judged)}
            {points.length >= TREND_MIN_RUNS && floor > 0 && (
              <Box component="span" data-testid="axis-note">
                {" "}
                Axis starts at {floor.toFixed(2)}, not 0.
              </Box>
            )}
          </Typography>
        )}
      </DataPanel>
    </Box>
  );
}
