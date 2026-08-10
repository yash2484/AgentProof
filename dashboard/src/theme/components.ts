import type { Components, Theme } from "@mui/material/styles";
import { tokens } from "./palette";
import { DATA, FONT_MONO, MICRO, TABULAR_NUMS } from "./typography";

/** 8px rhythm: 8 / 12 / 16 / 24 / 32. Section gap is `lg`. */
export const SPACE = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export const TILE_GAP = 12;
/** Panel padding. Density comes from the data surfaces, not from squeezing prose. */
export const TILE_PADDING = 12;
export const ROW_HEIGHT = 32;
/** Ledger's one radius. A data panel is a panel, not a floating card. */
export const RADIUS = 6;

/**
 * The data panel: the tinted surface that means "this was measured".
 *
 * Spread onto any container holding figures. It is a `sx` fragment rather
 * than a component so it composes with a Box, a Table wrapper or a chart
 * frame without three near-identical wrappers existing.
 */
export const DATA_PANEL = {
  backgroundColor: tokens.data,
  border: `1px solid ${tokens.hair}`,
  borderRadius: `${RADIUS}px`,
} as const;

export const components: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: { backgroundColor: tokens.paper, color: tokens.ink },
      // Numerics never reflow, anywhere.
      "th, td, code, pre": TABULAR_NUMS,
      // Focus is the one place `link` is allowed to shout. Keyboard users
      // get a visible ring on every interactive element, not just the ones
      // a component author remembered.
      ":focus-visible": {
        outline: `2px solid ${tokens.link}`,
        outlineOffset: 2,
      },
      "::selection": { backgroundColor: "#D3E2EF", color: tokens.ink },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: "none", // MUI's default elevation overlay is a gradient.
        border: `1px solid ${tokens.hair}`,
        borderRadius: RADIUS,
      },
    },
  },
  MuiCard: {
    defaultProps: { variant: "outlined" },
    styleOverrides: { root: { backgroundColor: tokens.card } },
  },
  MuiCardContent: {
    styleOverrides: {
      root: { padding: TILE_PADDING, "&:last-child": { paddingBottom: TILE_PADDING } },
    },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: { root: { borderRadius: RADIUS } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: RADIUS, fontWeight: 500, ...TABULAR_NUMS } },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: tokens.ink,
        color: tokens.card,
        fontSize: 12,
        fontFamily: FONT_MONO,
        ...TABULAR_NUMS,
      },
      arrow: { color: tokens.ink },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: RADIUS,
        "&.Mui-selected": {
          backgroundColor: tokens.card,
          color: tokens.link,
          "&:hover": { backgroundColor: tokens.card },
        },
      },
    },
  },
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: `1px solid ${tokens.hair}`,
        borderRadius: RADIUS,
        // The grid is a mono data surface inside a document — the same move
        // a profiler makes. It does not try to be a document itself.
        backgroundColor: tokens.data,
        ...DATA,
      },
      columnHeaders: { borderBottom: `1px solid ${tokens.hairStrong}` },
      columnHeaderTitle: { ...MICRO, color: tokens.dim },
      cell: { borderBottom: `1px solid ${tokens.hair}`, color: tokens.ink },
      row: {
        "&:hover": { backgroundColor: tokens.card },
        "&.Mui-selected": {
          backgroundColor: tokens.card,
          "&:hover": { backgroundColor: tokens.card },
        },
      },
      footerContainer: { borderTop: `1px solid ${tokens.hairStrong}` },
    },
  },
} as Components<Theme>;
