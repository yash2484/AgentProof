import type { TypographyVariantsOptions } from "@mui/material/styles";

/** 11 / 12 / 13 / 15 / 18 / 24 / 32. One family, hierarchy by weight and size. */
export const FONT_FAMILY = [
  "Inter",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "sans-serif",
].join(", ");

/** Applied to every numeric surface so digits stop reflowing between renders. */
export const TABULAR_NUMS = { fontVariantNumeric: "tabular-nums" } as const;

export const typography: TypographyVariantsOptions = {
  fontFamily: FONT_FAMILY,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 600,
  h4: { fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 },
  h5: { fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.2 },
  h6: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 },
  subtitle1: { fontSize: 15, fontWeight: 500, lineHeight: 1.4 },
  subtitle2: { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
  body1: { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
  body2: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 11, fontWeight: 400, lineHeight: 1.4, letterSpacing: "0.01em" },
  button: { fontSize: 13, fontWeight: 500, textTransform: "none" },
};
