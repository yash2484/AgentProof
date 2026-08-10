import { Box, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { tokens, SPACE, DATA } from "../theme";
import { isSyntheticProject } from "../lib/analytics";
import { SyntheticBadge } from "./SeverityChip";
import { pillGroupSx } from "./Ledger";

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
 * The top line of every page: title, scope, and the window it all applies to.
 *
 * Scope is visible before any value it scopes. Every alarming statement in
 * this product carries a denominator and a time window, and this is where
 * the time window lives — a figure whose scope has scrolled out of view is a
 * figure that can be misread, which is why the bar sticks.
 *
 * The title is serif and the scope is mono, on one line over a `hairStrong`
 * rule. That single line is the whole register in miniature: the name of the
 * thing is written, and everything qualifying it was measured.
 *
 * The spec's ⌘K affordance is deliberately absent. No command palette exists
 * in this app, and an affordance advertising a shortcut that does nothing is
 * worse than no affordance at all.
 */
export function ScopeBar({
  title,
  project,
  days,
  onDaysChange,
  runs: runList,
  children,
}: {
  /** The page name. The one piece of serif on this line. */
  title: string;
  project: string | null | undefined;
  /** Omitted by pages that are not scoped to a time window. */
  days?: number;
  onDaysChange?: (days: number) => void;
  /**
   * The runs in scope. Taken as a plain list rather than a whole analytics
   * payload so every page can supply it — the Security page has its own
   * shape, and passing `undefined` made the bar report "0 runs · never
   * evaluated" above a page showing nine runs of data.
   */
  runs?: ScopeRun[] | undefined;
  /** Page-specific controls that belong on the scope line. */
  children?: React.ReactNode;
}) {
  const runList_ = runList ?? [];
  const runs = runList_.length;
  const showWindow = days !== undefined && onDaysChange !== undefined;

  return (
    <Box
      data-testid="scope-bar"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: `${SPACE.sm}px`,
        rowGap: "6px",
        pt: "2px",
        pb: `${SPACE.xs}px`,
        mb: `${SPACE.lg}px`,
        bgcolor: tokens.paper,
        borderBottom: `1px solid ${tokens.hairStrong}`,
      }}
    >
      <Typography variant="h4" component="h1" sx={{ color: tokens.ink, mr: "2px" }}>
        {title}
      </Typography>

      <Box component="span" sx={{ ...DATA, color: tokens.dim }}>
        {project ?? "all projects"}
      </Box>
      {isSyntheticProject(project) && <SyntheticBadge />}

      {/* Pushes the controls to the trailing edge on a wide viewport and
          collapses to nothing once the line wraps. */}
      <Box sx={{ flex: "1 1 auto", minWidth: 0 }} />

      {children}

      {showWindow && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_e, value) => value !== null && onDaysChange(value)}
          aria-label="time range"
          sx={pillGroupSx}
        >
          {WINDOWS.map((w) => (
            <ToggleButton key={w.days} value={w.days} aria-label={w.label}>
              {w.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {/* Only when runs were actually supplied. Rendering the meta from an
        * omitted prop printed "0 runs · never evaluated" above a page
        * showing 300 traces — a page claiming nothing had been measured
        * because it was never told, which is the exact failure mode this
        * product exists to remove. Absent is not zero. */}
      {runList !== undefined && (
        <Box
          component="span"
          data-testid="scope-runs"
          sx={{ ...DATA, color: tokens.dim, whiteSpace: "nowrap" }}
        >
          {runs} {runs === 1 ? "run" : "runs"} · {lastEvaluated(runList_)}
        </Box>
      )}
    </Box>
  );
}
