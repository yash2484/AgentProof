import { MenuItem, Stack, TextField } from "@mui/material";

export interface TraceFilters {
  project?: string;
  status?: string;
  start_after?: string;
  start_before?: string;
}

const STATUSES = ["", "ok", "error", "running"];

export function ProjectStatusFilters({
  value,
  onChange,
}: {
  value: TraceFilters;
  onChange: (next: TraceFilters) => void;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <TextField
        label="Project"
        size="small"
        value={value.project ?? ""}
        onChange={(e) => onChange({ ...value, project: e.target.value || undefined })}
      />
      <TextField
        label="Status"
        size="small"
        select
        sx={{ minWidth: 140 }}
        value={value.status ?? ""}
        onChange={(e) => onChange({ ...value, status: e.target.value || undefined })}
      >
        {STATUSES.map((s) => (
          <MenuItem key={s} value={s}>{s === "" ? "All" : s}</MenuItem>
        ))}
      </TextField>
      <TextField
        label="Start after"
        size="small"
        type="date"
        InputLabelProps={{ shrink: true }}
        value={value.start_after ?? ""}
        onChange={(e) => onChange({ ...value, start_after: e.target.value || undefined })}
      />
      <TextField
        label="Start before"
        size="small"
        type="date"
        InputLabelProps={{ shrink: true }}
        value={value.start_before ?? ""}
        onChange={(e) => onChange({ ...value, start_before: e.target.value || undefined })}
      />
    </Stack>
  );
}
