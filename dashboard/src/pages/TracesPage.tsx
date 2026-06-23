import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { useTraces, useDeleteTrace } from "../hooks/queries";
import { QueryBoundary } from "../components/QueryBoundary";
import { ProjectStatusFilters, TraceFilters } from "../components/Filters";
import { formatCost, formatDuration, formatTokens } from "../lib/format";
import type { Trace } from "../types";

export function TracesPage() {
  const [filters, setFilters] = useState<TraceFilters>({});
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useTraces(filters);
  const del = useDeleteTrace();

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
            del.mutate(params.row.trace_id);
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
      <ProjectStatusFilters value={filters} onChange={setFilters} />
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
          />
        </div>
      </QueryBoundary>
    </Box>
  );
}
