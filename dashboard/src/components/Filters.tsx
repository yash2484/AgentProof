import { MenuItem, Stack, TextField } from "@mui/material";
import { tokens, SPACE, DATA, RADIUS } from "../theme";

export interface TraceFilters {
  status?: string;
  start_after?: string;
  start_before?: string;
}

const STATUSES = ["", "ok", "error", "running"];

/**
 * The secondary trace filters.
 *
 * Quieter than the outcome pills on purpose: outcome is what a reader came
 * for, and status and date bound the search afterwards. Mono, because every
 * value here is a field on the record rather than a phrase.
 */
export function TraceListFilters({
  value,
  onChange,
}: {
  value: TraceFilters;
  onChange: (next: TraceFilters) => void;
}) {
  const fieldSx = {
    "& .MuiInputBase-root": {
      ...DATA,
      backgroundColor: tokens.card,
      borderRadius: `${RADIUS}px`,
    },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: tokens.hair },
    "& .MuiInputLabel-root": { fontSize: 12.5, color: tokens.dim },
    "& .MuiInputBase-input": { py: "6px" },
  };

  return (
    // Wraps: three fixed-width fields side by side measure 452px, which
    // pushed a 390px viewport into horizontal scroll.
    <Stack direction="row" sx={{ gap: `${SPACE.xs}px`, flexWrap: "wrap" }}>
      <TextField
        label="Status"
        size="small"
        select
        sx={{ ...fieldSx, minWidth: 118 }}
        value={value.status ?? ""}
        onChange={(e) => onChange({ ...value, status: e.target.value || undefined })}
      >
        {STATUSES.map((s) => (
          <MenuItem key={s} value={s} sx={{ ...DATA }}>
            {s === "" ? "any" : s}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Start after"
        size="small"
        type="date"
        sx={fieldSx}
        InputLabelProps={{ shrink: true }}
        value={value.start_after ?? ""}
        onChange={(e) => onChange({ ...value, start_after: e.target.value || undefined })}
      />
      <TextField
        label="Start before"
        size="small"
        type="date"
        sx={fieldSx}
        InputLabelProps={{ shrink: true }}
        value={value.start_before ?? ""}
        onChange={(e) => onChange({ ...value, start_before: e.target.value || undefined })}
      />
    </Stack>
  );
}
