import type { TypographyVariantsOptions } from "@mui/material/styles";

/**
 * Ledger's three faces, one rule each.
 *
 * Prose is serif on paper. Data is mono on a tinted panel. UI chrome — the
 * things you click rather than read — is sans, and stays out of the way of
 * both.
 *
 * The faces are loaded by `fonts.css`. Each stack names its variable family
 * first and falls back to the platform's own face in the same class, so a
 * font that fails to load degrades to the right shape rather than to Times.
 */
/**
 * Family names are quoted, and that is load-bearing rather than tidy.
 *
 * An unquoted CSS font family is a sequence of identifiers, and an
 * identifier may not begin with a digit — so `Source Serif 4 Variable`
 * parses as invalid and the browser drops the *entire* declaration. The
 * symptom is a heading that renders at the right size, weight and tracking
 * in the wrong face, with no console warning anywhere. Quote them.
 */
export const FONT_SERIF = [
  '"Source Serif 4 Variable"',
  "Literata",
  "Georgia",
  "Cambria",
  "serif",
].join(", ");

export const FONT_SANS = [
  '"Inter Variable"',
  "system-ui",
  "-apple-system",
  '"Segoe UI"',
  "Roboto",
  "sans-serif",
].join(", ");

export const FONT_MONO = [
  '"JetBrains Mono Variable"',
  "ui-monospace",
  "SFMono-Regular",
  "Consolas",
  "monospace",
].join(", ");

/** @deprecated the theme has three families now; name the one you mean. */
export const FONT_FAMILY = FONT_SANS;

/** Applied to every numeric surface so digits stop reflowing between renders. */
export const TABULAR_NUMS = { fontVariantNumeric: "tabular-nums" } as const;

/**
 * The scale: fixed rem-equivalent steps at a ~1.2 ratio, not fluid.
 *
 * Product UI is read at a consistent DPI, and a heading that shrinks inside
 * a panel looks worse than one that does not. `clamp()` earns its place on
 * a marketing page; here it only makes the type unpredictable.
 */
export const SIZE = {
  lede: 22,
  h3: 15.5,
  prose: 16,
  ui: 14,
  data: 12.5,
  micro: 11,
} as const;

/**
 * The reading measure. Prose caps here; data tables may run full width.
 *
 * The metric detail page carries ~19,900 characters of body text, which is
 * the reason the serif register exists at all — and the reason it needs a
 * measure rather than the full width of a 1440px viewport.
 */
export const PROSE_MEASURE = "62ch";

/** The verdict sentence. The one piece of type on a page that is allowed to be big. */
export const LEDE = {
  fontFamily: FONT_SERIF,
  fontSize: SIZE.lede,
  fontWeight: 400,
  lineHeight: 1.4,
  letterSpacing: "-0.01em",
  color: "inherit",
} as const;

/** Section heading. Serif, because the uppercase tracked eyebrow is gone. */
export const H3 = {
  fontFamily: FONT_SERIF,
  fontSize: SIZE.h3,
  fontWeight: 600,
  lineHeight: 1.3,
} as const;

/** Body prose: judge reasoning, explanations, verdict copy. */
export const PROSE = {
  fontFamily: FONT_SERIF,
  fontSize: SIZE.prose,
  fontWeight: 400,
  lineHeight: 1.62,
  maxWidth: PROSE_MEASURE,
  textWrap: "pretty",
} as const;

/** Controls, labels, navigation, chips, buttons. */
export const UI = {
  fontFamily: FONT_SANS,
  fontSize: SIZE.ui,
  fontWeight: 400,
  lineHeight: 1.45,
} as const;

/** Every measured number, table cell, axis tick, id and waterfall label. */
export const DATA = {
  fontFamily: FONT_MONO,
  fontSize: SIZE.data,
  fontWeight: 400,
  lineHeight: 1.45,
  ...TABULAR_NUMS,
} as const;

/**
 * Column heads and units.
 *
 * Uppercase tracking survives here and nowhere else. On a table head it is
 * a real typographic convention that separates the head row from the data;
 * on a section heading it was the eyebrow tell, and that is why section
 * headings moved to serif.
 */
export const MICRO = {
  fontFamily: FONT_MONO,
  fontSize: SIZE.micro,
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  ...TABULAR_NUMS,
} as const;

/**
 * MUI variants, re-pointed at the Ledger scale.
 *
 * Headings are serif because they are read; everything else defaults to
 * sans because it is operated. Components that carry measured numbers opt
 * into `DATA` explicitly rather than inheriting it, so a mono number is
 * always a deliberate statement that something was measured.
 */
export const typography: TypographyVariantsOptions = {
  fontFamily: FONT_SANS,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 600,
  h4: { fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 },
  h5: { fontFamily: FONT_SERIF, fontSize: 17.5, fontWeight: 600, letterSpacing: "-0.005em", lineHeight: 1.3 },
  h6: { fontFamily: FONT_SERIF, fontSize: SIZE.h3, fontWeight: 600, lineHeight: 1.3 },
  subtitle1: { fontSize: 15, fontWeight: 500, lineHeight: 1.4 },
  subtitle2: { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
  body1: { fontSize: SIZE.ui, fontWeight: 400, lineHeight: 1.45 },
  body2: { fontSize: 13, fontWeight: 400, lineHeight: 1.45 },
  caption: { fontSize: SIZE.micro, fontWeight: 400, lineHeight: 1.4, letterSpacing: "0.01em" },
  button: { fontSize: 13, fontWeight: 500, textTransform: "none" },
};
