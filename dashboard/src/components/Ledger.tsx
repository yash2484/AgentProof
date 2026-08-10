import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { tokens, SPACE, RADIUS, H3, PROSE, MICRO, DATA, UI, FONT_MONO } from "../theme";

/**
 * Ledger's structural vocabulary.
 *
 * The governing rule is that prose is serif on paper and data is mono on a
 * tinted panel. These are the pieces that enforce it, so no page has to
 * re-decide where the boundary between "written" and "measured" falls.
 *
 * There are no cards here. A card is a floating rectangle that says nothing;
 * a `DataPanel` is a tinted surface that says "the figures inside this were
 * measured". That difference is the whole design.
 */

/**
 * A section heading.
 *
 * Serif, sentence case. The uppercase tracked eyebrow this replaces was on
 * every band of every page, which is what made the old surface read as
 * generated rather than designed. Uppercase survives in `ColumnHead` alone,
 * where it is a real table convention.
 */
export function SectionHeading({
  children,
  meta,
  sx,
}: {
  children: ReactNode;
  /** Optional right-aligned scope or count. Mono, because it is measured. */
  meta?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: `${SPACE.sm}px`,
        mb: `${SPACE.xs}px`,
        ...sx,
      }}
    >
      <Typography component="h2" sx={{ ...H3, color: tokens.ink }}>
        {children}
      </Typography>
      {meta !== undefined && meta !== null && (
        <Box component="span" sx={{ ...DATA, color: tokens.dim, whiteSpace: "nowrap" }}>
          {meta}
        </Box>
      )}
    </Box>
  );
}

/**
 * The tinted surface that means "measured".
 *
 * One step cooler than the page it sits on, hairline-bordered, 6px radius.
 * Not a card: no shadow, no gap-and-float, no nesting. If you find yourself
 * putting a DataPanel inside a DataPanel, the inner one wants to be rows.
 */
