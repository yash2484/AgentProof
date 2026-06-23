import { useState } from "react";
import { Box, Button, Snackbar, Alert, Typography } from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { useTraces, useDeleteTrace } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { ProjectStatusFilters, TraceFilters } from "../components/Filters";
import { formatCost, formatDuration, formatTokens } from "../lib/format";
import type { Trace } from "../types";

export function TracesPage() {
  const [filters, setFilters] = useState<TraceFilters>({});
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 50 });
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useTraces({
    ...filters,
    limit: pagination.pageSize,
    offset: pagination.page * pagination.pageSize,
  });
  const del = useDeleteTrace();

  const onFilterChange = (next: TraceFilters) => {
    setFilters(next);
    setPagination((p) => ({ ...p, page: 0 }));
  };

  const columns: GridColDef<Trace>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
    { field: "project", headerName: "Project", width: 120 },
    { field: "status", headerName: "Status", width: 100 },
    {
      field: "total_latency_ms", headerName: "Latency", width: 110,
      valueFormatter: (value) => formatDuration(value as number | null),
    },
    {
      field: "total_tokens", headerName: "Tokens", width: 110,
      valueFormatter: (value) => formatTokens(value as number | null),
    },
    {
      field: "total_cost_usd", headerName: "Cost", width: 110,
      valueFormatter: (value) => formatCost(value as number | null),
    },
    {
      field: "actions", headerName: "", width: 90, sortable: false, filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          color="error"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete trace "${params.row.name}"? This cannot be undone.`)) {
              del.mutate(params.row.trace_id);
            }
          }}
        >
          Delete
        </Button>
      ),
    },
  ];

  const traces = data?.traces ?? [];

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Traces</Typography>
      <ProjectStatusFilters value={filters} onChange={onFilterChange} />
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && traces.length === 0}
        emptyMessage="No traces yet — run scripts/seed_dashboard.py to load demo data."
        onRetry={refetch}
      >
        <div style={{ height: 600, width: "100%" }}>
          <DataGrid
            rows={traces}
            columns={columns}
            getRowId={(row) => row.trace_id}
            onRowClick={(params) => navigate(`/traces/${params.row.trace_id}`)}
            disableRowSelectionOnClick
            paginationMode="server"
            rowCount={data?.total ?? 0}
            paginationModel={pagination}
            onPaginationModelChange={setPagination}
            pageSizeOptions={[25, 50, 100]}
          />
        </div>
      </QueryBoundary>
      <Snackbar open={del.isError} autoHideDuration={6000} onClose={() => del.reset()}>
        <Alert severity="error" onClose={() => del.reset()}>
          Failed to delete trace.
        </Alert>
      </Snackbar>
    </Box>
  );
}
