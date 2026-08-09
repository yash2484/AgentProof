import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";
import { LineChart } from "@mui/x-charts/LineChart";
import { useMetricDetail } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { metricCopy } from "../lib/metricCopy";
import { JUDGE_NOISE, groupColor, groupHasJudgeNoise, groupLabel } from "../lib/groups";
import { isSyntheticProject } from "../lib/analytics";
import { SyntheticBadge } from "../components/SeverityChip";
import { EmptyState } from "../components/EmptyState";
import { tokens, SPACE, TILE_GAP, TILE_PADDING, TABULAR_NUMS } from "../theme";
import type { MetricDetail, SpanReasoning, WorstRow } from "../types";

/**
 * One metric, in depth.
 *
 * Ordered the way a reader actually asks: what is this, how was it computed,
 * what does it catch — and only then the numbers. A metric you cannot explain
 * is a metric nobody will act on, and a number whose mechanism is hidden is a
 * number you have to take on faith.
 *
 * The judge's reasoning at the bottom has been in the database since the judge
 * shipped and has never been displayed anywhere in the product. It is the most
 * useful thing on the page.
 */
export function MetricDetailPage() {
  const { metric = "" } = useParams();
  const [params] = useSearchParams();
  const { project: contextProject } = useProject();

  // The URL wins over context. Context is in-memory, so a link opened in a
  // fresh tab would otherwise fall back to every project and pool a generated
  // corpus into a real one's figures without saying so. The window travels
  // for the same reason: a tile reading "2 of 27" must not open a page
  // reading 321 because it silently widened the range.
  const project = params.get("project") ?? contextProject;
  const daysParam = Number(params.get("days"));
  const days = Number.isFinite(daysParam) && params.has("days") ? daysParam : 30;

  const query = useMetricDetail(metric, project ?? undefined, days);
  const data = query.data;

  if (query.isLoading) {
    return (
      <Typography variant="body2" sx={{ color: tokens.muted }}>
        Loading {metric}…
      </Typography>
    );
  }

  if (query.isError || !data) {
    return (
      <Box data-testid="metric-detail-error">
        <EmptyState
          title={`No results for "${metric}"`}
          body="This metric has no eval rows in the selected project and window. It may never have run here, or the link may name a metric that no longer exists in agentproof.yaml."
          action={
            <Box
              component={RouterLink}
              to="/evals"
              sx={{ color: tokens.brand.text, textDecoration: "none" }}
            >
              ← Back to Evals
            </Box>
          }
        />
      </Box>
    );
  }

  const copy = metricCopy(data.metric_name, data.metric_type);
  const judged = groupHasJudgeNoise(data.group);
  const color = groupColor(data.group);

  return (
    <Box data-testid="metric-detail">
      <Box
        component={RouterLink}
        to="/evals"
        sx={{
          color: tokens.muted,
          textDecoration: "none",
          fontSize: 13,
          "&:hover": { color: tokens.ink },
        }}
      >
        ← Evals
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
        <Box
          aria-hidden
          sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }}
        />
        <Typography variant="h4" sx={{ color: tokens.ink }}>
          {copy.title}
        </Typography>
      </Box>
      <Box
        data-testid="metric-scope"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          mb: `${SPACE.md}px`,
        }}
      >
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          {groupLabel(data.group)}
          {" · "}
          <Box component="span" data-testid="metric-ci-block">
            {data.ci_block ? "blocks CI on regression" : "advisory — does not block CI"}
          </Box>
          {" · "}
          {/* Never implicit. Without a project this page pools every project,
            * including a generated one, and that has to be said out loud. */}
          {project ?? "all projects, including any generated corpus"}
          {" · "}
          {days === 0 ? "all history" : `last ${days} days`}
        </Typography>
        {isSyntheticProject(project) && <SyntheticBadge />}
      </Box>

      <Box sx={{ display: "grid", gap: `${TILE_GAP}px` }}>
        <Explainer copy={copy} />
        <CurrentState data={data} judged={judged} color={color} />
        <History data={data} color={color} judged={judged} />
        <WorstTraces rows={data.worst} judged={judged} />
      </Box>
    </Box>
  );
}