export function DataPanel({
  children,
  sx,
  ...rest
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
  [key: `data-${string}`]: unknown;
}) {
  return (
    <Box
      {...rest}
      sx={{
        backgroundColor: tokens.data,
        border: `1px solid ${tokens.hair}`,
        borderRadius: `${RADIUS}px`,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * A column head inside a data panel.
 *
 * The only place uppercase tracking is allowed, because on a table head it
 * separates the head row from the data rather than decorating a section.
 */
export function ColumnHead({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box component="span" sx={{ ...MICRO, color: tokens.dim, ...sx }}>
      {children}
    </Box>
  );
}

/**
 * One measured figure: the number in mono, its name in micro.
 *
 * `tone` is the only way a figure gets colour, and it always means a status.
 * A figure with no verdict attached stays ink — colour here is never used to
 * make a dashboard look livelier.
 */
export function Figure({
  label,
  value,
  note,
  tone = "neutral",
  size = 20,
  "data-testid": testId,
  valueTestId,
  noteTestId,
}: {
  label: ReactNode;
  value: ReactNode;
  /** One short clause of explanation. Serif, because it is written. */
  note?: ReactNode;
  tone?: "neutral" | "pass" | "watch" | "fail";
  size?: number;
  "data-testid"?: string;
  /** Named separately so a caller's existing test hooks survive the move. */
  valueTestId?: string;
  noteTestId?: string;
}) {
  const color = {
    neutral: tokens.ink,
    pass: tokens.status.pass,
    watch: tokens.status.watch,
    fail: tokens.status.fail,
  }[tone];

  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box
        data-testid={valueTestId}
        sx={{
          ...DATA,
          fontFamily: FONT_MONO,
          fontSize: size,
          lineHeight: 1.2,
          fontWeight: 500,
          color,
        }}
      >
        {value}
      </Box>
      {/* Sentence-case sans, not tracked uppercase. "Traces measured" is a
        * phrase, and uppercasing phrases is the eyebrow tell wearing a new
        * hat; MICRO's uppercase is reserved for actual column heads. */}
      <Box sx={{ ...UI, fontSize: 12.5, color: tokens.dim, mt: "5px" }}>{label}</Box>
      {note && (
        <Box
          data-testid={noteTestId}
          sx={{ ...PROSE, fontSize: 13.5, lineHeight: 1.45, color: tokens.ink2, mt: "4px" }}
        >
          {note}
        </Box>
      )}
    </Box>
  );
}

/**
 * A block of written prose, capped at the reading measure.
 *
 * Sits directly on paper with no container. The absence of a box is the
 * point: a container would make it look measured.
 */
export function Prose({
  children,
  sx,
  ...rest
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
  [key: `data-${string}`]: unknown;
}) {
  return (
    <Box {...rest} sx={{ ...PROSE, color: tokens.ink2, ...sx }}>
      {children}
    </Box>
  );
}

/**
 * A note the reader must not skip, marked by a status rule.
 *
 * The rule carries the status and the prose carries the argument, which is
 * why this is not an alert: an alert shouts a severity and says nothing.
 * Used for the provenance warning, where the whole point is that the reader
 * understands *why* the figures below are not evidence.
 */
export function NoteBlock({
  children,
  tone = "watch",
  sx,
  ...rest
}: {
  children: ReactNode;
  tone?: "watch" | "fail" | "neutral";
  sx?: SxProps<Theme>;
  [key: `data-${string}`]: unknown;
}) {
  const rule = {
    watch: tokens.status.watch,
    fail: tokens.status.fail,
    neutral: tokens.hairStrong,
  }[tone];

  return (
    <Box
      {...rest}
      sx={{
        borderLeft: `2px solid ${rule}`,
        pl: `${SPACE.sm}px`,
        py: "2px",
        ...PROSE,
        color: tokens.ink2,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The pill treatment for a ToggleButtonGroup.
 *
 * Filters read as pills rather than a select because the set is small and
 * the current choice should be legible without opening anything — a select
 * hides four options behind a click to save a few pixels the page has.
 *
 * The selected pill is marked by ink weight and a `card` ground, not by a
 * fill in `link`: selection is a state, not a status, and Ledger spends its
 * one interactive colour on things you can click rather than things you did.
 */
export const pillGroupSx = {
  gap: "4px",
  // ToggleButtonGroup is a nowrap flex row by default. Five outcome pills
  // measure 426px, which pushed a 390px viewport into horizontal scroll —
  // the exact regression this page has shipped once already.
  flexWrap: "wrap",
  "& .MuiToggleButton-root": {
    ...MICRO,
    // MICRO uppercases, which is right for a column head and wrong here:
    // "30d" is a written duration, and "30D" reads as a different unit.
    textTransform: "none",
    letterSpacing: "0.04em",
    color: tokens.dim,
    border: `1px solid ${tokens.hair}`,
    borderRadius: "3px !important",
    backgroundColor: tokens.card,
    px: 1,
    py: "3px",
    "&:hover": { backgroundColor: tokens.data, color: tokens.ink },
  },
  "& .MuiToggleButton-root.Mui-selected": {
    color: tokens.ink,
    borderColor: tokens.hairStrong,
    backgroundColor: tokens.data,
    fontWeight: 600,
    "&:hover": { backgroundColor: tokens.data },
  },
} as const;

/**
 * A row of figures inside one panel, separated by rules rather than gaps.
 *
 * Wrapping to a second line keeps the rules horizontal-only, so a wrapped
 * row never leaves a rule dangling against nothing.
 */
export function FigureRow({
  children,
  sx,
  ...rest
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
  [key: `data-${string}`]: unknown;
}) {
  return (
    <DataPanel
      {...rest}
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        "& > *": { p: `${SPACE.sm}px`, borderRight: `1px solid ${tokens.hair}` },
        // Vertical rules only. A horizontal rule under the last row would
        // sit a hairline above the panel's own border and read as a mistake,
        // and the cells are separated by column, not by row.
        "& > *:last-child": { borderRight: "none" },
        ...sx,
      }}
    >
      {children}
    </DataPanel>
  );
}
