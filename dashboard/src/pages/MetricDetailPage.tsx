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
import {
  SectionHeading,
  DataPanel,
  Figure,
  FigureRow,
  Prose,
  NoteBlock,
} from "../components/Ledger";
import {
  tokens,
  SPACE,
  TILE_PADDING,
  DATA,
  UI,
  MICRO,
  PROSE,
} from "../theme";
import type { MetricDetail, SpanReasoning, WorstRow } from "../types";

/**
 * One metric, in depth. The page the register exists for.
 *
 * Ordered the way a reader actually asks: what is this, how was it computed,
 * what does it catch — and only then the numbers. A metric you cannot explain
 * is a metric nobody will act on, and a number whose mechanism is hidden is a
 * number you have to take on faith.
 *
 * ~19,900 characters of body text live on this page. That writing is the
 * product's differentiator and monospace is a poor face for it — no italic, a
 * crippled weight range, measurably slower to read. So prose sits left in
 * serif at a reading measure and every measured figure sits right in mono on
 * tint, and the split is legible before a single word is read.
 *
 * The judge's reasoning at the bottom had been in the database since the
 * judge shipped without ever being displayed. It is the most useful thing
 * here, and it is the clearest case for the serif.
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
      <Box sx={{ ...DATA, color: tokens.dim }}>Loading {metric}…</Box>
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
              sx={{ ...UI, color: tokens.link, textDecoration: "none" }}
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
          ...UI,
          fontSize: 13,
          color: tokens.dim,
          textDecoration: "none",
          "&:hover": { color: tokens.link },
        }}
      >
        ← Evals
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          columnGap: `${SPACE.sm}px`,
          rowGap: "4px",
          mt: "2px",
          pb: `${SPACE.xs}px`,
          borderBottom: `1px solid ${tokens.hairStrong}`,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            bgcolor: color,
            alignSelf: "center",
          }}
        />
        <Typography variant="h4" component="h1" sx={{ color: tokens.ink }}>
          {copy.title}
        </Typography>
        <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
          {data.metric_name}
        </Box>
        {isSyntheticProject(project) && <SyntheticBadge />}
      </Box>

      <Box
        data-testid="metric-scope"
        sx={{
          ...DATA,
          color: tokens.dim,
          mt: "6px",
          mb: `${SPACE.lg}px`,
        }}
      >
        {groupLabel(data.group)}
        {" · "}
        <Box component="span" data-testid="metric-ci-block">
          {data.ci_block ? "blocks CI on regression" : "advisory — does not block CI"}
        </Box>
        {" · "}
        {/* Never implicit. Without a project this page pools every project,
          * and that has to be said out loud. "All" excludes generated
          * corpora server-side, so it can no longer pool a fabricated one. */}
        {project ?? "all measured projects"}
        {" · "}
        {days === 0 ? "all history" : `last ${days} days`}
      </Box>

      {/* The register, made structural. Prose holds a 60ch column on paper;
        * figures sit on tint beside it. Below 1000px the columns stack and
        * the explanation still comes first, because it is what makes the
        * numbers mean anything. */}
      <Box
        sx={{
          display: "grid",
          gap: `${SPACE.lg}px`,
          gridTemplateColumns: "1fr",
          alignItems: "start",
          "@media (min-width:1000px)": { gridTemplateColumns: "minmax(0, 30rem) 1fr" },
        }}
      >
        <Explainer copy={copy} />
        <CurrentState data={data} judged={judged} />
      </Box>

      <Box sx={{ mt: `${SPACE.lg}px`, display: "grid", gap: `${SPACE.lg}px` }}>
        <History data={data} color={color} judged={judged} />
        <WorstTraces rows={data.worst} judged={judged} />
      </Box>
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
    <Box component="section" aria-label="In plain language">
      <SectionHeading>In plain language</SectionHeading>
      {/* No panel. Prose sits directly on paper — a container around it would
        * make writing look measured, which is the one confusion this page
        * exists to prevent. */}
      <Box sx={{ display: "grid", gap: `${SPACE.sm}px` }}>
        {rows.map((row) => (
          <Box key={row.key}>
            <Box component="span" sx={{ ...UI, fontSize: 12.5, color: tokens.dim }}>
              {row.label}
            </Box>
            <Prose data-testid={`metric-${row.key}`} sx={{ color: tokens.ink }}>
              {row.body}
            </Prose>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function CurrentState({ data, judged }: { data: MetricDetail; judged: boolean }) {
  const h = data.health;
  const total = data.buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <Box component="section" aria-label="Current state">
      <SectionHeading meta={`n=${h.count}`}>Current state</SectionHeading>

      <FigureRow
        data-testid="metric-health-figures"
        sx={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        <Figure
          size={17}
          label={judged ? `mean ±${JUDGE_NOISE} swing` : "mean"}
          value={h.mean_score === null ? "—" : h.mean_score.toFixed(3)}
        />
        <Figure size={17} label="spread (σ)" value={h.std === null ? "n=1" : h.std.toFixed(3)} />
        <Figure
          size={17}
          label="threshold"
          value={h.threshold === null ? "—" : h.threshold.toFixed(2)}
        />
        <Figure
          size={17}
          label="flagged"
          value={String(h.failed)}
          tone={h.failed > 0 ? "fail" : "neutral"}
        />
        <Figure
          size={17}
          label="degraded"
          value={String(h.degraded)}
          tone={h.degraded > 0 ? "watch" : "neutral"}
        />
      </FigureRow>

      <DataPanel data-testid="metric-distribution" sx={{ mt: `${SPACE.sm}px`, p: `${TILE_PADDING}px` }}>
        <Box
          sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 104 }}
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
                  // A single measurement in a bucket of 300 is 0.33% tall,
                  // which rounds to nothing. The floor is what makes a rare
                  // event visible at all, and its absence elsewhere is the
                  // defect that started this whole rework. Do not remove it.
                  height: `${Math.max(height, count > 0 ? 3 : 0)}%`,
                  minHeight: count > 0 ? 3 : 0,
                  // Steel, not the group colour: the group is already named
                  // above, and colouring every bar would leave the flagged
                  // ones with nothing to stand out against.
                  bgcolor: belowThreshold ? tokens.status.fail : tokens.steel,
                  borderRadius: "1px 1px 0 0",
                }}
              />
            );
          })}
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mt: "6px",
            pt: "5px",
            borderTop: `1px solid ${tokens.hair}`,
            ...MICRO,
            color: tokens.dim,
          }}
        >
          <span>0.0</span>
          <span>1.0</span>
        </Box>
        <Box sx={{ ...UI, fontSize: 12.5, color: tokens.dim, mt: "6px" }}>
          {total} measurements, bucketed at 0.1
          {h.threshold !== null && " — bars below the threshold are red"}
        </Box>
      </DataPanel>
    </Box>
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
    <Box component="section" aria-label="History">
      <SectionHeading>History</SectionHeading>
      <DataPanel sx={{ p: `${TILE_PADDING}px` }}>
        {scored.length < 2 ? (
          <Typography sx={{ ...PROSE, fontSize: 15, color: tokens.ink2 }}>
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
              grid={{ horizontal: true }}
              sx={{
                "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": {
                  stroke: tokens.hairStrong,
                },
                "& .MuiChartsAxis-tickLabel": {
                  fill: tokens.dim,
                  fontFamily: DATA.fontFamily,
                  fontSize: 11,
                },
                "& .MuiChartsGrid-line": { stroke: tokens.hair },
              }}
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
                        color: tokens.status.fail,
                        showMark: false,
                      },
                    ]
                  : []),
              ]}
            />
            <Typography sx={{ ...PROSE, fontSize: 14, maxWidth: "88ch", color: tokens.dim }}>
              Red line is the threshold. A run with no point measured nothing —
              every judge call in it failed.
              {judged &&
                ` Judged scores carry a ±${JUDGE_NOISE} swing between runs on identical input.`}
            </Typography>
          </>
        )}
      </DataPanel>
    </Box>
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
    // A broken judge call is a watch, not a finding. The distinction is the
    // product's central claim, so it gets the same ruled note the provenance
    // warning uses rather than being tucked into the prose as an aside.
    return (
      <NoteBlock tone="watch" sx={{ mt: `${SPACE.xs}px`, fontSize: 15 }}>
        Judge call failed: {record.error} — this measurement is degraded, not a
        finding.
      </NoteBlock>
    );
  }
  return (
    <Prose
      sx={{
        color: tokens.ink,
        mt: `${SPACE.xs}px`,
        whiteSpace: "pre-wrap",
        borderLeft: `1px solid ${tokens.hairStrong}`,
        pl: `${SPACE.sm}px`,
      }}
    >
      {renderEmphasis(record.reasoning ?? "")}
    </Prose>
  );
}

