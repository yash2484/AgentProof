import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useEvalResultsForTrace, useTraceTree } from "../hooks/queries";
import { metricTitle } from "../lib/metricCopy";
import { outcomeColor, traceSentence } from "../lib/outcome";
import { MiniWaterfall } from "./MiniWaterfall";
import { ColumnHead, Prose } from "./Ledger";
import { tokens, SPACE, TILE_PADDING, DATA, UI, RADIUS } from "../theme";
import type { EvalOutcome, Trace } from "../types";

const NOT_EVALUATED: EvalOutcome = {
  total: 0,
  passed: 0,
  failed: 0,
  degraded: 0,
  worst_metric: null,
  worst_score: null,
  outcome: "not_evaluated",
};

/**
 * The selected trace, beside the list rather than instead of it.
 *
 * MUI's free DataGrid has no detail-panel API, so "expand the row" is served
 * by a panel next to the grid: the reader sees a trace's measurements without
 * leaving the list, the back button still works, and nothing is trapped
 * behind a modal.
 *
 * The panel is a `card` surface — the one raised ground in Ledger — because
 * it is a thing pulled out of the list rather than another region of it.
 * Everything in it is mono except one serif sentence, which is what the
 * document frame buys: a column of figures tells a fluent reader what
 * happened and tells everyone else nothing.
 */
export function TraceDetailStrip({
  trace,
  onClose,
  onDelete,
  deleting,
}: {
  trace: Trace | undefined;
  onClose: () => void;
  onDelete: (traceId: string) => void;
  deleting: boolean;
}) {
  if (!trace) {
    return (
      <Box
        data-testid="trace-strip-empty"
        sx={{
          p: `${TILE_PADDING}px`,
          border: `1px dashed ${tokens.hairStrong}`,
          borderRadius: `${RADIUS}px`,
        }}
      >
        <Prose sx={{ fontSize: 15, color: tokens.ink2 }}>
          Select a trace to see what was measured on it, without leaving the
          list.
        </Prose>
      </Box>
    );
  }

  return (
    <Box
      data-testid="trace-strip"
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.card,
        border: `1px solid ${tokens.hairStrong}`,
        borderRadius: `${RADIUS}px`,
        display: "grid",
        gap: `${SPACE.sm}px`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Box
          component="span"
          sx={{ ...DATA, fontSize: 13, fontWeight: 500, color: tokens.ink, flex: 1, minWidth: 0 }}
        >
          {trace.name}
        </Box>
        <Button size="small" onClick={onClose} sx={{ ...UI, fontSize: 12, color: tokens.dim, minWidth: 0 }}>
          Close
        </Button>
      </Box>

      <Box component="span" sx={{ ...DATA, fontSize: 11, color: tokens.dim, wordBreak: "break-all" }}>
        {trace.trace_id}
      </Box>

      {/* The sentence, before the figures that support it. */}
      <Prose data-testid="trace-sentence" sx={{ fontSize: 15, color: tokens.ink }}>
        {traceSentence(trace.eval_outcome ?? NOT_EVALUATED)}
      </Prose>

      <TraceShape traceId={trace.trace_id} />

      <EvalRows traceId={trace.trace_id} />

      <Box
        component={RouterLink}
        to={`/traces/${trace.trace_id}`}
        sx={{
          ...UI,
          fontSize: 13,
          color: tokens.link,
          textDecoration: "none",
          justifySelf: "start",
          "&:hover": { textDecoration: "underline" },
        }}
      >
        Open the full trace →
      </Box>

      <DeleteTrace trace={trace} onDelete={onDelete} deleting={deleting} />
    </Box>
  );
}

/**
 * What the agent actually did, as a single track.
 *
 * Revives MiniWaterfall, which was built for an Overview tile that has since
 * been deleted and has sat tested-but-unrendered ever since. Where the spans
 * went is the first question a reader asks after "did it pass", and this is
 * the cheapest possible answer to it.
 */
function TraceShape({ traceId }: { traceId: string }) {
  const { data, isLoading } = useTraceTree(traceId);
  if (isLoading || !data || data.length === 0) return null;
  return (
    <Box data-testid="strip-waterfall">
      <ColumnHead sx={{ display: "block", mb: "5px" }}>Spans</ColumnHead>
      <MiniWaterfall roots={data} />
    </Box>
  );
}

function EvalRows({ traceId }: { traceId: string }) {
  const { data, isLoading } = useEvalResultsForTrace(traceId);
  const rows = data?.results ?? [];

  if (isLoading) {
    return (
      <Box sx={{ ...DATA, color: tokens.dim }}>Loading measurements…</Box>
    );
  }
  if (rows.length === 0) {
    return (
      <Prose data-testid="strip-no-evals" sx={{ fontSize: 14.5, color: tokens.ink2 }}>
        Nothing has been measured on this trace. That is not a pass — it is the
        absence of a measurement.
      </Prose>
    );
  }

  return (
    <Box data-testid="strip-evals">
      <ColumnHead sx={{ display: "block", mb: "5px" }}>Measurements</ColumnHead>
      <Box
        sx={{
          bgcolor: tokens.data,
          border: `1px solid ${tokens.hair}`,
          borderRadius: `${RADIUS}px`,
        }}
      >
        {rows.map((r, i) => (
          <Box
            key={`${r.metric_name}-${r.span_id ?? "trace"}-${r.evaluated_at}`}
            data-testid={`strip-eval-${r.metric_name}`}
            sx={{
              px: `${SPACE.xs}px`,
              py: "5px",
              borderTop: i === 0 ? "none" : `1px solid ${tokens.hair}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Box component="span" sx={{ ...DATA, color: tokens.ink, flex: 1, minWidth: 0 }}>
                {metricTitle(r.metric_name)}
              </Box>
              <Box
                component="span"
                sx={{
                  ...DATA,
                  fontWeight: 500,
                  color: outcomeColor(r.passed === false ? "failed" : "passed"),
                }}
              >
                {r.score === null ? "—" : r.score.toFixed(3)}
              </Box>
            </Box>
            {r.explanation && (
              <Box component="span" sx={{ ...DATA, fontSize: 11, color: tokens.dim }}>
                {r.explanation}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Deletion, out of the grid and behind a typed confirmation.
 *
 * It used to be a button on every row guarded by `window.confirm`, one
 * mis-click from destroying a recording. Typing the word is the smallest
 * thing that makes the action deliberate rather than reflexive.
 */
export function DeleteTrace({
  trace,
  onDelete,
  deleting,
}: {
  trace: Trace;
  onDelete: (traceId: string) => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toLowerCase() === "delete";

  if (!open) {
    return (
      <Button
        size="small"
        data-testid="delete-start"
        onClick={() => setOpen(true)}
        sx={{ ...UI, fontSize: 13, color: tokens.status.fail, justifySelf: "start", px: 0 }}
      >
        Delete this trace
      </Button>
    );
  }

  return (
    <Box data-testid="delete-confirm" sx={{ display: "grid", gap: 1, mt: 1 }}>
      <Typography sx={{ ...UI, fontSize: 13, color: tokens.ink }}>
        Deleting <strong>{trace.name}</strong> removes the trace and every
        measurement taken on it. There is no undo.
      </Typography>
      <TextField
        size="small"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        label='Type "delete" to confirm'
        inputProps={{ "aria-label": 'Type "delete" to confirm' }}
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          size="small"
          color="error"
          variant="contained"
          data-testid="delete-commit"
          disabled={!armed || deleting}
          onClick={() => onDelete(trace.trace_id)}
        >
          {deleting ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button
          size="small"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          sx={{ ...UI, fontSize: 13, color: tokens.dim }}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
