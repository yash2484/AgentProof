import type { PaletteOptions } from "@mui/material/styles";

/**
 * Ledger.
 *
 * A light document that carries data. The governing rule is that prose is
 * serif on paper and data is mono on a tinted panel — the tint marks the
 * boundary between what was written and what was measured.
 *
 * Two rules decide every colour question here:
 *
 * 1. If something is coloured, it has a status. `link` is the single
 *    exception and appears only on interactive things.
 * 2. The ground is biased *blue*. Warm cream is banned — the whole
 *    warm-neutral band is the saturated default of the moment, and a future
 *    edit that warms this is a regression, not a preference.
 *
 * Every ratio quoted below is asserted in `contrast.test.ts` against all
 * four grounds. Do not adjust a hex without re-running it.
 */

/** Page and panel grounds, coolest to warmest — none of them warm. */
const GROUND = {
  /** Page ground. A cool off-white, biased blue. */
  paper: "#F7F8FA",
  /** Raised surfaces and side panels. */
  card: "#FFFFFF",
  /** Data surfaces. One step cooler than paper — this is the tint that
   *  marks "measured" in the governing rule. */
  data: "#EFF2F6",
  /** Left navigation. */
  rail: "#ECEFF3",
} as const;

const RULE = {
  /** Row separators and panel borders. */
  hair: "#E1E5EB",
  /** Section rules, table heads, the top line of a page. */
  hairStrong: "#C9D0D9",
} as const;

/** Text, darkest to lightest. All three clear 4.5:1 on all four grounds. */
const TEXT = {
  /** Primary text. 15.4:1 at worst. */
  ink: "#15181D",
  /** Secondary prose. 7.9:1 at worst. */
  ink2: "#414954",
  /** Captions, labels, units. 4.7:1 at worst — the tightest token here. */
  dim: "#626B77",
} as const;

/**
 * The three verdicts, and the one interactive colour.
 *
 * `watch` doubles as the colour of a broken measurement, which is the point
 * of the product: a measurement that failed to run is flagged, never folded
 * into the failure count.
 */
const STATUS = {
  /** Within threshold. */
  pass: "#1F7A4D",
  /** Flagged, or a broken measurement. */
  watch: "#8A5A0F",
  /** Breached threshold. */
  fail: "#B3261E",
} as const;

/** Interactive only — links, focus rings, selection. Never a verdict. */
const LINK = "#1F5C8B";

/**
 * The categorical band: span types and metric groups.
 *
 * Categories are not verdicts, so these hues stay clear of green (150°),
 * red (3°) and amber (37°) by at least 28° — a category that borrows a
 * verdict colour reads as a verdict. They are spaced 36–48° from each
 * other so four series stay separable, and every one clears 4.5:1 on paper
 * while carrying a white label at 4.5:1 or better, so the same hex works as
 * a chart stroke and as a filled bar.
 *
 * The retired Graphite & Magenta brand hue (322°) does not appear. `plum`
 * at 298° is the nearest, 24° away and far darker — it is a category in a
 * four-hue ramp, not a brand accent wearing a new hex.
 */
const CATEGORY = {
  teal: "#0D6764",
  blue: "#3153C3",
  violet: "#6C43B1",
  plum: "#8C3A8F",
  /** The deliberate non-colour of the band, for "no category applies". */
  grey: "#626B77",
} as const;

export const tokens = {
  ...GROUND,
  ...RULE,
  ...TEXT,
  link: LINK,
  status: STATUS,
  category: CATEGORY,
  /** Label colour for text sitting on a saturated fill. */
  onFill: "#FFFFFF",
  /**
   * Unflagged histogram bars and neutral chart marks.
   *
   * Deliberately not `dim`: a bar is non-text and only needs 3:1, and
   * pulling it lighter than the label colour keeps the flagged bars the
   * only thing in the figure that draws the eye.
   */
  steel: "#7C8797",
  /**
   * Span-type fills for the waterfall, drawn from the categorical band.
   *
   * `human_decision` is the grey member on purpose: a human step is the one
   * span the agent did not take, and greying it says so without adding a
   * fifth hue that would have to sit somewhere meaningful.
   */
  spanTypes: {
    llm_call: CATEGORY.violet,
    tool_use: CATEGORY.blue,
    retrieval: CATEGORY.teal,
    agent_handoff: CATEGORY.plum,
    human_decision: CATEGORY.grey,
  },
} as const;

export const palette: PaletteOptions = {
  mode: "light",
  primary: { main: LINK, contrastText: tokens.onFill },
  success: { main: STATUS.pass, contrastText: tokens.onFill },
  error: { main: STATUS.fail, contrastText: tokens.onFill },
  warning: { main: STATUS.watch, contrastText: tokens.onFill },
  background: { default: GROUND.paper, paper: GROUND.card },
  text: { primary: TEXT.ink, secondary: TEXT.dim },
  divider: RULE.hair,
};