function Panel({
  title,
  children,
  ...rest
}: {
  title: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
      }}
      {...rest}
    >
      <Typography
        variant="caption"
        sx={{
          color: tokens.muted,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          display: "block",
          mb: 1,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Explainer({ copy }: { copy: ReturnType<typeof metricCopy> }) {
  const rows = [
    { key: "measures", label: "What it measures", body: copy.measures },
    { key: "computed", label: "How it is computed", body: copy.computed },
    { key: "matters", label: "What it catches", body: copy.matters },
  ];

  return (
    <Panel title="In plain language">
      <Box sx={{ display: "grid", gap: `${SPACE.sm}px`, maxWidth: "68ch" }}>
        {rows.map((row) => (
          <Box key={row.key}>
            <Typography variant="body2" sx={{ color: tokens.muted }}>
              {row.label}
            </Typography>
            <Typography
              data-testid={`metric-${row.key}`}
              variant="body1"
              sx={{ color: tokens.ink }}
            >
              {row.body}
            </Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: tokens.muted }}>
        {label}
      </Typography>
    </Box>
  );
}

function CurrentState({
  data,
  judged,
  color,
}: {
  data: MetricDetail;
  judged: boolean;
  color: string;
}) {
  const h = data.health;
  const total = data.buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <Panel title="Current state">
      <Box
        data-testid="metric-health-figures"
        sx={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.lg}px`, mb: 1.5 }}
      >
        <Figure
          label={judged ? `mean ±${JUDGE_NOISE} judge swing` : "mean"}
          value={h.mean_score === null ? "—" : h.mean_score.toFixed(3)}
        />
        <Figure
          label="spread (σ)"
          value={h.std === null ? "n=1" : h.std.toFixed(3)}
        />
        <Figure
          label="threshold"
          value={h.threshold === null ? "—" : h.threshold.toFixed(2)}
        />
        <Figure label="measurements" value={String(h.count)} />
        <Figure label="flagged" value={String(h.failed)} />
        <Figure label="degraded" value={String(h.degraded)} />
      </Box>

      <Box data-testid="metric-distribution">
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            gap: "2px",
            height: 96,
            px: 0.5,
          }}
        >
          {Array.from({ length: 10 }, (_v, i) => {
            const lower = i / 10;
            const bucket = data.buckets.find(
              (b) => Math.abs(b.bucket - lower) < 0.001,
            );
            const count = bucket?.count ?? 0;
            const height = total > 0 ? (count / total) * 100 : 0;
            const belowThreshold =
              h.threshold !== null && lower + 0.1 <= h.threshold + 0.001;
            return (
              <Box
                key={lower}
                title={`${lower.toFixed(1)}–${(lower + 0.1).toFixed(1)}: ${count}`}
                sx={{
                  flex: 1,
                  height: `${Math.max(height, count > 0 ? 3 : 0)}%`,
                  minHeight: count > 0 ? 3 : 0,
                  bgcolor: belowThreshold ? tokens.status.fail.solid : color,
                  borderRadius: "2px 2px 0 0",
                }}
              />
            );
          })}
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: tokens.muted }}>
            0.0
          </Typography>
          <Typography variant="caption" sx={{ color: tokens.muted }}>
            {total} measurements, bucketed at 0.1 — bars below the threshold are
            red
          </Typography>
          <Typography variant="caption" sx={{ color: tokens.muted }}>
            1.0
          </Typography>
        </Box>
      </Box>
    </Panel>
  );
}

function History({
  data,
  color,
  judged,
}: {
  data: MetricDetail;
  color: string;
  judged: boolean;
}) {
  const points = data.runs;
  const scored = points.filter((p) => p.mean_score !== null);

  return (
    <Panel title="History">
      {scored.length < 2 ? (
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          {scored.length === 0
            ? "No run has produced a score for this metric in this window."
            : "One scored run so far. A second is what turns a score into a movement."}
        </Typography>
      ) : (
        <>
          <LineChart
            height={200}
            margin={{ top: 8, right: 16, bottom: 24, left: 40 }}
            slotProps={{ legend: { hidden: true } }}
            xAxis={[
              {
                data: points.map((_p, i) => i),
                scaleType: "point",
                valueFormatter: (i: number, ctx) =>
                  ctx?.location === "tick"
                    ? `#${i + 1}`
                    : new Date(points[i].run_at).toLocaleDateString(),
              },
            ]}
            yAxis={[{ min: 0, max: 1 }]}
            series={[
              {
                label: data.metric_name,
                data: points.map((p) => p.mean_score),
                color,
                connectNulls: false,
              },
              ...(data.health.threshold !== null
                ? [
                    {
                      label: "threshold",
                      data: points.map(() => data.health.threshold as number),
                      color: tokens.status.fail.solid,
                      showMark: false,
                    },
                  ]
                : []),
            ]}
          />
          <Typography variant="caption" sx={{ color: tokens.muted }}>
            Red line is the threshold. A run with no bar measured nothing —
            every judge call in it failed.
            {judged &&
              ` Judged scores carry a ±${JUDGE_NOISE} swing between runs on identical input.`}
          </Typography>
        </>
      )}
    </Panel>
  );
}