function WorstTraces({ rows, judged }: { rows: WorstRow[]; judged: boolean }) {
  return (
    <Box component="section" aria-label="Lowest scores">
      <SectionHeading meta={rows.length > 0 ? `${rows.length} shown` : undefined}>
        {judged ? "Lowest scores, with the judge's reasoning" : "Lowest scores"}
      </SectionHeading>

      {rows.length === 0 ? (
        <Prose sx={{ color: tokens.ink2 }}>
          No scored measurements in this window.
        </Prose>
      ) : (
        <Box sx={{ display: "grid", gap: `${SPACE.lg}px` }}>
          {rows.map((row) => (
            <Box key={`${row.trace_id}-${row.evaluated_at}`} data-testid={`worst-row-${row.trace_id}`}>
              {/* The row's identity is measured — score, id, timestamp — so
                * it sits on tint. What the judge *said* about it is written,
                * and sits on paper underneath. */}
              <DataPanel
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: `${SPACE.sm}px`,
                  flexWrap: "wrap",
                  px: `${SPACE.sm}px`,
                  py: "7px",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    ...DATA,
                    fontSize: 16,
                    fontWeight: 500,
                    color: row.passed ? tokens.ink : tokens.status.fail,
                  }}
                >
                  {row.score === null ? "—" : row.score.toFixed(3)}
                </Box>
                <Box
                  component={RouterLink}
                  to={`/traces/${row.trace_id}`}
                  data-testid={`worst-link-${row.trace_id}`}
                  sx={{
                    ...DATA,
                    color: tokens.link,
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {row.trace_id.slice(0, 12)}… →
                </Box>
                <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
                  {row.evaluated_at
                    ? new Date(row.evaluated_at).toLocaleString()
                    : "no timestamp"}
                </Box>
                {row.explanation && (
                  <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
                    {row.explanation}
                  </Box>
                )}
              </DataPanel>

              {row.reasoning.map((record, i) => (
                <Reasoning key={`${record.span_id}-${i}`} record={record} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
