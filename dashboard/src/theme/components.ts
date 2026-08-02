import type { Components, Theme } from "@mui/material/styles";
import { tokens } from "./palette";
import { TABULAR_NUMS } from "./typography";

/** 8px base, dense scale: 8 / 12 / 16 / 24 / 32. */
export const SPACE = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export const TILE_GAP = 12;
export const TILE_PADDING = 16;
export const ROW_HEIGHT = 36;
export const RADIUS = 10;

export const components: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: { backgroundColor: tokens.bg, color: tokens.ink },
      // Numerics never reflow, anywhere.
      "th, td, code, pre": TABULAR_NUMS,
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: "none", // MUI's default elevation overlay is a gradient.
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS,
      },
    },
  },
  MuiCard: {
    defaultProps: { variant: "outlined" },
    styleOverrides: { root: { backgroundColor: tokens.surface } },
  },
  MuiCardContent: {
    styleOverrides: { root: { padding: TILE_PADDING, "&:last-child": { paddingBottom: TILE_PADDING } } },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: { root: { borderRadius: 8 } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: 6, fontWeight: 500, ...TABULAR_NUMS } },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: tokens.surfaceRaised,
        border: `1px solid ${tokens.border}`,
        color: tokens.ink,
        fontSize: 12,
        ...TABULAR_NUMS,
      },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        "&.Mui-selected": {
          backgroundColor: tokens.surfaceRaised,
          color: tokens.brand.text,
          "&:hover": { backgroundColor: tokens.surfaceRaised },
        },
      },
    },
  },
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS,
        backgroundColor: tokens.surface,
        ...TABULAR_NUMS,
      },
      columnHeaders: { backgroundColor: tokens.bg, borderBottom: `1px solid ${tokens.border}` },
      cell: { borderBottom: `1px solid ${tokens.border}` },
      row: { "&:hover": { backgroundColor: tokens.surfaceRaised } },
    },
  },
} as Components<Theme>;
