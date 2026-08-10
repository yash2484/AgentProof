import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useEvalResultsForTrace } from "../hooks/queries";
import { metricTitle } from "../lib/metricCopy";
import { outcomeColor } from "../lib/outcome";
import { tokens, SPACE, TILE_PADDING, TABULAR_NUMS } from "../theme";
import type { Trace } from "../types";

/**
 * The selected trace, beside the list rather than instead of it.
 *
 * MUI's free DataGrid has no detail-panel API, so "expand the row" is served
 * by a panel next to the grid: the reader sees a trace's measurements without
 * leaving the list, the back button still works, and nothing is trapped
 * behind a modal.
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
          bgcolor: tokens.surface,
          border: `1px dashed ${tokens.border}`,
          borderRadius: 2.5,
        }}
      >
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          Select a trace to see what was measured on it, without leaving the
          list.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      data-testid="trace-strip"
      sx={{
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
        display: "grid",
        gap: `${SPACE.sm}px`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="subtitle1" sx={{ color: tokens.ink, flex: 1 }} noWrap>
          {trace.name}
        </Typography>
        <Button size="small" onClick={onClose} sx={{ color: tokens.muted }}>
          Close
        </Button>
      </Box>

      <Typography variant="caption" sx={{ color: tokens.muted, ...TABULAR_NUMS }}>
        {trace.trace_id}
      </Typography>

      <EvalRows traceId={trace.trace_id} />

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
        <Box
          component={RouterLink}
          to={`/traces/${trace.trace_id}`}
          sx={{ color: tokens.brand.text, textDecoration: "none", fontSize: 14 }}
        >
          Open the full trace →
        </Box>
      </Box>

      <DeleteTrace trace={trace} onDelete={onDelete} deleting={deleting} />
    </Box>
  );
}

function EvalRows({ traceId }: { traceId: string }) {
  const { data, isLoading } = useEvalResultsForTrace(traceId);
  const rows = data?.results ?? [];

  if (isLoading) {
    return (
      <Typography variant="body2" sx={{ color: tokens.muted }}>
        Loading measurements…
      </Typography>
    );
  }
  if (rows.length === 0) {
    return (
      <Typography data-testid="strip-no-evals" variant="body2" sx={{ color: tokens.muted }}>
        Nothing has been measured on this trace. That is not a pass — it is the
        absence of a measurement.
      </Typography>
    );
  }

  return (
    <Box data-testid="strip-evals" sx={{ display: "grid", gap: 0.75 }}>
      {rows.map((r) => (
        <Box
          key={`${r.metric_name}-${r.span_id ?? "trace"}-${r.evaluated_at}`}
          data-testid={`strip-eval-${r.metric_name}`}
          sx={{ borderTop: `1px solid ${tokens.border}`, pt: 0.75 }}
        >
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.ink, flex: 1 }}>
              {metricTitle(r.metric_name)}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: outcomeColor(r.passed === false ? "failed" : "passed"),
                ...TABULAR_NUMS,
              }}
            >
              {r.score === null ? "—" : r.score.toFixed(3)}
            </Typography>
          </Box>
          {r.explanation && (
            <Typography variant="caption" sx={{ color: tokens.muted, display: "block" }}>
              {r.explanation}
            </Typography>
          )}
        </Box>
      ))}
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
        sx={{ color: tokens.status.fail.text, justifySelf: "start", px: 0 }}
      >
        Delete this trace
      </Button>
    );
  }

  return (
    <Box data-testid="delete-confirm" sx={{ display: "grid", gap: 1, mt: 1 }}>
      <Typography variant="body2" sx={{ color: tokens.ink }}>
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
          sx={{ color: tokens.muted }}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
