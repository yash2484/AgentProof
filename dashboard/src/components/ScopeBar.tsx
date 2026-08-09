import { Box, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { tokens, SPACE, TABULAR_NUMS } from "../theme";
import { isSyntheticProject } from "../lib/analytics";
import { SyntheticBadge } from "./SeverityChip";

export const WINDOWS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 0, label: "All" },
] as const;

/** Just enough of a run for the bar: every page's payload has this much. */
export interface ScopeRun {
  run_at: string;
}

function lastEvaluated(runs: ScopeRun[]): string {
  if (runs.length === 0) return "never evaluated";
  const at = new Date(runs[runs.length - 1].run_at);
  return `last evaluated ${at.toLocaleString()}`;
}

/**
 * Sticky scope bar: project, window, last evaluation, run count.
 *
 * Scope is visible before any value it scopes. Every alarming statement on
 * this page carries a denominator and a time window, and this is where the
 * time window lives — a figure whose scope has scrolled out of view is a
 * figure that can be misread.
 */
export function ScopeBar({
  project,
  days,
  onDaysChange,
  runs: runList,
}: {
  project: string | null | undefined;
  days: number;
  onDaysChange: (days: number) => void;
  /**
   * The runs in scope. Taken as a plain list rather than a whole analytics
   * payload so every page can supply it — the Security page has its own
   * shape, and passing `undefined` made the bar report "0 runs · never
   * evaluated" above a page showing nine runs of data.
   */
  runs: ScopeRun[] | undefined;
}) {
  const runList_ = runList ?? [];
  const runs = runList_.length;
  return (
    <Box
      data-testid="scope-bar"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: `${SPACE.sm}px`,
        py: 1.5,
        mb: `${SPACE.md}px`,
        bgcolor: tokens.bg,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <Typography variant="subtitle1" sx={{ color: tokens.ink }}>
        {project ?? "All projects"}
      </Typography>
      {isSyntheticProject(project) && <SyntheticBadge />}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={days}
        onChange={(_e, value) => value !== null && onDaysChange(value)}
        aria-label="time range"
        sx={{
          "& .MuiToggleButton-root": {
            color: tokens.muted,
            borderColor: tokens.border,
            px: 1.25,
            py: 0.25,
            fontSize: 12,
          },
          "& .Mui-selected": { color: `${tokens.ink} !important` },
        }}
      >
        {WINDOWS.map((w) => (
          <ToggleButton key={w.days} value={w.days} aria-label={w.label}>
            {w.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Typography
        variant="body2"
        data-testid="scope-runs"
        sx={{ color: tokens.muted, ...TABULAR_NUMS }}
      >
        {runs} {runs === 1 ? "run" : "runs"} · {lastEvaluated(runList_)}
      </Typography>
    </Box>
  );
}
