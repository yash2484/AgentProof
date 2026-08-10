import { useState } from "react";
import {
  Alert,
  Box,
  MenuItem,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useSearchParams } from "react-router-dom";
import { useTraces, useDeleteTrace } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { TraceListFilters, TraceFilters } from "../components/Filters";
import { TraceDetailStrip } from "../components/TraceDetailStrip";
import { useProject } from "../context/ProjectContext";
import { formatCost, formatDuration, formatTokens } from "../lib/format";
import {
  OUTCOME_FILTERS,
  outcomeColor,
  outcomeLabel,
  worstMetricLabel,
} from "../lib/outcome";
import { tokens, SPACE, ROW_HEIGHT } from "../theme";
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
 * The eval harness's own list.
 *
 * The grid used to show name, status, latency, tokens and cost — everything
 * except the thing this product measures. Two columns change that: what a
 * trace's measurements did, and which metric scored lowest on it. Selecting a
 * row opens the measurements beside the list rather than navigating away, and
 * deletion has moved out of the row, where it sat one mis-click from
 * destroying a recording.
 */
export function TracesPage() {
  const [filters, setFilters] = useState<TraceFilters>({});
  const [pagination, setPagination] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [params, setParams] = useSearchParams();
  const { project } = useProject();

  // Selection and outcome filter live in the URL: the panel is a view of the
  // list, so it has to survive a reload and a back button.
  const selectedId = params.get("trace");
  const outcome = params.get("outcome") ?? "";

  const { data, isLoading, isError, refetch } = useTraces({
    ...filters,
    project,
    ...(outcome ? { eval_outcome: outcome } : {}),
    limit: pagination.pageSize,
    offset: pagination.page * pagination.pageSize,
  });
  const del = useDeleteTrace();

  const traces = data?.traces ?? [];
  const selected = traces.find((t) => t.trace_id === selectedId);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const onFilterChange = (next: TraceFilters) => {
    setFilters(next);
    setPagination((p) => ({ ...p, page: 0 }));
  };

  const columns: GridColDef<Trace>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 150 },
    {
      field: "eval_outcome",
      headerName: "Measurements",
      width: 190,
      sortable: false,
      renderCell: (p) => {
        const o = p.row.eval_outcome ?? NOT_EVALUATED;
        return (
          <Typography
            variant="body2"
            data-testid={`outcome-${p.row.trace_id}`}
            sx={{ color: outcomeColor(o.outcome), ...({ fontVariantNumeric: "tabular-nums" }) }}
          >
            {outcomeLabel(o)}
          </Typography>
        );
      },
    },
    {
      field: "worst",
      headerName: "Worst metric",
      width: 180,
      sortable: false,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ color: tokens.muted }}>
          {worstMetricLabel(p.row.eval_outcome ?? NOT_EVALUATED)}
        </Typography>
      ),
    },
    { field: "status", headerName: "Status", width: 90 },
    {
      field: "total_latency_ms",
      headerName: "Latency",
      width: 100,
      align: "right",
      headerAlign: "right",
      valueFormatter: (value) => formatDuration(value as number | null),
    },
    {
      field: "total_tokens",
      headerName: "Tokens",
      width: 95,
      align: "right",
      headerAlign: "right",
      valueFormatter: (value) => formatTokens(value as number | null),
    },
    {
      field: "total_cost_usd",
      headerName: "Cost",
      width: 95,
      align: "right",
      headerAlign: "right",
      valueFormatter: (value) => formatCost(value as number | null),
    },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ color: tokens.ink, mb: `${SPACE.sm}px` }}>
        Traces
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <TraceListFilters value={filters} onChange={onFilterChange} />
        <TextField
          select
          size="small"
          label="Outcome"
          value={outcome}
          onChange={(e) => {
            setParam("outcome", e.target.value);
            setPagination((p) => ({ ...p, page: 0 }));
          }}
          sx={{ minWidth: 190, mb: 2 }}
          // The visible label is the accessible name. An `inputProps`
          // aria-label lands on MUI's hidden input instead of the combobox
          // the user actually operates, leaving the control unreachable by
          // name — which a keyboard or screen-reader user hits first.
          SelectProps={{ labelId: "trace-outcome-filter-label" }}
          id="trace-outcome-filter"
        >
          {OUTCOME_FILTERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && traces.length === 0}
        emptyMessage="No traces match this filter — widen the range or clear the outcome filter."
        onRetry={refetch}
      >
        <Box
          sx={{
            display: "grid",
            gap: `${SPACE.md}px`,
            gridTemplateColumns: "1fr",
            alignItems: "start",
            "@media (min-width:1200px)": { gridTemplateColumns: "minmax(0, 1fr) 380px" },
          }}
        >
          <Box sx={{ height: 640, minWidth: 0 }}>
            <DataGrid
              rows={traces}
              columns={columns}
              getRowId={(row) => row.trace_id}
              onRowClick={(p) => setParam("trace", String(p.row.trace_id))}
              disableRowSelectionOnClick
              paginationMode="server"
              rowCount={data?.total ?? 0}
              paginationModel={pagination}
              onPaginationModelChange={setPagination}
              pageSizeOptions={[25, 50, 100]}
              rowHeight={ROW_HEIGHT}
              columnHeaderHeight={ROW_HEIGHT}
              sx={{ "& .MuiDataGrid-row": { cursor: "pointer" } }}
            />
          </Box>

          <Box sx={{ "@media (min-width:1200px)": { position: "sticky", top: 16 } }}>
            <TraceDetailStrip
              trace={selected}
              onClose={() => setParam("trace", "")}
              deleting={del.isPending}
              onDelete={(id) =>
                del.mutate(id, { onSuccess: () => setParam("trace", "") })
              }
            />
          </Box>
        </Box>
      </QueryBoundary>

      <Snackbar open={del.isError} autoHideDuration={6000} onClose={() => del.reset()}>
        <Alert severity="error" onClose={() => del.reset()}>
          Failed to delete trace.
        </Alert>
      </Snackbar>
    </Box>
  );
}
