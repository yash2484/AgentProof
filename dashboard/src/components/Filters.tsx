import { MenuItem, Stack, TextField } from "@mui/material";
import { SPACE } from "../theme";

export interface TraceFilters {
  status?: string;
  start_after?: string;
  start_before?: string;
}

const STATUSES = ["", "ok", "error", "running"];

export function TraceListFilters({
  value,
  onChange,
}: {
  value: TraceFilters;
  onChange: (next: TraceFilters) => void;
}) {
  return (
    // Wraps: three fixed-width fields side by side measure 452px, which
    // pushed a 390px viewport into horizontal scroll.
    <Stack direction="row" sx={{ gap: `${SPACE.xs}px`, mb: 2, flexWrap: "wrap" }}>
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