/**
 * The judge writes markdown. Render just the emphasis it actually uses.
 *
 * A full markdown renderer is a dependency and an XSS surface for a string
 * that came back from a model; splitting on `**` covers what the judge
 * produces and cannot inject markup, because every fragment stays text.
 */
export function renderEmphasis(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((fragment, i) =>
    i % 2 === 1 ? (
      <Box component="strong" key={i} sx={{ color: tokens.ink, fontWeight: 600 }}>
        {fragment}
      </Box>
    ) : (
      fragment
    ),
  );
}

function Reasoning({ record }: { record: SpanReasoning }) {
  if (record.error) {
    return (
      <Typography variant="body2" sx={{ color: tokens.status.warn, mt: 0.5 }}>
        Judge call failed: {record.error} — this measurement is degraded, not a
        finding.
      </Typography>
    );
  }
  return (
    <Typography
      variant="body2"
      sx={{
        color: tokens.ink,
        mt: 0.5,
        whiteSpace: "pre-wrap",
        maxWidth: "72ch",
        borderLeft: `1px solid ${tokens.border}`,
        pl: 1.5,
      }}
    >
      {renderEmphasis(record.reasoning ?? "")}
    </Typography>
  );
}

function WorstTraces({ rows, judged }: { rows: WorstRow[]; judged: boolean }) {
  return (
    <Panel title={judged ? "Lowest scores, with the judge's reasoning" : "Lowest scores"}>
      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          No scored measurements in this window.
        </Typography>
      ) : (
        <Box sx={{ display: "grid", gap: `${SPACE.md}px` }}>
          {rows.map((row) => (
            <Box
              key={`${row.trace_id}-${row.evaluated_at}`}
              data-testid={`worst-row-${row.trace_id}`}
              sx={{ borderTop: `1px solid ${tokens.border}`, pt: 1.5 }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: row.passed ? tokens.ink : tokens.status.fail.text,
                    ...TABULAR_NUMS,
                  }}
                >
                  {row.score === null ? "—" : row.score.toFixed(3)}
                </Typography>
                <Box
                  component={RouterLink}
                  to={`/traces/${row.trace_id}`}
                  data-testid={`worst-link-${row.trace_id}`}
                  sx={{
                    color: tokens.brand.text,
                    textDecoration: "none",
                    fontSize: 13,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {row.trace_id.slice(0, 12)}… →
                </Box>
                <Typography variant="caption" sx={{ color: tokens.muted }}>
                  {row.evaluated_at
                    ? new Date(row.evaluated_at).toLocaleString()
                    : "no timestamp"}
                </Typography>
              </Box>

              {row.explanation && (
                <Typography variant="caption" sx={{ color: tokens.muted, display: "block" }}>
                  {row.explanation}
                </Typography>
              )}

              {row.reasoning.map((record, i) => (
                <Reasoning key={`${record.span_id}-${i}`} record={record} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Panel>
  );
}
