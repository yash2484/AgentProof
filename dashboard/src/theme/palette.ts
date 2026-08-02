import type { PaletteOptions } from "@mui/material/styles";

/**
 * Graphite & Magenta.
 *
 * The brand hue (322°) sits outside the green (~145°), red (~28°) and amber
 * (~78°) bands on purpose: this is a pass/fail product, so a brand accent
 * drawn from a semantic band would make brand and status indistinguishable.
 *
 * `brand.solid` and `status.fail.solid` measure below the 4.5 body-text
 * floor but clear the 3.0 non-text floor. Use the `.text` variant for copy;
 * the `.solid` variant is for fills, bars, borders and focus rings only.
 *
 * The magenta is used flat. No gradients.
 */
export const tokens = {
  bg: "#141317",
  surface: "#1D1B22",
  /** One step above surface, for nested panels and hover states. */
  surfaceRaised: "#26232D",
  border: "#302D38",
  ink: "#F2F0F5",
  muted: "#918C9C",
  /** Label colour for text sitting on a saturated fill (bars, chips). */
  onFill: "#100F13",
  brand: {
    solid: "#D6409F",
    text: "#E255AC",
  },
  status: {
    pass: "#3FCF8E",
    fail: {
      solid: "#E5484D",
      text: "#EC5F63",
    },
    warn: "#E2A336",
  },
  /**
   * Span-type fills. Deliberately outside the semantic bands so a span's
   * type never reads as a pass/fail verdict. `human_decision` shares a hue
   * band with `retrieval` but at 7% saturation — grey, not violet.
   */
  spanTypes: {
    llm_call: "#D6409F",
    tool_use: "#4C9AFF",
    retrieval: "#9B8AFB",
    agent_handoff: "#56C7D6",
    human_decision: "#918C9C",
  },
} as const;

export const palette: PaletteOptions = {
  mode: "dark",
  primary: { main: tokens.brand.solid, contrastText: tokens.onFill },
  success: { main: tokens.status.pass, contrastText: tokens.onFill },
  error: { main: tokens.status.fail.solid, contrastText: tokens.onFill },
  warning: { main: tokens.status.warn, contrastText: tokens.onFill },
  background: { default: tokens.bg, paper: tokens.surface },
  text: { primary: tokens.ink, secondary: tokens.muted },
  divider: tokens.border,
};
