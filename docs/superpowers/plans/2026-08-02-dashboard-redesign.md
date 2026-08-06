# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the templated MUI default dashboard with a token-driven Graphite & Magenta interface built around a new bento Overview page, and fix the four verified rendering defects, each with a regression test.

**Architecture:** `dashboard/src/theme.ts` (two lines) is replaced by a `dashboard/src/theme/` module that owns every colour, type step and spacing value as named tokens; a WCAG contrast test guards those tokens against silent regression. A new read-only `GET /api/v1/evals/summary` endpoint computes aggregates in SQL so the Overview never implies full-history numbers from a 200-row sample. The four defects are fixed in the pure helper layer (`lib/waterfall.ts`, `ScoreTimeseries`) wherever possible, so each regression test is deterministic rather than DOM-dependent.

**Tech Stack:** React 18, TypeScript 5.5, MUI 6 (`@mui/material`, `@mui/x-charts` 7, `@mui/x-data-grid` 7), TanStack Query 5, react-router-dom 6, Vite 5, Vitest 2 + Testing Library, jsdom. Server: FastAPI, SQLAlchemy 2.0 async, asyncpg, Postgres 16, pytest (`asyncio_mode = "auto"`).

## Global Constraints

- **No framework migration.** MUI 6 stays. `@mui/x-charts` and `@mui/x-data-grid` stay.
- **No raw hex in a component.** Every colour comes from `theme/palette.ts` tokens or the MUI palette keys built from them. Raw hex outside `theme/` is a review failure.
- **The magenta is flat.** No gradients anywhere, on any element.
- **Brand hue stays out of the semantic bands** — green (~145°), red (~28°), amber (~78°). Brand is 322°.
- **Contrast floors:** body-size text ≥ 4.5:1, non-text and large text ≥ 3.0:1, measured against **both** `bg` (`#141317`) and `surface` (`#1D1B22`).
- **Type scale:** 11 / 12 / 13 / 15 / 18 / 24 / 32. One family (Inter), weights 400 / 500 / 600 only.
- **Spacing:** 8px base, scale 8 / 12 / 16 / 24 / 32. Tile gap 12. Tile padding 16. Table row height 36.
- **Every numeric cell** — table figures, durations, token counts, scores, axis labels — carries `font-variant-numeric: tabular-nums`.
- **Dark only this pass.** Nothing ships hardcoded to dark; light mode is simply not built.
- **Files stay small.** A component past ~120 lines is a signal to split.
- **All 41 existing dashboard tests stay green.** A test may only change when behaviour intentionally changed — never to accommodate a regression. Tasks 4, 9 and 10 each change exactly one existing test and say why.
- **PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or use the Bash tool.
- **SDK and demo_agent test suites cannot be collected in one pytest run** (both name their test package `tests`). Run `pytest sdk/tests` and `pytest demo_agent/tests` separately. Server tests run from `server/`.

## Verified contrast measurements

These were recomputed with the WCAG 2.1 relative-luminance formula during planning and **all eight match the spec exactly**. Task 1's test asserts them.

| Token | Hex | vs `#1D1B22` | vs `#141317` | Floor |
|---|---|---|---|---|
| `ink` | `#F2F0F5` | 15.06 | 16.35 | 4.5 |
| `muted` | `#918C9C` | 5.22 | 5.67 | 4.5 |
| `brand.solid` | `#D6409F` | 4.13 | 4.49 | 3.0 |
| `brand.text` | `#E255AC` | 4.97 | 5.40 | 4.5 |
| `status.pass` | `#3FCF8E` | 8.54 | 9.27 | 4.5 |
| `status.fail.solid` | `#E5484D` | 4.35 | 4.73 | 3.0 |
| `status.fail.text` | `#EC5F63` | 5.18 | 5.62 | 4.5 |
| `status.warn` | `#E2A336` | 7.73 | 8.39 | 4.5 |

Span-type fills (new — see Task 1 note) measured against `surface`, and the `onFill` label colour measured against each fill:

| Span type | Fill | vs surface | `onFill` `#100F13` on fill | Hue |
|---|---|---|---|---|
| `llm_call` | `#D6409F` | 4.13 | 4.63 | 322° |
| `tool_use` | `#4C9AFF` | 5.98 | 6.70 | 214° |
| `retrieval` | `#9B8AFB` | 6.02 | 6.75 | 249° |
| `agent_handoff` | `#56C7D6` | 8.55 | 9.58 | 187° |
| `human_decision` | `#918C9C` | 5.22 | 5.85 | 259°, sat 7% |

`retrieval` (249°, sat 93%) and `human_decision` (259°, sat 7%) share a hue band but differ by 86 saturation points — one reads violet, the other grey. `onFill` is `#100F13` rather than `bg`: `bg` on `brand.solid` measures 4.49, which misses the 4.5 body floor by 0.01.

---

## File structure

**Created — dashboard**

| File | Responsibility |
|---|---|
| `dashboard/src/theme/palette.ts` | Raw colour tokens + MUI palette options + TS module augmentation |
| `dashboard/src/theme/typography.ts` | Font family, the 7-step scale, tabular-nums |
| `dashboard/src/theme/components.ts` | MUI component overrides (surfaces, tables, inputs, charts) |
| `dashboard/src/theme/contrast.ts` | Pure WCAG 2.1 luminance + ratio helpers |
| `dashboard/src/theme/index.ts` | Composes the three into `theme`; re-exports `tokens` |
| `dashboard/src/theme/contrast.test.ts` | Contrast regression test over every token pair |
| `dashboard/src/components/StatTile.tsx` | Small bento tile: label, value, sublabel |
| `dashboard/src/components/StatTile.test.tsx` | |
| `dashboard/src/components/VerdictTile.tsx` | 2×2 security verdict tile |
| `dashboard/src/components/VerdictTile.test.tsx` | |
| `dashboard/src/components/EmptyState.tsx` | Shared empty-state block for the Overview |
| `dashboard/src/components/EmptyState.test.tsx` | |
| `dashboard/src/components/MiniWaterfall.tsx` | Compact waterfall for the latest-trace tile |
| `dashboard/src/components/MiniWaterfall.test.tsx` | |
| `dashboard/src/lib/overview.ts` | Pure derivations: gate status, verdict sentence |
| `dashboard/src/lib/overview.test.ts` | |
| `dashboard/src/pages/OverviewPage.tsx` | Bento grid assembly |
| `dashboard/src/pages/OverviewPage.test.tsx` | |

**Deleted — dashboard**

| File | Why |
|---|---|
| `dashboard/src/theme.ts` | Replaced by `theme/index.ts`. Both `main.tsx` (`./theme`) and `test/utils.tsx` (`../theme`) resolve to the directory index with **no import change**. |

**Modified — dashboard**

| File | Change |
|---|---|
| `dashboard/index.html` | `<meta name="color-scheme" content="dark">` |
| `dashboard/package.json` | Add `@fontsource/inter` |
| `dashboard/src/main.tsx` | Import Inter font faces |
| `dashboard/src/App.tsx` | `/` becomes Overview, redirect removed |
| `dashboard/src/components/AppShell.tsx` | AppBar + Drawer → single persistent left rail |
| `dashboard/src/components/Waterfall.tsx` | 3px minimum rendered bar width, token colours |
| `dashboard/src/lib/waterfall.ts` | Scale against the trace's own extent; stop coercing missing timestamps to epoch |
| `dashboard/src/lib/format.ts` | Span colours read from tokens |
| `dashboard/src/components/ScoreTimeseries.tsx` | Plot run index; timestamp moves to tooltip |
| `dashboard/src/components/SecurityReportCard.tsx` | Name and link the owning trace |
| `dashboard/src/components/SpanDetailPanel.tsx` | Bounded stacking context, no pointer interception |
| `dashboard/src/api/client.ts` | `getEvalSummary` |
| `dashboard/src/hooks/queries.ts` | `useEvalSummary` |
| `dashboard/src/types/index.ts` | `EvalSummary`, `EvalSummaryMetric` |
| `dashboard/src/test/fixtures.ts` | `replaySpanTree`, `sampleSummary`, `batchEvalResults` |
| `dashboard/src/pages/*.tsx` (4) | Density pass |
| `dashboard/src/App.test.tsx` | Redirect assertion → Overview assertion (Task 5) |
| `dashboard/src/lib/waterfall.test.ts` | Min-width assertion moves from % to px (Task 4) |
| `dashboard/src/pages/SecurityPage.test.tsx` | Per-trace card assertion (Task 11) |

**Modified / created — server**

| File | Change |
|---|---|
| `server/agentproof_server/api/evals.py` | `_summary_payload`, three statement builders, `GET /evals/summary` |
| `server/tests/unit/test_evals_summary.py` | Pure-helper + compiled-SQL unit tests (no DB) |
| `server/tests/integration/test_evals_summary_db.py` | DB-backed tests: populated, empty, project scoping |
| `.github/workflows/ci.yml` | New `test-dashboard` job (Task 14 — beyond spec, see note) |

---

## Deviations from the spec

Three, each deliberate. Raise them with the user if any is unwanted; none is load-bearing enough to block.

1. **`project` is optional on `/evals/summary`.** The spec writes `?project=<name>`. But `ProjectContext` defaults to `undefined` ("All projects"), so the Overview's first render has no project. A required parameter would 422 on load. Omitted `project` means all projects, and the response's `"project"` is `null`.
2. **The summary response carries `p99_latency_ms`.** The spec lists a p99 latency tile but gives the endpoint only eval aggregates. Computing p99 client-side over the 200-row trace cap is exactly the "sample implying full history" failure the spec rejected for evals, so the same argument puts it in SQL: `percentile_cont(0.99) WITHIN GROUP (ORDER BY total_latency_ms)`.
3. **Span-type colours move into tokens.** `lib/format.ts` hardcodes `#3949ab`, `#00897b`, `#8e24aa`, `#fb8c00`, `#546e7a` — indigo/teal/purple/orange/blue-grey from the old default. Left alone they violate the no-raw-hex rule and clash with graphite. New values are in the table above.

**One honest limitation, called out rather than papered over.** Defect 4 (nav click blocked by the span panel) **cannot be faithfully reproduced in jsdom** — jsdom performs no hit-testing, so a backdrop that swallows clicks in a real browser does not swallow them under `fireEvent`. Task 12's regression test therefore asserts the *mechanism* (the modal root carries `pointer-events: none`, the paper carries `pointer-events: auto`), and the behavioural proof is the Playwright step in Task 14. Do not claim Defect 4 fixed on the strength of the jsdom test alone.

---

### Task 1: Theme token system and the contrast regression test

Everything else depends on this. Nothing here renders a page; it establishes the vocabulary.

**Files:**
- Create: `dashboard/src/theme/contrast.ts`
- Create: `dashboard/src/theme/contrast.test.ts`
- Create: `dashboard/src/theme/palette.ts`
- Create: `dashboard/src/theme/typography.ts`
- Create: `dashboard/src/theme/components.ts`
- Create: `dashboard/src/theme/index.ts`
- Delete: `dashboard/src/theme.ts`
- Modify: `dashboard/src/lib/format.ts`
- Modify: `dashboard/src/main.tsx`
- Modify: `dashboard/index.html`
- Modify: `dashboard/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tokens` — the frozen token object, shape below. Every later task imports it from `"../theme"`.
  - `theme` — the composed MUI theme, default-exported shape unchanged from today (`import { theme } from "./theme"` keeps working).
  - `relativeLuminance(hex: string): number`
  - `contrastRatio(fg: string, bg: string): number`
  - `SPAN_TYPE_COLORS: Record<SpanType, string>` — unchanged name and signature in `lib/format.ts`, new values.

- [ ] **Step 1: Write the failing contrast test**

Create `dashboard/src/theme/contrast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";
import { tokens } from "./palette";

/** Body-size text must clear 4.5:1; non-text and large text must clear 3.0:1. */
const BODY_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3.0;

/** Both page backgrounds — text sits on each, so each must be checked. */
const BACKGROUNDS = [tokens.bg, tokens.surface];

const BODY_TOKENS: Record<string, string> = {
  ink: tokens.ink,
  muted: tokens.muted,
  "brand.text": tokens.brand.text,
  "status.pass": tokens.status.pass,
  "status.fail.text": tokens.status.fail.text,
  "status.warn": tokens.status.warn,
};

const NON_TEXT_TOKENS: Record<string, string> = {
  "brand.solid": tokens.brand.solid,
  "status.fail.solid": tokens.status.fail.solid,
};

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white and is order-independent", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio(tokens.ink, tokens.ink)).toBeCloseTo(1, 5);
  });
});

describe("palette contrast floors", () => {
  it.each(Object.entries(BODY_TOKENS))(
    "%s clears 4.5:1 on every background",
    (_name, hex) => {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(BODY_FLOOR);
      }
    },
  );

  it.each(Object.entries(NON_TEXT_TOKENS))(
    "%s clears 3.0:1 on every background",
    (_name, hex) => {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      }
    },
  );

  it("keeps solid tokens below the body floor, so the split stays justified", () => {
    // If a solid token ever clears 4.5 the split into solid/text is dead
    // weight and should be removed rather than left to rot.
    expect(contrastRatio(tokens.brand.solid, tokens.surface)).toBeLessThan(BODY_FLOOR);
    expect(contrastRatio(tokens.status.fail.solid, tokens.surface)).toBeLessThan(BODY_FLOOR);
  });
});

describe("span-type fills", () => {
  it("each fill clears 3.0:1 against the surface it sits on", () => {
    for (const hex of Object.values(tokens.spanTypes)) {
      expect(contrastRatio(hex, tokens.surface)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    }
  });

  it("the on-fill label colour clears 4.5:1 against every fill", () => {
    for (const hex of Object.values(tokens.spanTypes)) {
      expect(contrastRatio(tokens.onFill, hex)).toBeGreaterThanOrEqual(BODY_FLOOR);
    }
  });
});

describe("measured ratios match the approved design spec", () => {
  // Exact values from docs/superpowers/specs/2026-08-02-dashboard-redesign-design.md.
  // A change here means the palette moved — update the spec, don't loosen the test.
  const EXPECTED: Array<[string, string, number]> = [
    ["ink", tokens.ink, 15.06],
    ["muted", tokens.muted, 5.22],
    ["brand.solid", tokens.brand.solid, 4.13],
    ["brand.text", tokens.brand.text, 4.97],
    ["status.pass", tokens.status.pass, 8.54],
    ["status.fail.solid", tokens.status.fail.solid, 4.35],
    ["status.fail.text", tokens.status.fail.text, 5.18],
    ["status.warn", tokens.status.warn, 7.73],
  ];

  it.each(EXPECTED)("%s measures %#s against surface", (_name, hex, expected) => {
    expect(contrastRatio(hex, tokens.surface)).toBeCloseTo(expected as number, 1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard; npx vitest run src/theme/contrast.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

If npm cannot find node: `export PATH="/c/Program Files/nodejs:$PATH"` (Bash tool).

- [ ] **Step 3: Write `theme/contrast.ts`**

```ts
/**
 * WCAG 2.1 contrast maths.
 *
 * Kept dependency-free and pure so the palette can be asserted in a unit
 * test. This is what stops the palette silently regressing.
 */

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  }
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2.1 relative luminance: 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1..21. Order-independent. */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Write `theme/palette.ts`**

```ts
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
```

- [ ] **Step 5: Write `theme/typography.ts`**

```ts
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
```

- [ ] **Step 6: Write `theme/components.ts`**

```ts
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
```

> `MuiDataGrid` is not in MUI core's `Components` map — the trailing `as Components<Theme>` cast is what keeps `tsc` happy without pulling in the x-data-grid theme augmentation module. If `tsc` still objects, `import type {} from "@mui/x-data-grid/themeAugmentation";` at the top of the file is the supported fix; add it and drop the cast.

- [ ] **Step 7: Write `theme/index.ts` and delete `theme.ts`**

```ts
import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";
import { typography } from "./typography";
import { components } from "./components";

export { tokens } from "./palette";
export { contrastRatio, relativeLuminance } from "./contrast";
export { SPACE, TILE_GAP, TILE_PADDING, ROW_HEIGHT, RADIUS } from "./components";
export { TABULAR_NUMS, FONT_FAMILY } from "./typography";

export const theme = createTheme({
  palette,
  typography,
  components,
  shape: { borderRadius: 10 },
  spacing: 8,
});
```

Then delete the old file:

```bash
git rm dashboard/src/theme.ts
```

`main.tsx` imports `"./theme"` and `test/utils.tsx` imports `"../theme"`. Both now resolve to `theme/index.ts`. **Neither import line changes.**

- [ ] **Step 8: Point span colours at tokens**

In `dashboard/src/lib/format.ts`, replace lines 19-27 (the `SPAN_TYPE_COLORS` map and `FALLBACK_COLOR`) with:

```ts
import { tokens } from "../theme";

export const SPAN_TYPE_COLORS: Record<SpanType, string> = tokens.spanTypes;

const FALLBACK_COLOR = tokens.muted;
```

Keep the existing `import type { SpanType } from "../types";` line and the `spanColor` function exactly as they are.

- [ ] **Step 9: Install Inter and wire it up**

```bash
cd dashboard && npm install @fontsource/inter@^5.1.0
```

Self-hosted rather than a Google Fonts `<link>` so the Docker container works offline.

In `dashboard/src/main.tsx`, add these four imports directly below `import React from "react";`:

```ts
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
```

In `dashboard/index.html`, add one line inside `<head>`, after the viewport meta:

```html
    <meta name="color-scheme" content="dark" />
```

- [ ] **Step 10: Run the contrast test to verify it passes**

Run: `cd dashboard; npx vitest run src/theme/contrast.test.ts`
Expected: PASS, all cases.

- [ ] **Step 11: Run the full suite — no existing test may break**

Run: `cd dashboard; npm test`
Expected: PASS. The pre-existing count is 41; it is now 41 plus the new contrast cases. Zero failures.

If `App.test.tsx` or a page test fails here, stop — a theme change should not alter behaviour. Debug rather than adjust the test.

- [ ] **Step 12: Typecheck and lint**

Run: `cd dashboard; npx tsc -b; npx eslint . --ext ts,tsx`
Expected: both clean.

- [ ] **Step 13: Commit**

```bash
git add dashboard/src/theme dashboard/src/lib/format.ts dashboard/src/main.tsx dashboard/index.html dashboard/package.json dashboard/package-lock.json
git rm --cached dashboard/src/theme.ts 2>/dev/null; git add -A dashboard/src
git commit -m "feat(dashboard): graphite & magenta token system with contrast regression test"
```

---

### Task 2: `GET /api/v1/evals/summary`

Backend only, independent of every frontend task. Pure helpers carry the logic so they can be unit-tested without a database; the SQL is proven separately against a real Postgres.

**Files:**
- Modify: `server/agentproof_server/api/evals.py` (append after `list_metrics`, line 229)
- Test: `server/tests/unit/test_evals_summary.py`
- Test: `server/tests/integration/test_evals_summary_db.py`

**Interfaces:**
- Consumes: `EvalResultModel`, `TraceModel` from `agentproof_server.db.models`; `get_db` from `agentproof_server.db.session`.
- Produces:
  - `_summary_payload(project: str | None, trace_count: int, p99_latency_ms: float | None, metric_rows: Sequence[tuple]) -> dict`
  - `_summary_metrics_stmt(project: str | None) -> Select`
  - `_summary_trace_count_stmt(project: str | None) -> Select`
  - `_summary_p99_stmt(project: str | None) -> Select`
  - `get_evals_summary(db: AsyncSession, project: str | None) -> dict` — the route handler, callable directly in tests
  - Response JSON consumed by Task 3:
    ```json
    { "project": "demo|null", "trace_count": 0, "overall_pass_rate": 0.0,
      "p99_latency_ms": 0.0,
      "metrics": [{ "metric_name": "", "mean_score": 0.0, "pass_rate": 0.0,
                    "count": 0, "last_evaluated_at": "ISO8601|null" }] }
    ```

- [ ] **Step 1: Write the failing unit test**

Create `server/tests/unit/test_evals_summary.py`:

```python
# server/tests/unit/test_evals_summary.py
"""Unit tests for the evals-summary helpers that don't require a database."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.api.evals import (
    _summary_metrics_stmt,
    _summary_p99_stmt,
    _summary_payload,
    _summary_trace_count_stmt,
)

EVALUATED_AT = datetime(2026, 8, 2, 10, 14, 22, tzinfo=UTC)


def test_summary_payload_shapes_metric_rows():
    payload = _summary_payload(
        project="demo",
        trace_count=247,
        p99_latency_ms=1820.5,
        metric_rows=[("injection_resistance", 1.0, 1.0, 247, EVALUATED_AT)],
    )
    assert payload["project"] == "demo"
    assert payload["trace_count"] == 247
    assert payload["p99_latency_ms"] == 1820.5
    assert payload["metrics"] == [
        {
            "metric_name": "injection_resistance",
            "mean_score": 1.0,
            "pass_rate": 1.0,
            "count": 247,
            "last_evaluated_at": "2026-08-02T10:14:22+00:00",
        }
    ]


def test_summary_payload_weights_overall_pass_rate_by_count():
    # 90 of 100 + 10 of 100 -> 100 of 200 -> 0.5, not the unweighted 0.5 by luck:
    # 8 of 10 and 0 of 90 must give 0.08, not the unweighted 0.4.
    payload = _summary_payload(
        project="demo",
        trace_count=100,
        p99_latency_ms=None,
        metric_rows=[
            ("a", 0.9, 0.8, 10, EVALUATED_AT),
            ("b", 0.1, 0.0, 90, EVALUATED_AT),
        ],
    )
    assert payload["overall_pass_rate"] == 0.08


def test_summary_payload_empty_project_is_not_an_error():
    payload = _summary_payload(
        project="fresh", trace_count=0, p99_latency_ms=None, metric_rows=[]
    )
    assert payload == {
        "project": "fresh",
        "trace_count": 0,
        "overall_pass_rate": None,
        "p99_latency_ms": None,
        "metrics": [],
    }


def test_summary_payload_allows_a_null_project():
    payload = _summary_payload(
        project=None, trace_count=3, p99_latency_ms=None, metric_rows=[]
    )
    assert payload["project"] is None


def test_summary_payload_tolerates_a_null_last_evaluated_at():
    payload = _summary_payload(
        project="demo",
        trace_count=1,
        p99_latency_ms=None,
        metric_rows=[("m", 1.0, 1.0, 1, None)],
    )
    assert payload["metrics"][0]["last_evaluated_at"] is None


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


def test_metrics_stmt_groups_by_metric_name():
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "group by" in sql
    assert "metric_name" in sql


def test_metrics_stmt_avoids_avg_over_a_boolean():
    # Postgres rejects avg(boolean); the pass rate must go through a CASE.
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "case" in sql
    assert "avg(eval_results.passed)" not in sql


def test_metrics_stmt_scopes_by_project_via_the_traces_join():
    sql = _sql(_summary_metrics_stmt("demo")).lower()
    assert "join traces" in sql
    assert "traces.project = 'demo'" in sql


def test_metrics_stmt_without_a_project_neither_joins_nor_filters():
    sql = _sql(_summary_metrics_stmt(None)).lower()
    assert "join traces" not in sql
    assert "traces.project" not in sql


def test_trace_count_stmt_counts_traces_in_the_project():
    sql = _sql(_summary_trace_count_stmt("demo")).lower()
    assert "count(" in sql
    assert "from traces" in sql
    assert "traces.project = 'demo'" in sql


def test_p99_stmt_uses_an_ordered_set_aggregate():
    sql = _sql(_summary_p99_stmt("demo")).lower()
    assert "percentile_cont" in sql
    assert "within group" in sql
    assert "total_latency_ms" in sql
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server; python -m pytest tests/unit/test_evals_summary.py -v`
Expected: FAIL — `ImportError: cannot import name '_summary_payload'`.

- [ ] **Step 3: Implement the helpers and the route**

In `server/agentproof_server/api/evals.py`, extend the SQLAlchemy import on line 16 from `from sqlalchemy import select` to:

```python
from sqlalchemy import case, func, select
```

and add `from collections.abc import Sequence` next to the existing `import asyncio`.

Then append to the end of the file:

```python
# ---------------------------------------------------------------------------
# Aggregate summary (read-only)
# ---------------------------------------------------------------------------
#
# The dashboard overview needs project-wide numbers. Aggregating client-side
# over the 200-row result cap would show a sample while implying full history,
# so every figure below is computed in SQL.
#
# ``project`` is optional: the dashboard's project switcher has an "All
# projects" state, and the overview must not 422 on first render. When it is
# omitted the statements neither join nor filter, and the response's
# ``project`` is null.


def _summary_metrics_stmt(project: str | None):
    """Per-metric aggregates, one row per metric name.

    ``passed`` is boolean, so a bare ``avg()`` over it is invalid in
    Postgres — the pass rate goes through an explicit CASE.
    """
    stmt = select(
        EvalResultModel.metric_name,
        func.avg(EvalResultModel.score).label("mean_score"),
        func.avg(
            case((EvalResultModel.passed, 1.0), else_=0.0)
        ).label("pass_rate"),
        func.count().label("count"),
        func.max(EvalResultModel.evaluated_at).label("last_evaluated_at"),
    )
    if project is not None:
        stmt = stmt.join(
            TraceModel, EvalResultModel.trace_id == TraceModel.trace_id
        ).where(TraceModel.project == project)
    return stmt.group_by(EvalResultModel.metric_name).order_by(
        EvalResultModel.metric_name
    )


def _summary_trace_count_stmt(project: str | None):
    """How many traces the project holds (not how many were evaluated)."""
    stmt = select(func.count()).select_from(TraceModel)
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    return stmt


def _summary_p99_stmt(project: str | None):
    """p99 total latency across the project's traces.

    ``percentile_cont`` is an ordered-set aggregate: it ignores NULL inputs
    and returns NULL when every input is NULL.
    """
    stmt = select(
        func.percentile_cont(0.99).within_group(
            TraceModel.total_latency_ms.asc()
        )
    ).select_from(TraceModel)
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    return stmt


def _summary_payload(
    project: str | None,
    trace_count: int,
    p99_latency_ms: float | None,
    metric_rows: Sequence[tuple],
) -> dict:
    """Assemble the summary response from already-fetched aggregates.

    ``overall_pass_rate`` is the count-weighted mean of the per-metric pass
    rates, which is exactly the average over every eval row — so it needs no
    second query. It is ``None`` (not 0.0) when there is nothing to average,
    because "no data" and "everything failed" are different facts.
    """
    metrics = [
        {
            "metric_name": name,
            "mean_score": float(mean_score) if mean_score is not None else None,
            "pass_rate": float(pass_rate) if pass_rate is not None else None,
            "count": int(count),
            "last_evaluated_at": (
                last_evaluated_at.isoformat() if last_evaluated_at else None
            ),
        }
        for name, mean_score, pass_rate, count, last_evaluated_at in metric_rows
    ]

    total = sum(m["count"] for m in metrics)
    if total:
        weighted = sum(
            (m["pass_rate"] or 0.0) * m["count"] for m in metrics
        )
        overall_pass_rate: float | None = round(weighted / total, 6)
    else:
        overall_pass_rate = None

    return {
        "project": project,
        "trace_count": trace_count,
        "overall_pass_rate": overall_pass_rate,
        "p99_latency_ms": (
            float(p99_latency_ms) if p99_latency_ms is not None else None
        ),
        "metrics": metrics,
    }


@router.get("/evals/summary")
async def get_evals_summary(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
) -> dict:
    """Project-wide eval aggregates for the dashboard overview.

    An empty or unknown project returns ``trace_count: 0`` with a null pass
    rate and no metrics — not a 404 — so a fresh install renders guidance
    rather than an error.
    """
    metric_rows = (await db.execute(_summary_metrics_stmt(project))).all()
    trace_count = (
        await db.execute(_summary_trace_count_stmt(project))
    ).scalar_one()
    p99 = (await db.execute(_summary_p99_stmt(project))).scalar_one_or_none()
    return _summary_payload(project, trace_count, p99, metric_rows)
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd server; python -m pytest tests/unit/test_evals_summary.py -v`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write the DB-backed test**

The unit tests prove the SQL's *shape*. Only a real Postgres proves it *runs* — which matters here, because `avg(boolean)` and `percentile_cont` are precisely the constructs that compile fine and then fail at execution.

Create `server/tests/integration/test_evals_summary_db.py`:

```python
# server/tests/integration/test_evals_summary_db.py
"""
DB-backed tests for GET /evals/summary.

Calls the route handler directly with a test session, so no HTTP server is
needed — only a reachable Postgres. CI's test-server job provides one.
Skipped when the database is unreachable so local runs stay green.

Each test writes under a unique project name and deletes its own rows, so it
is safe against a database that already holds demo data.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from agentproof_server.api.evals import get_evals_summary
from agentproof_server.config import settings
from agentproof_server.db.models import Base
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Trace as TraceModel


def _db_up() -> bool:
    async def _ping() -> None:
        eng = create_async_engine(settings.database_url, poolclass=NullPool)
        try:
            async with eng.connect() as conn:
                await conn.execute(text("SELECT 1"))
        finally:
            await eng.dispose()

    try:
        asyncio.run(_ping())
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _db_up(), reason="requires a reachable Postgres (docker compose up)"
)


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    # NullPool: pytest-asyncio gives each test its own event loop, and a
    # pooled connection bound to a closed loop fails on reuse.
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await eng.dispose()


async def _seed(
    session: AsyncSession,
    project: str,
    specs: list[tuple[str, float, bool]],
    latency_ms: int = 1000,
) -> list[str]:
    """Insert one trace per spec plus its eval row. Returns the trace ids."""
    now = datetime.now(UTC)
    trace_ids: list[str] = []
    for i, (metric_name, score, passed) in enumerate(specs):
        trace_id = f"{project}-tr-{i}"
        trace_ids.append(trace_id)
        session.add(
            TraceModel(
                trace_id=trace_id,
                project=project,
                name=f"run-{i}",
                total_latency_ms=latency_ms + i,
                status="ok",
                tags={},
            )
        )
        session.add(
            EvalResultModel(
                trace_id=trace_id,
                span_id=None,
                metric_name=metric_name,
                metric_type="security",
                score=score,
                threshold=0.8,
                passed=passed,
                evaluated_at=now + timedelta(seconds=i),
            )
        )
    await session.commit()
    return trace_ids


async def _cleanup(session: AsyncSession, project: str) -> None:
    """Remove everything this test wrote, leaving pre-existing data alone."""
    trace_ids = (
        await session.execute(
            select(TraceModel.trace_id).where(TraceModel.project == project)
        )
    ).scalars().all()
    if trace_ids:
        await session.execute(
            delete(EvalResultModel).where(EvalResultModel.trace_id.in_(trace_ids))
        )
        await session.execute(
            delete(TraceModel).where(TraceModel.trace_id.in_(trace_ids))
        )
    await session.commit()


async def test_summary_aggregates_a_populated_project(session: AsyncSession):
    project = f"sum-pop-{uuid.uuid4().hex[:8]}"
    try:
        await _seed(
            session,
            project,
            [
                ("injection_resistance", 1.0, True),
                ("injection_resistance", 0.0, False),
                ("data_exfiltration", 1.0, True),
            ],
        )
        payload = await get_evals_summary(db=session, project=project)

        assert payload["project"] == project
        assert payload["trace_count"] == 3
        # 2 passes out of 3 eval rows.
        assert payload["overall_pass_rate"] == pytest.approx(2 / 3, rel=1e-4)
        assert payload["p99_latency_ms"] is not None

        by_name = {m["metric_name"]: m for m in payload["metrics"]}
        assert by_name["injection_resistance"]["count"] == 2
        assert by_name["injection_resistance"]["pass_rate"] == pytest.approx(0.5)
        assert by_name["injection_resistance"]["mean_score"] == pytest.approx(0.5)
        assert by_name["data_exfiltration"]["pass_rate"] == pytest.approx(1.0)
        assert by_name["data_exfiltration"]["last_evaluated_at"] is not None
    finally:
        await _cleanup(session, project)


async def test_summary_of_an_empty_project_returns_zeroes_not_a_404(
    session: AsyncSession,
):
    payload = await get_evals_summary(
        db=session, project=f"sum-empty-{uuid.uuid4().hex[:8]}"
    )
    assert payload["trace_count"] == 0
    assert payload["overall_pass_rate"] is None
    assert payload["p99_latency_ms"] is None
    assert payload["metrics"] == []


async def test_summary_does_not_leak_results_from_another_project(
    session: AsyncSession,
):
    mine = f"sum-mine-{uuid.uuid4().hex[:8]}"
    theirs = f"sum-theirs-{uuid.uuid4().hex[:8]}"
    try:
        await _seed(session, mine, [("faithfulness", 1.0, True)])
        await _seed(
            session,
            theirs,
            [("leaked_metric", 0.0, False), ("leaked_metric", 0.0, False)],
        )

        payload = await get_evals_summary(db=session, project=mine)

        assert payload["trace_count"] == 1
        assert [m["metric_name"] for m in payload["metrics"]] == ["faithfulness"]
        assert payload["overall_pass_rate"] == pytest.approx(1.0)
    finally:
        await _cleanup(session, mine)
        await _cleanup(session, theirs)
```

- [ ] **Step 6: Run the DB test**

Start the stack first if it is down — `docker compose down` was run without `-v`, so the `pgdata` volume and all existing traces survived:

```bash
docker compose up -d
```

Run: `cd server; python -m pytest tests/integration/test_evals_summary_db.py -v`
Expected: PASS, 3 tests. If they report as skipped, Postgres is unreachable — fix that before continuing; a skipped test proves nothing.

- [ ] **Step 7: Run the whole server suite and lint**

Run: `cd server; python -m pytest tests/ -v`
Expected: PASS. Integration tests needing `ANTHROPIC_API_KEY` skip as they already do.

Run: `ruff check sdk/ server/` from the repo root.
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add server/agentproof_server/api/evals.py server/tests/unit/test_evals_summary.py server/tests/integration/test_evals_summary_db.py
git commit -m "feat(server): read-only GET /evals/summary with SQL-side aggregates"
```

---

### Task 3: Summary types, client function, and query hook

Thin wiring task. Small enough to fold into Task 9, kept separate because it is the seam every Overview component depends on and a reviewer can gate it independently.

**Files:**
- Modify: `dashboard/src/types/index.ts`
- Modify: `dashboard/src/api/client.ts`
- Modify: `dashboard/src/hooks/queries.ts`
- Modify: `dashboard/src/test/fixtures.ts`
- Test: `dashboard/src/api/client.test.ts` (append)

**Interfaces:**
- Consumes: the Task 2 response JSON.
- Produces:
  - `EvalSummary`, `EvalSummaryMetric` types
  - `getEvalSummary(params?: { project?: string }): Promise<EvalSummary>`
  - `useEvalSummary(project?: string)` — TanStack Query hook, key `["evalSummary", project]`
  - `sampleSummary: EvalSummary` fixture

- [ ] **Step 1: Write the failing test**

Append to `dashboard/src/api/client.test.ts`, inside the existing `describe("api client", ...)` block:

```ts
  it("GETs the eval summary with the project filter", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        project: "demo",
        trace_count: 3,
        overall_pass_rate: 0.5,
        p99_latency_ms: 1200,
        metrics: [],
      }),
    );
    const summary = await getEvalSummary({ project: "demo" });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/evals/summary?");
    expect(url).toContain("project=demo");
    expect(summary.trace_count).toBe(3);
  });

  it("omits the project param when asking for all projects", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        project: null,
        trace_count: 0,
        overall_pass_rate: null,
        p99_latency_ms: null,
        metrics: [],
      }),
    );
    await getEvalSummary({});
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain("project=");
  });
```

Update the import on line 2 of that file to include the new function:

```ts
import { listTraces, runEval, deleteTrace, getEvalSummary, ApiError } from "./client";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard; npx vitest run src/api/client.test.ts`
Expected: FAIL — `getEvalSummary is not a function`.

- [ ] **Step 3: Add the types**

Append to `dashboard/src/types/index.ts`:

```ts
export interface EvalSummaryMetric {
  metric_name: string;
  mean_score: number | null;
  pass_rate: number | null;
  count: number;
  last_evaluated_at: string | null;
}

export interface EvalSummary {
  /** Null when the summary spans every project. */
  project: string | null;
  trace_count: number;
  /** Null when there is nothing to average — distinct from 0.0. */
  overall_pass_rate: number | null;
  p99_latency_ms: number | null;
  metrics: EvalSummaryMetric[];
}
```

- [ ] **Step 4: Add the client function**

In `dashboard/src/api/client.ts`, add `EvalSummary` to the type import block at the top, then append:

```ts
export function getEvalSummary(
  params: { project?: string } = {},
): Promise<EvalSummary> {
  return request<EvalSummary>(`/evals/summary${qs(params)}`);
}
```

`qs` already drops `undefined`, so "all projects" sends no parameter.

- [ ] **Step 5: Add the hook**

In `dashboard/src/hooks/queries.ts`, add to the `queryKeys` object:

```ts
  evalSummary: (project: string | undefined) => ["evalSummary", project] as const,
```

and append:

```ts
export function useEvalSummary(project?: string) {
  return useQuery({
    queryKey: queryKeys.evalSummary(project),
    queryFn: () => api.getEvalSummary({ project }),
  });
}
```

- [ ] **Step 6: Add the fixture**

Append to `dashboard/src/test/fixtures.ts`, adding `EvalSummary` to the type import block at the top:

```ts
export const sampleSummary: EvalSummary = {
  project: "demo",
  trace_count: 247,
  overall_pass_rate: 0.94,
  p99_latency_ms: 1820,
  metrics: [
    {
      metric_name: "injection_resistance",
      mean_score: 1.0,
      pass_rate: 1.0,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
    {
      metric_name: "data_exfiltration",
      mean_score: 0.82,
      pass_rate: 0.88,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
    {
      metric_name: "answer_relevance",
      mean_score: 0.91,
      pass_rate: 0.94,
      count: 247,
      last_evaluated_at: "2026-08-02T10:14:22.000Z",
    },
  ],
};

/** Every project empty — the fresh-install state. */
export const emptySummary: EvalSummary = {
  project: null,
  trace_count: 0,
  overall_pass_rate: null,
  p99_latency_ms: null,
  metrics: [],
};
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd dashboard; npx vitest run src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/types/index.ts dashboard/src/api/client.ts dashboard/src/hooks/queries.ts dashboard/src/test/fixtures.ts dashboard/src/api/client.test.ts
git commit -m "feat(dashboard): eval summary types, client, and query hook"
```

---

### Task 4: Defect 1 — waterfall unreadable at sub-millisecond durations

Done before the Overview because `MiniWaterfall` (Task 8) reuses `computeWaterfall`.

**Root cause.** `flatten` coerces a missing `start_time` to `0` (`start ?? 0`, line 40 of `lib/waterfall.ts`). One span without a timestamp therefore drags `min` to the Unix epoch, making `window` about 1.8e12 ms. Every real span's width rounds to zero and clamps to `MIN_WIDTH_PCT` (a speck), and every real offset rounds to ~100% — pushing bars off the right edge. That is why `fact_checker` appears not to render at all. The `MIN_WIDTH_PCT` percentage floor also scales with container width, so it guarantees nothing in pixels.

**Fix.** Keep missing timestamps as `null` instead of epoch, compute the window only from spans that have one, and move the floor from a percentage to a rendered `3px` minimum in the component.

**Files:**
- Modify: `dashboard/src/lib/waterfall.ts`
- Modify: `dashboard/src/components/Waterfall.tsx`
- Modify: `dashboard/src/lib/waterfall.test.ts` (one existing assertion changes — see Step 5)
- Modify: `dashboard/src/test/fixtures.ts` (add `replaySpanTree`)
- Test: `dashboard/src/components/Waterfall.test.tsx` (append)

**Interfaces:**
- Consumes: `Span`, `SpanNode` from `../types`; `tokens` from `../theme`.
- Produces:
  - `computeWaterfall(roots: SpanNode[]): WaterfallRow[]` — unchanged signature
  - `WaterfallRow { span: Span; depth: number; offsetPct: number; widthPct: number }` — unchanged
  - `MIN_BAR_PX = 3` — **replaces** the removed `MIN_WIDTH_PCT`
  - `replaySpanTree: SpanNode[]` fixture — 4 spans, sub-ms, one untimed

- [ ] **Step 1: Add the replay fixture**

Append to `dashboard/src/test/fixtures.ts`:

```ts
/**
 * A replay-mode trace: four spans inside one millisecond, and a
 * `fact_checker` that carries no timestamp at all. This is the shape that
 * broke the waterfall — it must render four readable bars.
 */
export const replaySpanTree: SpanNode[] = [
  {
    span_id: "r-root",
    trace_id: "tr-replay",
    parent_span_ids: [],
    span_type: "agent_handoff",
    name: "orchestrator",
    start_time: "2026-08-02T10:00:00.000Z",
    end_time: "2026-08-02T10:00:00.001Z",
    latency_ms: 1,
    status: "ok",
    error_message: null,
    metadata: {},
    tags: {},
    children: [
      {
        span_id: "r-search",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "retrieval",
        name: "search",
        start_time: "2026-08-02T10:00:00.000Z",
        end_time: "2026-08-02T10:00:00.000Z",
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
      {
        span_id: "r-summarize",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "llm_call",
        name: "summarize",
        start_time: "2026-08-02T10:00:00.001Z",
        end_time: "2026-08-02T10:00:00.001Z",
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
      {
        // No timestamps at all — the span that used to vanish.
        span_id: "r-fact-checker",
        trace_id: "tr-replay",
        parent_span_ids: ["r-root"],
        span_type: "llm_call",
        name: "fact_checker",
        start_time: null,
        end_time: null,
        latency_ms: 0,
        status: "ok",
        error_message: null,
        metadata: {},
        tags: {},
        children: [],
      },
    ],
  },
];
```

- [ ] **Step 2: Write the failing regression test**

Replace the two existing tests `"gives a zero-duration span the minimum width"` and `"falls back to full width when the window is degenerate"` in `dashboard/src/lib/waterfall.test.ts` with the block below, and update the import on line 2 to `import { computeWaterfall, MIN_BAR_PX } from "./waterfall";`. Add `import { replaySpanTree } from "../test/fixtures";`.

The first of those two tests asserted `widthPct === MIN_WIDTH_PCT`. That assertion **must** change: the floor intentionally moves from a percentage (which scales with container width and therefore guarantees nothing) to a rendered pixel minimum. The second test's expectation is unchanged in value; it is only relocated.

```ts
  it("reports a zero-duration span as zero width, leaving the floor to the renderer", () => {
    const roots = [
      span({ span_id: "a", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:02Z" }),
      span({ span_id: "z", start_time: "2026-06-22T10:00:01Z", end_time: "2026-06-22T10:00:01Z" }),
    ];
    const rows = computeWaterfall(roots);
    // The axis stays linearly truthful; Waterfall.tsx applies MIN_BAR_PX.
    expect(rows.find((r) => r.span.span_id === "z")!.widthPct).toBe(0);
  });

  it("falls back to full width when the window is degenerate", () => {
    const roots = [span({ span_id: "a" })]; // no times
    const rows = computeWaterfall(roots);
    expect(rows[0]).toMatchObject({ offsetPct: 0, widthPct: 100 });
  });

  it("exposes a pixel floor rather than a percentage floor", () => {
    expect(MIN_BAR_PX).toBe(3);
  });

  describe("replay-mode traces (regression: defect 1)", () => {
    it("renders every span, including one with no timestamps", () => {
      const rows = computeWaterfall(replaySpanTree);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.span.name).sort()).toEqual([
        "fact_checker",
        "orchestrator",
        "search",
        "summarize",
      ]);
    });

    it("keeps every bar inside the track", () => {
      // The epoch-coercion bug pushed real spans to offset ~100%, off-screen.
      for (const row of computeWaterfall(replaySpanTree)) {
        expect(row.offsetPct).toBeGreaterThanOrEqual(0);
        expect(row.offsetPct).toBeLessThanOrEqual(100);
        expect(row.widthPct).toBeGreaterThanOrEqual(0);
        expect(row.offsetPct + row.widthPct).toBeLessThanOrEqual(100.0001);
      }
    });

    it("scales against the trace's own duration, not wall-clock epoch", () => {
      const rows = computeWaterfall(replaySpanTree);
      const root = rows.find((r) => r.span.name === "orchestrator")!;
      // The root spans the whole 1ms trace, so it fills the track.
      expect(root.offsetPct).toBe(0);
      expect(root.widthPct).toBeCloseTo(100, 5);
    });

    it("spreads timed spans across the track by their real position", () => {
      const rows = computeWaterfall(replaySpanTree);
      // search at t=0, summarize at t=+1ms of a 1ms window.
      expect(rows.find((r) => r.span.name === "search")!.offsetPct).toBeCloseTo(0, 5);
      expect(rows.find((r) => r.span.name === "summarize")!.offsetPct).toBeCloseTo(100, 5);
    });

    it("anchors an untimed span at the start rather than at the epoch", () => {
      const rows = computeWaterfall(replaySpanTree);
      expect(rows.find((r) => r.span.name === "fact_checker")!.offsetPct).toBe(0);
    });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd dashboard; npx vitest run src/lib/waterfall.test.ts`
Expected: FAIL — `MIN_BAR_PX` is not exported, and the replay cases fail on offsets near 100 for every span.

- [ ] **Step 4: Rewrite `lib/waterfall.ts`**

```ts
import type { Span, SpanNode } from "../types";

/**
 * Minimum *rendered* bar width, in pixels.
 *
 * This is a rendering floor only: the axis stays linearly truthful and the
 * tooltip reports the real duration. A bar at the floor is not proportional,
 * and that is the accepted trade — an invisible span is worse than a
 * slightly overstated one. It is pixels rather than a percentage because a
 * percentage floor scales with container width and so guarantees nothing.
 */
export const MIN_BAR_PX = 3;

export interface WaterfallRow {
  span: Span;
  depth: number;
  offsetPct: number;
  widthPct: number;
}

interface Flat {
  span: Span;
  depth: number;
  /** Null when the span carries no parseable start_time. */
  start: number | null;
  end: number | null;
}

function parse(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function spanEnd(s: Span, start: number | null): number | null {
  const end = parse(s.end_time);
  if (end !== null) return end;
  if (start !== null && s.latency_ms !== null) return start + s.latency_ms;
  return start;
}

function flatten(roots: SpanNode[]): Flat[] {
  const byId = new Map<string, Flat>();
  const visit = (node: SpanNode, depth: number) => {
    const start = parse(node.start_time);
    const existing = byId.get(node.span_id);
    if (!existing || depth > existing.depth) {
      const { children: _children, ...span } = node;
      // NOTE: start/end stay null when unknown. Coercing them to 0 was the
      // defect — one untimed span dragged the window back to the Unix epoch,
      // collapsing every real bar to a speck at the far right of the track.
      byId.set(node.span_id, {
        span: span as Span,
        depth,
        start,
        end: spanEnd(node, start),
      });
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return [...byId.values()];
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Lay spans out against the trace's own extent.
 *
 * Spans without a timestamp anchor at the start of the track with zero
 * width; the renderer's pixel floor keeps them visible. When no span has a
 * usable timestamp at all, or every span shares one instant, bars are laid
 * out in equal sequence so each stays distinguishable — the tooltip carries
 * the real (near-zero) durations.
 */
export function computeWaterfall(roots: SpanNode[]): WaterfallRow[] {
  const flats = flatten(roots);
  if (flats.length === 0) return [];

  const timed = flats.filter((f): f is Flat & { start: number } => f.start !== null);
  const starts = timed.map((f) => f.start);
  const ends = timed.map((f) => f.end ?? f.start);
  const min = starts.length ? Math.min(...starts) : 0;
  const max = ends.length ? Math.max(...ends) : 0;
  const window = max - min;

  const ordered = [...flats].sort(
    (a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.depth - b.depth,
  );

  if (!Number.isFinite(window) || window <= 0) {
    const share = 100 / ordered.length;
    return ordered.map((f, i) => ({
      span: f.span,
      depth: f.depth,
      offsetPct: ordered.length === 1 ? 0 : i * share,
      widthPct: ordered.length === 1 ? 100 : share,
    }));
  }

  return ordered.map((f) => {
    const start = f.start ?? min;
    const end = f.end ?? start;
    const offsetPct = clamp(((start - min) / window) * 100, 0, 100);
    const widthPct = clamp(((end - start) / window) * 100, 0, 100 - offsetPct);
    return { span: f.span, depth: f.depth, offsetPct, widthPct };
  });
}
```

- [ ] **Step 5: Run the lib test to verify it passes**

Run: `cd dashboard; npx vitest run src/lib/waterfall.test.ts`
Expected: PASS, all cases including the four original ones.

- [ ] **Step 6: Apply the pixel floor and tokens in the component**

Rewrite `dashboard/src/components/Waterfall.tsx`:

```tsx
import { Box, Tooltip, Typography } from "@mui/material";
import { computeWaterfall, MIN_BAR_PX } from "../lib/waterfall";
import { spanColor, formatDuration } from "../lib/format";
import { tokens } from "../theme";
import type { Span, SpanNode } from "../types";

const ROW_HEIGHT = 28;
const BAR_INSET = 8;

export function Waterfall({
  roots,
  onSelect,
}: {
  roots: SpanNode[];
  onSelect: (span: Span) => void;
}) {
  const rows = computeWaterfall(roots);
  return (
    <Box sx={{ width: "100%" }}>
      {rows.map((row) => (
        <Box
          key={row.span.span_id}
          sx={{
            display: "flex",
            alignItems: "center",
            height: ROW_HEIGHT,
            pl: `${row.depth * 16}px`,
          }}
        >
          <Box sx={{ position: "relative", flexGrow: 1, height: "100%" }}>
            <Tooltip
              title={`${row.span.name} · ${formatDuration(row.span.latency_ms)}`}
            >
              <Box
                role="button"
                data-testid={`waterfall-bar-${row.span.span_id}`}
                onClick={() => onSelect(row.span)}
                sx={{
                  position: "absolute",
                  left: `${row.offsetPct}%`,
                  width: `${row.widthPct}%`,
                  // Rendering floor: a near-zero span stays clickable and
                  // visible. The axis above is still linearly truthful.
                  minWidth: `${MIN_BAR_PX}px`,
                  top: 4,
                  height: ROW_HEIGHT - BAR_INSET,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: spanColor(row.span.span_type),
                  outline:
                    row.span.status === "error"
                      ? `2px solid ${tokens.status.fail.solid}`
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  px: 1,
                  overflow: "hidden",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: tokens.onFill, whiteSpace: "nowrap", fontWeight: 500 }}
                >
                  {row.span.name}
                </Typography>
              </Box>
            </Tooltip>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 7: Add the component regression test**

Append to `dashboard/src/components/Waterfall.test.tsx`, adding `replaySpanTree` to the fixtures import on line 4:

```tsx
describe("Waterfall — replay-mode traces (regression: defect 1)", () => {
  it("renders all four spans, fact_checker included", () => {
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={() => {}} />);
    expect(screen.getByText("orchestrator")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("summarize")).toBeInTheDocument();
    expect(screen.getByText("fact_checker")).toBeInTheDocument();
  });

  it("gives every bar a 3px minimum rendered width", () => {
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={() => {}} />);
    for (const id of ["r-root", "r-search", "r-summarize", "r-fact-checker"]) {
      expect(screen.getByTestId(`waterfall-bar-${id}`)).toHaveStyle({
        minWidth: "3px",
      });
    }
  });

  it("keeps a near-zero span clickable", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("fact_checker"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ span_id: "r-fact-checker" }),
    );
  });
});
```

- [ ] **Step 8: Run the full suite**

Run: `cd dashboard; npm test`
Expected: PASS. `TraceDetailPage.test.tsx` exercises the waterfall too and must stay green.

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/lib/waterfall.ts dashboard/src/lib/waterfall.test.ts dashboard/src/components/Waterfall.tsx dashboard/src/components/Waterfall.test.tsx dashboard/src/test/fixtures.ts
git commit -m "fix(dashboard): scale waterfall against the trace's own extent, 3px bar floor"
```

---

### Task 5: `AppShell` left rail

**Files:**
- Modify: `dashboard/src/components/AppShell.tsx`
- Modify: `dashboard/src/components/AppShell.test.tsx` (append)
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx` (one existing assertion changes)

**Interfaces:**
- Consumes: `useProjects`, `useProject`, `tokens`, `SPACE`.
- Produces: `AppShell` — same props (`{ children: ReactNode }`). Nav is a persistent left rail at identical placement on every route, with an added **Overview** link to `/`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/src/components/AppShell.test.tsx`:

```tsx
describe("AppShell left rail", () => {
  it("shows Overview first in the rail", async () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/" });
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
  });

  it("marks Overview current only on the index route", () => {
    const { unmount } = renderWithProviders(
      <AppShell><div>content</div></AppShell>, { route: "/" },
    );
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current", "page",
    );
    unmount();

    // "/" is a prefix of every path — a startsWith match would light it up
    // on /traces too.
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Traces" })).toHaveAttribute(
      "aria-current", "page",
    );
  });

  it("keeps the project switcher reachable from the rail", async () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
  });
});
```

In `dashboard/src/App.test.tsx`, replace the single existing test. The old assertion `"renders the shell and redirects to traces"` is asserting the redirect that the spec removes — behaviour intentionally changed:

Replace the whole file with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/utils";
import { sampleTraces, sampleSummary, sampleSpanTree } from "./test/fixtures";
import * as api from "./api/client";
import App from "./App";

// The index route renders the Overview, which fetches on mount. Without
// these, jsdom attempts real network calls and the suite fills with noise.
beforeEach(() => {
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 200, offset: 0,
  });
  vi.spyOn(api, "getEvalSummary").mockResolvedValue(sampleSummary);
  vi.spyOn(api, "getTraceTree").mockResolvedValue(sampleSpanTree);
});
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("renders the shell and lands on the overview", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByText("AgentProof")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });
});
```

`getByText("AgentProof")` still resolves to exactly one element: the rail splits the brand into `Agent` plus a `<span>Proof</span>`, and only the outer `Typography` has `textContent === "AgentProof"`. If it does report multiple matches, scope it: `getByText("AgentProof", { selector: "h6" })`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard; npx vitest run src/components/AppShell.test.tsx src/App.test.tsx`
Expected: FAIL — no "Overview" link.

- [ ] **Step 3: Rewrite `AppShell.tsx`**

```tsx
import { ReactNode } from "react";
import {
  Box, Drawer, List, ListItemButton, ListItemText, MenuItem, Select, Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useProjects } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { tokens, SPACE } from "../theme";

const NAV = [
  { label: "Overview", to: "/", exact: true },
  { label: "Traces", to: "/traces", exact: false },
  { label: "Evals", to: "/evals", exact: false },
  { label: "Security", to: "/security", exact: false },
];

const RAIL_WIDTH = 208;

function isCurrent(pathname: string, to: string, exact: boolean): boolean {
  // "/" is a prefix of every path, so the index link needs an exact match.
  return exact ? pathname === to : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { project, setProject } = useProject();
  const projects = useProjects();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: tokens.bg }}>
      <Drawer
        variant="permanent"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: RAIL_WIDTH,
            boxSizing: "border-box",
            bgcolor: tokens.surface,
            borderRight: `1px solid ${tokens.border}`,
            borderRadius: 0,
            px: `${SPACE.xs}px`,
            py: `${SPACE.md}px`,
            gap: `${SPACE.md}px`,
          },
        }}
      >
        <Typography
          variant="h6"
          sx={{ px: `${SPACE.xs}px`, color: tokens.ink, letterSpacing: "-0.01em" }}
        >
          Agent<Box component="span" sx={{ color: tokens.brand.text }}>Proof</Box>
        </Typography>

        <List sx={{ display: "flex", flexDirection: "column", gap: "2px", py: 0 }}>
          {NAV.map((item) => {
            const current = isCurrent(pathname, item.to, item.exact);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={current}
                aria-current={current ? "page" : undefined}
                sx={{ py: "6px" }}
              >
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ mt: "auto", px: `${SPACE.xs}px` }}>
          <Typography
            variant="caption"
            sx={{ color: tokens.muted, display: "block", mb: "4px" }}
          >
            Project
          </Typography>
          <Select
            size="small"
            displayEmpty
            fullWidth
            value={project ?? ""}
            onChange={(e) => setProject(e.target.value || undefined)}
            inputProps={{ "aria-label": "Project" }}
            sx={{ bgcolor: tokens.bg }}
          >
            <MenuItem value="">All projects</MenuItem>
            {(projects.data ?? []).map((p) => (
              <MenuItem key={p} value={p}>{p}</MenuItem>
            ))}
          </Select>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: `${SPACE.lg}px`, minWidth: 0, bgcolor: tokens.bg }}
      >
        {children}
      </Box>
    </Box>
  );
}
```

`minWidth: 0` on the main box is what stops a wide `DataGrid` forcing horizontal scroll on the page body — the Playwright check in Task 14 asserts this.

The existing test asserts `screen.getByText("AgentProof")`. The brand is now split across two elements, so that query would fail. `getByText` with a string matches against an element's full `textContent`, and the outer `Typography` still reads exactly `AgentProof` — it passes. Verify in Step 5; if it does not, use `getByText("AgentProof", { selector: "h6" })`.

- [ ] **Step 4: Point `/` at the Overview route**

In `dashboard/src/App.tsx`, replace lines 1-20 with:

```tsx
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { TracesPage } from "./pages/TracesPage";
import { TraceDetailPage } from "./pages/TraceDetailPage";
import { EvalsPage } from "./pages/EvalsPage";
import { SecurityPage } from "./pages/SecurityPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/traces" element={<TracesPage />} />
        <Route path="/traces/:traceId" element={<TraceDetailPage />} />
        <Route path="/evals" element={<EvalsPage />} />
        <Route path="/security" element={<SecurityPage />} />
      </Routes>
    </AppShell>
  );
}
```

`OverviewPage` does not exist until Task 9. Create a placeholder now so `tsc` and the suite stay green between tasks — Task 9 replaces its whole body:

```tsx
// dashboard/src/pages/OverviewPage.tsx
import { Box, Typography } from "@mui/material";

export function OverviewPage() {
  return (
    <Box>
      <Typography variant="h5">Overview</Typography>
    </Box>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dashboard; npm test`
Expected: PASS, whole suite.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/AppShell.tsx dashboard/src/components/AppShell.test.tsx dashboard/src/App.tsx dashboard/src/App.test.tsx dashboard/src/pages/OverviewPage.tsx
git commit -m "feat(dashboard): persistent left rail and overview route"
```

---

### Task 6: `StatTile` and `EmptyState`

**Files:**
- Create: `dashboard/src/components/StatTile.tsx`
- Create: `dashboard/src/components/StatTile.test.tsx`
- Create: `dashboard/src/components/EmptyState.tsx`
- Create: `dashboard/src/components/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `tokens`, `TILE_PADDING`, `TABULAR_NUMS` from `../theme`.
- Produces:
  - `StatTile({ label, value, sublabel, tone }: { label: string; value: string; sublabel?: string; tone?: "neutral" | "pass" | "fail" | "warn" })`
  - `EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode })`

- [ ] **Step 1: Write the failing tests**

`dashboard/src/components/StatTile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { tokens } from "../theme";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders the label, value and sublabel", () => {
    renderWithProviders(
      <StatTile label="p99 latency" value="1.82 s" sublabel="247 traces" />,
    );
    expect(screen.getByText("p99 latency")).toBeInTheDocument();
    expect(screen.getByText("1.82 s")).toBeInTheDocument();
    expect(screen.getByText("247 traces")).toBeInTheDocument();
  });

  it("omits the sublabel element when none is given", () => {
    renderWithProviders(<StatTile label="Gate" value="PASS" />);
    expect(screen.queryByTestId("stat-tile-sublabel")).not.toBeInTheDocument();
  });

  it("colours the value by tone", () => {
    renderWithProviders(<StatTile label="Gate" value="PASS" tone="pass" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      color: tokens.status.pass,
    });
  });

  it("uses ink for the neutral tone", () => {
    renderWithProviders(<StatTile label="Traces" value="247" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      color: tokens.ink,
    });
  });

  it("renders the value with tabular numerals", () => {
    renderWithProviders(<StatTile label="Traces" value="247" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      fontVariantNumeric: "tabular-nums",
    });
  });
});
```

`dashboard/src/components/EmptyState.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders guidance rather than an error", () => {
    renderWithProviders(
      <EmptyState
        title="No traces yet"
        body="Run the demo agent to populate this view."
      />,
    );
    expect(screen.getByText("No traces yet")).toBeInTheDocument();
    expect(screen.getByText(/run the demo agent/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders an action when one is given", () => {
    renderWithProviders(
      <EmptyState title="t" body="b" action={<button>Do the thing</button>} />,
    );
    expect(screen.getByRole("button", { name: "Do the thing" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd dashboard; npx vitest run src/components/StatTile.test.tsx src/components/EmptyState.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `StatTile.tsx`**

```tsx
import { Box, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";

export type Tone = "neutral" | "pass" | "fail" | "warn";

/** The one tone->colour map. Imported by anything that renders a verdict. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: tokens.ink,
  pass: tokens.status.pass,
  fail: tokens.status.fail.text,
  warn: tokens.status.warn,
};

/** A small bento tile: one figure, its label, and optional context beneath. */
export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: Tone;
}) {
  return (
    <Box
      sx={{
        height: "100%",
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 2.5,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </Typography>
      <Typography
        data-testid="stat-tile-value"
        variant="h5"
        sx={{ color: TONE_COLOR[tone], ...TABULAR_NUMS }}
      >
        {value}
      </Typography>
      {sublabel && (
        <Typography
          data-testid="stat-tile-sublabel"
          variant="body2"
          sx={{ color: tokens.muted, ...TABULAR_NUMS }}
        >
          {sublabel}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Write `EmptyState.tsx`**

```tsx
import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { tokens, SPACE } from "../theme";

/** Guidance for a view with no data. Deliberately not an error. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: `${SPACE.xl}px`,
        textAlign: "center",
        border: `1px dashed ${tokens.border}`,
        borderRadius: 2.5,
        bgcolor: tokens.surface,
      }}
    >
      <Typography variant="subtitle1" sx={{ color: tokens.ink, mb: "4px" }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.muted }}>
        {body}
      </Typography>
      {action && <Box sx={{ mt: `${SPACE.md}px` }}>{action}</Box>}
    </Box>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd dashboard; npx vitest run src/components/StatTile.test.tsx src/components/EmptyState.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/StatTile.tsx dashboard/src/components/StatTile.test.tsx dashboard/src/components/EmptyState.tsx dashboard/src/components/EmptyState.test.tsx
git commit -m "feat(dashboard): StatTile and EmptyState primitives"
```

---

### Task 7: Overview derivations and `VerdictTile`

The security tile leads because adversarial resistance is what separates AgentProof from a telemetry tool. All the logic lives in pure functions so it can be tested without rendering.

**Files:**
- Create: `dashboard/src/lib/overview.ts`
- Create: `dashboard/src/lib/overview.test.ts`
- Create: `dashboard/src/components/VerdictTile.tsx`
- Create: `dashboard/src/components/VerdictTile.test.tsx`

**Interfaces:**
- Consumes: `EvalSummary`, `EvalSummaryMetric` from `../types`; `StatTile`'s `Tone`; `tokens`.
- Produces:
  - `SECURITY_METRIC_NAMES: readonly string[]` — `["injection_resistance", "data_exfiltration", "tool_misuse"]`
  - `metricByName(summary: EvalSummary | undefined, name: string): EvalSummaryMetric | undefined`
  - `isHeld(metric: EvalSummaryMetric): boolean` — a metric is held when nothing on record failed it
  - `gateStatus(summary): { passed: boolean; held: number; total: number; label: string }`
  - `securityVerdict(summary): { tone: Tone; headline: string }`
  - `formatScore(value: number | null): string`
  - `formatPct(value: number | null): string`
  - `VerdictTile({ summary }: { summary: EvalSummary | undefined })`

- [ ] **Step 1: Write the failing test**

`dashboard/src/lib/overview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  formatPct,
  formatScore,
  gateStatus,
  isHeld,
  metricByName,
  securityVerdict,
} from "./overview";
import { sampleSummary, emptySummary } from "../test/fixtures";
import type { EvalSummary, EvalSummaryMetric } from "../types";

function metric(partial: Partial<EvalSummaryMetric> & { metric_name: string }): EvalSummaryMetric {
  return {
    mean_score: 1,
    pass_rate: 1,
    count: 10,
    last_evaluated_at: "2026-08-02T10:00:00.000Z",
    ...partial,
  };
}

function summary(metrics: EvalSummaryMetric[]): EvalSummary {
  return { project: "demo", trace_count: 10, overall_pass_rate: 1, p99_latency_ms: 100, metrics };
}

describe("isHeld", () => {
  it("holds when nothing on record failed", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: 1 }))).toBe(true);
  });

  it("does not hold on a single failure", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: 0.99 }))).toBe(false);
  });

  it("does not hold when the pass rate is unknown", () => {
    expect(isHeld(metric({ metric_name: "a", pass_rate: null }))).toBe(false);
  });
});

describe("gateStatus", () => {
  it("passes only when every metric held", () => {
    const g = gateStatus(summary([metric({ metric_name: "a" }), metric({ metric_name: "b" })]));
    expect(g).toMatchObject({ passed: true, held: 2, total: 2, label: "2/2 held" });
  });

  it("fails when any metric regressed", () => {
    const g = gateStatus(
      summary([metric({ metric_name: "a" }), metric({ metric_name: "b", pass_rate: 0.5 })]),
    );
    expect(g).toMatchObject({ passed: false, held: 1, total: 2, label: "1/2 held" });
  });

  it("does not claim a pass with no metrics at all", () => {
    expect(gateStatus(emptySummary)).toMatchObject({ passed: false, held: 0, total: 0 });
  });

  it("tolerates an undefined summary", () => {
    expect(gateStatus(undefined)).toMatchObject({ passed: false, held: 0, total: 0 });
  });
});

describe("securityVerdict", () => {
  it("reports resistance holding when every security metric held", () => {
    const v = securityVerdict(
      summary([
        metric({ metric_name: "injection_resistance" }),
        metric({ metric_name: "data_exfiltration" }),
      ]),
    );
    expect(v.tone).toBe("pass");
    expect(v.headline).toMatch(/held/i);
  });

  it("names the failing metric when one regressed", () => {
    const v = securityVerdict(
      summary([
        metric({ metric_name: "injection_resistance", pass_rate: 0.4 }),
        metric({ metric_name: "data_exfiltration" }),
      ]),
    );
    expect(v.tone).toBe("fail");
    expect(v.headline).toContain("injection_resistance");
  });

  it("stays neutral when no security metric has run", () => {
    const v = securityVerdict(summary([metric({ metric_name: "answer_relevance" })]));
    expect(v.tone).toBe("neutral");
    expect(v.headline).toMatch(/no security/i);
  });

  it("stays neutral for an empty project", () => {
    expect(securityVerdict(emptySummary).tone).toBe("neutral");
  });
});

describe("metricByName", () => {
  it("finds a metric in the summary", () => {
    expect(metricByName(sampleSummary, "data_exfiltration")?.count).toBe(247);
  });

  it("returns undefined for an absent metric or summary", () => {
    expect(metricByName(sampleSummary, "nope")).toBeUndefined();
    expect(metricByName(undefined, "data_exfiltration")).toBeUndefined();
  });
});

describe("formatters", () => {
  it("renders scores to two places and null as an em dash", () => {
    expect(formatScore(0.9)).toBe("0.90");
    expect(formatScore(null)).toBe("—");
  });

  it("renders percentages as whole numbers and null as an em dash", () => {
    expect(formatPct(0.94)).toBe("94%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/lib/overview.test.ts`
Expected: FAIL — cannot resolve `./overview`.

- [ ] **Step 3: Write `lib/overview.ts`**

```ts
import type { EvalSummary, EvalSummaryMetric } from "../types";
import type { Tone } from "../components/StatTile";

/** Metric names the eval config treats as security metrics. */
export const SECURITY_METRIC_NAMES = [
  "injection_resistance",
  "data_exfiltration",
  "tool_misuse",
] as const;

export function metricByName(
  summary: EvalSummary | undefined,
  name: string,
): EvalSummaryMetric | undefined {
  return summary?.metrics.find((m) => m.metric_name === name);
}

/**
 * A metric is "held" when nothing on record failed it.
 *
 * An unknown pass rate is not a hold — absence of evidence is not evidence
 * that the metric held.
 */
export function isHeld(metric: EvalSummaryMetric): boolean {
  return metric.pass_rate === 1;
}

export function gateStatus(summary: EvalSummary | undefined): {
  passed: boolean;
  held: number;
  total: number;
  label: string;
} {
  const metrics = summary?.metrics ?? [];
  const held = metrics.filter(isHeld).length;
  const total = metrics.length;
  // No metrics is not a pass — there is nothing to have held.
  return { passed: total > 0 && held === total, held, total, label: `${held}/${total} held` };
}

export function securityVerdict(summary: EvalSummary | undefined): {
  tone: Tone;
  headline: string;
} {
  const security = (summary?.metrics ?? []).filter((m) =>
    (SECURITY_METRIC_NAMES as readonly string[]).includes(m.metric_name),
  );
  if (security.length === 0) {
    return {
      tone: "neutral",
      headline: "No security metrics have run against this project yet.",
    };
  }
  const regressed = security.filter((m) => !isHeld(m));
  if (regressed.length === 0) {
    return {
      tone: "pass",
      headline: `Adversarial resistance held across ${security.length} security ${
        security.length === 1 ? "metric" : "metrics"
      }.`,
    };
  }
  const names = regressed.map((m) => m.metric_name).join(", ");
  return {
    tone: "fail",
    headline: `${names} regressed — the agent gave ground under attack.`,
  };
}

export function formatScore(value: number | null): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function formatPct(value: number | null): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/lib/overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the `VerdictTile` test**

`dashboard/src/components/VerdictTile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSummary, emptySummary } from "../test/fixtures";
import { VerdictTile } from "./VerdictTile";

describe("VerdictTile", () => {
  it("leads with the headline finding", () => {
    renderWithProviders(<VerdictTile summary={sampleSummary} />);
    expect(screen.getByTestId("verdict-headline")).toBeInTheDocument();
  });

  it("shows resistance and exfiltration scores", () => {
    renderWithProviders(<VerdictTile summary={sampleSummary} />);
    expect(screen.getByText("Injection resistance")).toBeInTheDocument();
    expect(screen.getByText("Data exfiltration")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });

  it("renders guidance rather than an error for an empty project", () => {
    renderWithProviders(<VerdictTile summary={emptySummary} />);
    expect(screen.getByText(/no security metrics/i)).toBeInTheDocument();
  });

  it("survives an undefined summary while loading", () => {
    renderWithProviders(<VerdictTile summary={undefined} />);
    expect(screen.getByTestId("verdict-headline")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/components/VerdictTile.test.tsx`
Expected: FAIL — cannot resolve `./VerdictTile`.

- [ ] **Step 7: Write `VerdictTile.tsx`**

```tsx
import { Box, Stack, Typography } from "@mui/material";
import { tokens, TILE_PADDING, TABULAR_NUMS } from "../theme";
import { formatScore, metricByName, securityVerdict } from "../lib/overview";
import { TONE_COLOR } from "./StatTile";
import type { Tone } from "./StatTile";
import type { EvalSummary } from "../types";

/**
 * Neutral means "nothing has run yet" here, so the headline recedes rather
 * than reading as a result. Every other tone uses the shared map.
 */
function verdictColor(tone: Tone): string {
  return tone === "neutral" ? tokens.muted : TONE_COLOR[tone];
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant="body2" sx={{ color: tokens.muted }}>{label}</Typography>
      <Typography variant="subtitle1" sx={{ color: tokens.ink, ...TABULAR_NUMS }}>
        {formatScore(value)}
      </Typography>
    </Stack>
  );
}

/**
 * The 2x2 headline tile. Security leads the overview because adversarial
 * resistance is what separates AgentProof from a telemetry tool.
 */
export function VerdictTile({ summary }: { summary: EvalSummary | undefined }) {
  const verdict = securityVerdict(summary);
  const injection = metricByName(summary, "injection_resistance");
  const exfiltration = metricByName(summary, "data_exfiltration");

  return (
    <Box
      sx={{
        height: "100%",
        p: `${TILE_PADDING}px`,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderLeft: `2px solid ${verdictColor(verdict.tone)}`,
        borderRadius: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: tokens.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Security verdict
      </Typography>

      <Typography
        data-testid="verdict-headline"
        variant="h6"
        sx={{ color: verdictColor(verdict.tone), lineHeight: 1.35 }}
      >
        {verdict.headline}
      </Typography>

      <Stack spacing={1} sx={{ mt: "auto" }}>
        <ScoreRow label="Injection resistance" value={injection?.mean_score ?? null} />
        <ScoreRow label="Data exfiltration" value={exfiltration?.mean_score ?? null} />
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/components/VerdictTile.test.tsx src/lib/overview.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/lib/overview.ts dashboard/src/lib/overview.test.ts dashboard/src/components/VerdictTile.tsx dashboard/src/components/VerdictTile.test.tsx
git commit -m "feat(dashboard): overview derivations and security verdict tile"
```

---

### Task 8: `MiniWaterfall`

**Files:**
- Create: `dashboard/src/components/MiniWaterfall.tsx`
- Create: `dashboard/src/components/MiniWaterfall.test.tsx`

**Interfaces:**
- Consumes: `computeWaterfall`, `MIN_BAR_PX` from `../lib/waterfall`; `spanColor` from `../lib/format`; `tokens`.
- Produces: `MiniWaterfall({ roots }: { roots: SpanNode[] })` — a single compact track with span names listed beneath. Non-interactive by design; the full waterfall lives on the trace page.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree, replaySpanTree } from "../test/fixtures";
import { MiniWaterfall } from "./MiniWaterfall";

describe("MiniWaterfall", () => {
  it("draws one bar per span on a single track", () => {
    renderWithProviders(<MiniWaterfall roots={sampleSpanTree} />);
    expect(screen.getAllByTestId(/^mini-bar-/)).toHaveLength(3);
  });

  it("lists the span names beneath the track", () => {
    renderWithProviders(<MiniWaterfall roots={sampleSpanTree} />);
    expect(screen.getByText("orchestrator")).toBeInTheDocument();
    expect(screen.getByText("retrieve")).toBeInTheDocument();
    expect(screen.getByText("generate")).toBeInTheDocument();
  });

  it("stays readable for a sub-millisecond replay trace", () => {
    renderWithProviders(<MiniWaterfall roots={replaySpanTree} />);
    const bars = screen.getAllByTestId(/^mini-bar-/);
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar).toHaveStyle({ minWidth: "3px" });
  });

  it("renders nothing for a trace with no spans", () => {
    const { container } = renderWithProviders(<MiniWaterfall roots={[]} />);
    expect(container.querySelectorAll('[data-testid^="mini-bar-"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/components/MiniWaterfall.test.tsx`
Expected: FAIL — cannot resolve `./MiniWaterfall`.

- [ ] **Step 3: Write `MiniWaterfall.tsx`**

```tsx
import { Box, Stack, Typography } from "@mui/material";
import { computeWaterfall, MIN_BAR_PX } from "../lib/waterfall";
import { spanColor } from "../lib/format";
import { tokens } from "../theme";
import type { SpanNode } from "../types";

const TRACK_HEIGHT = 28;

/**
 * A compact, non-interactive waterfall for the overview's latest-trace tile.
 * Every span shares one track; names are listed beneath rather than inside
 * the bars, which is what keeps it legible at this height.
 */
export function MiniWaterfall({ roots }: { roots: SpanNode[] }) {
  const rows = computeWaterfall(roots);
  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          position: "relative",
          height: TRACK_HEIGHT,
          bgcolor: tokens.bg,
          border: `1px solid ${tokens.border}`,
          borderRadius: 1.5,
          overflow: "hidden",
        }}
      >
        {rows.map((row) => (
          <Box
            key={row.span.span_id}
            data-testid={`mini-bar-${row.span.span_id}`}
            sx={{
              position: "absolute",
              left: `${row.offsetPct}%`,
              width: `${row.widthPct}%`,
              minWidth: `${MIN_BAR_PX}px`,
              top: 4,
              height: TRACK_HEIGHT - 8,
              borderRadius: 0.75,
              bgcolor: spanColor(row.span.span_type),
            }}
          />
        ))}
      </Box>
      <Stack direction="row" flexWrap="wrap" sx={{ mt: 1, gap: "4px 12px" }}>
        {rows.map((row) => (
          <Stack
            key={row.span.span_id}
            direction="row"
            alignItems="center"
            spacing={0.75}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "2px",
                bgcolor: spanColor(row.span.span_type),
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: tokens.muted }}>
              {row.span.name}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/components/MiniWaterfall.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/MiniWaterfall.tsx dashboard/src/components/MiniWaterfall.test.tsx
git commit -m "feat(dashboard): compact mini waterfall for the overview"
```

---

### Task 9: The Overview page

Replaces the Task 5 placeholder. Bento grid where tile size encodes importance.

**Files:**
- Modify: `dashboard/src/pages/OverviewPage.tsx` (full rewrite)
- Create: `dashboard/src/pages/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: `useEvalSummary`, `useTraces`, `useTraceTree`; `VerdictTile`, `StatTile`, `MiniWaterfall`, `EmptyState`, `QueryBoundary`; `gateStatus`, `formatPct`; `formatDuration`; `useProject`.
- Produces: `OverviewPage()` — default route at `/`.

Layout, per the spec: 3 columns at ≥1024px, 2 at ≥768px, 1 below. The verdict tile is 2×2 and becomes full-width at the smallest breakpoint rather than shrinking.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import {
  sampleSummary,
  emptySummary,
  sampleTraces,
  sampleSpanTree,
} from "../test/fixtures";
import * as api from "../api/client";
import { OverviewPage } from "./OverviewPage";

beforeEach(() => {
  vi.spyOn(api, "getEvalSummary").mockResolvedValue(sampleSummary);
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 1, offset: 0,
  });
  vi.spyOn(api, "getTraceTree").mockResolvedValue(sampleSpanTree);
});
afterEach(() => vi.restoreAllMocks());

describe("OverviewPage", () => {
  it("leads with the security verdict", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByTestId("verdict-headline")).toBeInTheDocument());
    expect(screen.getByText("Security verdict")).toBeInTheDocument();
  });

  it("shows the gate, p99 latency and trace count", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText("Gate")).toBeInTheDocument());
    // sampleSummary: injection held, exfiltration and relevance did not.
    expect(screen.getByText("1/3 held")).toBeInTheDocument();
    expect(screen.getByText("p99 latency")).toBeInTheDocument();
    expect(screen.getByText("1.82 s")).toBeInTheDocument();
    expect(screen.getByText("247 traces")).toBeInTheDocument();
  });

  it("renders a mini waterfall for the latest trace", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getAllByTestId(/^mini-bar-/).length).toBe(3));
  });

  it("renders guidance, not an error, for a fresh install", async () => {
    vi.spyOn(api, "getEvalSummary").mockResolvedValue(emptySummary);
    vi.spyOn(api, "listTraces").mockResolvedValue({ traces: [], total: 0, limit: 1, offset: 0 });
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText(/no traces yet/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks the API for the summary", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(api.getEvalSummary).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/pages/OverviewPage.test.tsx`
Expected: FAIL — the placeholder renders only the word "Overview".

- [ ] **Step 3: Write `OverviewPage.tsx`**

```tsx
import { Box, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useEvalSummary, useTraces, useTraceTree } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { QueryBoundary } from "../components/QueryBoundary";
import { VerdictTile } from "../components/VerdictTile";
import { StatTile } from "../components/StatTile";
import { MiniWaterfall } from "../components/MiniWaterfall";
import { EmptyState } from "../components/EmptyState";
import { gateStatus, formatPct } from "../lib/overview";
import { formatDuration } from "../lib/format";
import { tokens, TILE_GAP, TILE_PADDING, SPACE } from "../theme";

/**
 * Bento overview. Tile size encodes importance: the security verdict gets
 * 2x2, latency and the gate get 1x1. The 2x2 goes full-width at the smallest
 * breakpoint rather than shrinking into illegibility.
 */
export function OverviewPage() {
  const { project } = useProject();
  const summary = useEvalSummary(project);
  const latest = useTraces({ project, limit: 1 });
  const latestTrace = latest.data?.traces[0];
  const tree = useTraceTree(latestTrace?.trace_id ?? "");

  const gate = gateStatus(summary.data);
  const isEmpty =
    !summary.isLoading &&
    (summary.data?.trace_count ?? 0) === 0 &&
    (latest.data?.traces.length ?? 0) === 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ color: tokens.ink, mb: "4px" }}>
        Overview
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.muted, mb: `${SPACE.lg}px` }}>
        {project ?? "All projects"}
      </Typography>

      <QueryBoundary
        isLoading={summary.isLoading || latest.isLoading}
        isError={summary.isError || latest.isError}
        isEmpty={isEmpty}
        emptyMessage="No traces yet — run the demo agent, or POST a trace to /api/v1/traces."
        onRetry={() => {
          summary.refetch();
          latest.refetch();
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: `${TILE_GAP}px`,
            gridTemplateColumns: {
              xs: "repeat(1, 1fr)",
              sm: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },
          }}
        >
          <Box
            sx={{
              gridColumn: { xs: "span 1", sm: "span 2" },
              gridRow: { xs: "auto", sm: "span 2" },
              minHeight: { sm: 240 },
            }}
          >
            <VerdictTile summary={summary.data} />
          </Box>

          <StatTile
            label="Gate"
            value={gate.passed ? "PASS" : "FAIL"}
            sublabel={gate.label}
            tone={gate.passed ? "pass" : "fail"}
          />

          <StatTile
            label="p99 latency"
            value={formatDuration(summary.data?.p99_latency_ms ?? null)}
            sublabel={`${summary.data?.trace_count ?? 0} traces`}
          />

          <StatTile
            label="Overall pass rate"
            value={formatPct(summary.data?.overall_pass_rate ?? null)}
            sublabel={`${summary.data?.metrics.length ?? 0} metrics`}
          />

          <Box
            sx={{
              gridColumn: "1 / -1",
              p: `${TILE_PADDING}px`,
              bgcolor: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: 2.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: tokens.muted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                mb: 1,
              }}
            >
              Latest trace
            </Typography>
            {latestTrace ? (
              <>
                <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                  <Box
                    component={RouterLink}
                    to={`/traces/${latestTrace.trace_id}`}
                    sx={{ color: tokens.brand.text, textDecoration: "none" }}
                  >
                    {latestTrace.name}
                  </Box>
                </Typography>
                <MiniWaterfall roots={tree.data ?? []} />
              </>
            ) : (
              <EmptyState
                title="No traces yet"
                body="Run the demo agent to populate this view."
              />
            )}
          </Box>
        </Box>
      </QueryBoundary>
    </Box>
  );
}
```

Two empty states are in play and they are not redundant. `QueryBoundary`'s `emptyMessage` covers a *fresh install* — no traces at all. The `EmptyState` inside the latest-trace tile covers a project that has eval history but no trace to draw, which is why the tile still renders its own guidance.

- [ ] **Step 4: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/pages/OverviewPage.test.tsx`
Expected: PASS.

If `"1/3 held"` fails, check `sampleSummary` — `injection_resistance` has `pass_rate: 1.0`, the other two do not, so 1 of 3 held. If `"1.82 s"` fails, `formatDuration(1820)` returns `"1.82 s"`; confirm the fixture's `p99_latency_ms` is `1820`.

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `cd dashboard; npm test`
Run: `cd dashboard; npx tsc -b; npx eslint . --ext ts,tsx`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/OverviewPage.tsx dashboard/src/pages/OverviewPage.test.tsx
git commit -m "feat(dashboard): bento overview page"
```

---

### Task 10: Defect 2 — eval timeseries x-axis spans four seconds

**Root cause.** `seriesFromResults` uses `Date.parse(r.evaluated_at)` as the x value and the chart uses `scaleType: "time"`. A batch export writes every trace's results within the same few seconds, so the axis compresses the entire history into a four-second window.

**Fix.** Plot against run index. The timestamp moves to the tooltip.

**Files:**
- Modify: `dashboard/src/components/ScoreTimeseries.tsx`
- Modify: `dashboard/src/components/ScoreTimeseries.test.tsx` (append)
- Modify: `dashboard/src/test/fixtures.ts` (add `batchEvalResults`)

**Interfaces:**
- Consumes: `EvalResult`, `MetricDef`.
- Produces:
  - `runTimestamps(results: EvalResult[]): number[]` — **new**, distinct evaluation instants ascending
  - `SeriesPoint { runIndex: number; at: number; y: number }` — **new** point shape
  - `Series { name: string; points: SeriesPoint[] }` — `name` unchanged, so the two existing tests keep passing untouched
  - `seriesFromResults(results): Series[]` — unchanged signature
  - `thresholdsFor(series, metrics): number[]` — unchanged

- [ ] **Step 1: Add the batch fixture**

Append to `dashboard/src/test/fixtures.ts`:

```ts
/**
 * Six results across three runs, all inside the same second — the batch
 * export shape that collapsed the old time axis.
 */
export const batchEvalResults: EvalResult[] = [0, 1, 2].flatMap((i) => [
  {
    ...sampleEvalResults[0],
    trace_id: `tr-batch-${i}`,
    score: 0.9 - i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  },
  {
    ...sampleEvalResults[1],
    trace_id: `tr-batch-${i}`,
    score: 0.5 + i * 0.1,
    evaluated_at: `2026-08-02T10:00:00.${String(100 + i * 10).padStart(3, "0")}Z`,
  },
]);
```

- [ ] **Step 2: Write the failing regression test**

Append to `dashboard/src/components/ScoreTimeseries.test.tsx`, adding `runTimestamps` to the import on line 5 and `batchEvalResults` to the fixtures import:

```tsx
describe("run-index axis (regression: defect 2)", () => {
  it("collects distinct evaluation instants in ascending order", () => {
    const runs = runTimestamps(batchEvalResults);
    expect(runs).toHaveLength(3);
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
  });

  it("spreads a same-second batch across sequential run positions", () => {
    // The whole batch lands inside 20ms of wall-clock. On a time axis every
    // point piles into one tick; on a run-index axis they occupy 0, 1, 2.
    const series = seriesFromResults(batchEvalResults);
    const relevance = series.find((s) => s.name === "answer_relevance")!;
    expect(relevance.points.map((p) => p.runIndex)).toEqual([0, 1, 2]);
  });

  it("keeps the real timestamp on the point for the tooltip", () => {
    const series = seriesFromResults(batchEvalResults);
    const first = series[0].points[0];
    expect(first.at).toBe(Date.parse("2026-08-02T10:00:00.100Z"));
  });

  it("indexes every metric against the same shared run axis", () => {
    const series = seriesFromResults(batchEvalResults);
    const indices = series.map((s) => s.points.map((p) => p.runIndex));
    expect(indices[0]).toEqual(indices[1]);
  });

  it("ignores results with no score when building the axis", () => {
    const runs = runTimestamps([
      ...batchEvalResults,
      { ...batchEvalResults[0], score: null, evaluated_at: "2030-01-01T00:00:00.000Z" },
    ]);
    expect(runs).toHaveLength(3);
  });

  it("still renders with the sample fixture", () => {
    renderWithProviders(
      <ScoreTimeseries results={batchEvalResults} metrics={sampleMetrics.metrics} />,
    );
    expect(screen.getByTestId("score-timeseries")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/components/ScoreTimeseries.test.tsx`
Expected: FAIL — `runTimestamps` is not exported; points have no `runIndex`.

- [ ] **Step 4: Rewrite the top of `ScoreTimeseries.tsx`**

Replace lines 1-34 (imports through `thresholdsFor`) with:

```tsx
import { Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { tokens } from "../theme";
import type { EvalResult, MetricDef } from "../types";

export interface SeriesPoint {
  /** Position on the shared run axis. */
  runIndex: number;
  /** The real evaluation instant, for the tooltip. */
  at: number;
  y: number;
}

export interface Series {
  name: string;
  points: SeriesPoint[];
}

/**
 * Distinct evaluation instants, ascending. These are the run positions.
 *
 * Plotting raw timestamps compressed the whole history into about four
 * seconds, because a batch export writes every trace's results at once. The
 * axis is therefore ordinal — run 0, run 1, run 2 — and the timestamp moves
 * to the tooltip, where it is still exact.
 */
export function runTimestamps(results: EvalResult[]): number[] {
  const instants = results
    .filter((r) => r.score !== null && r.evaluated_at !== null)
    .map((r) => Date.parse(r.evaluated_at as string))
    .filter((ms) => Number.isFinite(ms));
  return [...new Set(instants)].sort((a, b) => a - b);
}

export function seriesFromResults(results: EvalResult[]): Series[] {
  const runs = runTimestamps(results);
  const indexOf = new Map(runs.map((at, i) => [at, i]));

  const byMetric = new Map<string, SeriesPoint[]>();
  for (const r of results) {
    if (r.score === null || r.evaluated_at === null) continue;
    const at = Date.parse(r.evaluated_at);
    const runIndex = indexOf.get(at);
    if (runIndex === undefined) continue;
    const points = byMetric.get(r.metric_name) ?? [];
    points.push({ runIndex, at, y: r.score });
    byMetric.set(r.metric_name, points);
  }
  return [...byMetric.entries()].map(([name, points]) => ({
    name,
    points: points.sort((a, b) => a.runIndex - b.runIndex),
  }));
}

/** Distinct threshold values among the metrics actually plotted. */
export function thresholdsFor(series: Series[], metrics: MetricDef[]): number[] {
  const plotted = new Set(series.map((s) => s.name));
  const values = metrics
    .filter((m) => plotted.has(m.name) && m.threshold !== null)
    .map((m) => m.threshold as number);
  return [...new Set(values)].sort((a, b) => a - b);
}
```

Then replace the component body (the old lines 36-79) with:

```tsx
export function ScoreTimeseries({
  results,
  metrics = [],
}: {
  results: EvalResult[];
  metrics?: MetricDef[];
}) {
  const series = seriesFromResults(results);

  if (series.length === 0) {
    return (
      <Box data-testid="score-timeseries" sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No scored results to chart.</Typography>
      </Box>
    );
  }

  const runs = runTimestamps(results);
  const axis = runs.map((_at, i) => i);
  const thresholds = thresholdsFor(series, metrics);

  return (
    <Box data-testid="score-timeseries" sx={{ width: "100%" }}>
      <LineChart
        height={360}
        xAxis={[
          {
            data: axis,
            scaleType: "point",
            // Ticks stay short; the tooltip carries the exact instant.
            valueFormatter: (i: number, ctx) =>
              ctx?.location === "tick"
                ? `#${i + 1}`
                : new Date(runs[i]).toLocaleString(),
          },
        ]}
        series={series.map((s) => ({
          label: s.name,
          data: axis.map((i) => s.points.find((p) => p.runIndex === i)?.y ?? null),
          connectNulls: true,
        }))}
      >
        {thresholds.map((t) => (
          <ChartsReferenceLine
            key={t}
            y={t}
            label={`threshold ${t}`}
            lineStyle={{
              stroke: tokens.status.fail.solid,
              strokeDasharray: "4 4",
            }}
          />
        ))}
      </LineChart>
    </Box>
  );
}
```

If `tsc` rejects the two-argument `valueFormatter`, x-charts 7 types the context as optional — the `ctx?.location` guard above already handles it. If it still objects, type the parameter explicitly: `(i: number, ctx?: { location?: string })`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/components/ScoreTimeseries.test.tsx`
Expected: PASS, including the two original `seriesFromResults` tests and the `thresholdsFor` test — none of them was edited.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd dashboard; npm test`
Run: `cd dashboard; npx tsc -b`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/ScoreTimeseries.tsx dashboard/src/components/ScoreTimeseries.test.tsx dashboard/src/test/fixtures.ts
git commit -m "fix(dashboard): plot eval scores against run index, not raw timestamp"
```

---

### Task 11: Defect 3 — duplicate, unattributed security cards

**Root cause.** `SecurityPage` keys cards by `${metric_name}-${trace_id}-${span_id}`, and `SecurityReportCard` renders nothing identifying the trace unless `details.offending_span_id` happens to be set. Several traces evaluating the same metric to the same all-PASS result therefore render as visually identical cards.

**Fix.** Every card names and links its trace.

**Files:**
- Modify: `dashboard/src/components/SecurityReportCard.tsx`
- Modify: `dashboard/src/components/SecurityReportCard.test.tsx`
- Modify: `dashboard/src/pages/SecurityPage.tsx`
- Modify: `dashboard/src/pages/SecurityPage.test.tsx` (append)
- Modify: `dashboard/src/test/fixtures.ts` (add `multiTraceSecurityResults`)

**Interfaces:**
- Consumes: `EvalResult`.
- Produces: `SecurityReportCard({ result })` — unchanged props; now always renders a link to `/traces/${result.trace_id}` labelled with the trace id.

- [ ] **Step 1: Add the fixture**

Append to `dashboard/src/test/fixtures.ts`:

```ts
/** Three traces, same metric, same all-PASS verdict — the duplicate-card shape. */
export const multiTraceSecurityResults: EvalResult[] = ["tr-a", "tr-b", "tr-c"].map(
  (trace_id) => ({
    ...sampleEvalResults[1],
    trace_id,
    span_id: null,
    score: 1.0,
    passed: true,
    explanation: "No injected instruction was followed.",
    details: null,
  }),
);
```

- [ ] **Step 2: Write the failing regression test**

Replace `dashboard/src/components/SecurityReportCard.test.tsx` entirely:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, multiTraceSecurityResults } from "../test/fixtures";
import { SecurityReportCard } from "./SecurityReportCard";

describe("SecurityReportCard", () => {
  it("renders the metric name and verdict", () => {
    renderWithProviders(<SecurityReportCard result={sampleEvalResults[1]} />);
    expect(screen.getByText("injection_resistance")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
  });

  it("names and links its trace even when nothing offended", () => {
    // Regression (defect 3): an all-PASS card used to carry no attribution
    // at all, so N traces produced N indistinguishable cards.
    renderWithProviders(<SecurityReportCard result={multiTraceSecurityResults[0]} />);
    const link = screen.getByRole("link", { name: "tr-a" });
    expect(link).toHaveAttribute("href", "/traces/tr-a");
  });

  it("still surfaces the offending span when there is one", () => {
    renderWithProviders(<SecurityReportCard result={sampleEvalResults[1]} />);
    expect(screen.getByText(/s-generate/)).toBeInTheDocument();
  });
});
```

Append to `dashboard/src/pages/SecurityPage.test.tsx`:

```tsx
describe("SecurityPage — per-trace attribution (regression: defect 3)", () => {
  it("renders one distinct, linked card per trace", async () => {
    vi.spyOn(api, "listEvalResults").mockResolvedValue({
      results: multiTraceSecurityResults, limit: 200, offset: 0,
    });
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "tr-a" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "tr-b" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tr-c" })).toBeInTheDocument();

    // Three traces, three cards — no collapsing, no duplicates.
    expect(screen.getAllByTestId("security-report-card")).toHaveLength(3);
    for (const id of ["tr-a", "tr-b", "tr-c"]) {
      expect(screen.getByRole("link", { name: id })).toHaveAttribute(
        "href", `/traces/${id}`,
      );
    }
  });
});
```

Add `multiTraceSecurityResults` to the fixtures import at the top of `SecurityPage.test.tsx`.

- [ ] **Step 3: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/components/SecurityReportCard.test.tsx src/pages/SecurityPage.test.tsx`
Expected: FAIL — no link named `tr-a`, no `security-report-card` testid.

- [ ] **Step 4: Rewrite `SecurityReportCard.tsx`**

```tsx
import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { tokens, TABULAR_NUMS } from "../theme";
import type { EvalResult } from "../types";

/**
 * One security finding, always attributed to its trace.
 *
 * Attribution is unconditional: several traces evaluating the same metric to
 * the same all-PASS verdict used to render as identical, unattributable
 * cards with no way to tell which run each came from.
 */
export function SecurityReportCard({ result }: { result: EvalResult }) {
  const offendingSpan =
    (result.details?.offending_span_id as string | undefined) ?? result.span_id ?? undefined;

  return (
    <Card variant="outlined" data-testid="security-report-card">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">{result.metric_name}</Typography>
          <Chip
            size="small"
            color={result.passed ? "success" : "error"}
            label={result.passed ? "PASS" : "FAIL"}
          />
        </Stack>

        <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
          Trace{" "}
          <Typography
            component={RouterLink}
            to={`/traces/${result.trace_id}`}
            variant="body2"
            sx={{ color: tokens.brand.text, textDecoration: "none", ...TABULAR_NUMS }}
          >
            {result.trace_id}
          </Typography>
        </Typography>

        <Typography variant="body2" sx={{ mt: 1, ...TABULAR_NUMS }}>
          Score: {result.score ?? "—"} (threshold {result.threshold ?? "—"})
        </Typography>

        {result.explanation && (
          <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
            {result.explanation}
          </Typography>
        )}

        {offendingSpan && (
          <Typography variant="body2" sx={{ mt: 1, color: tokens.muted }}>
            Offending span: {offendingSpan}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
```

The offending span is now plain text — the trace link above already carries the navigation, and two links per card pointing at the same route was the source of the ambiguity.

- [ ] **Step 5: Key the list by trace**

In `dashboard/src/pages/SecurityPage.tsx`, replace the key on line 34:

```tsx
            key={`${r.trace_id}-${r.metric_name}-${r.span_id ?? "trace"}-${r.evaluated_at}`}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/components/SecurityReportCard.test.tsx src/pages/SecurityPage.test.tsx`
Expected: PASS, including the pre-existing "renders only security findings" test.

- [ ] **Step 7: Lock the filled-chip contrast pairing**

The PASS/FAIL chips here are MUI filled `Chip`s, so they render `palette.<tone>.main` as the background with `contrastText` as the label — a foreground/background pairing the Task 1 contrast test never covered, because it only checked tokens against the two page backgrounds. Measured values are safe today (`status.pass` 9.57, `status.warn` 8.66, `status.fail.solid` 4.88, `brand.solid` 4.63) but nothing guards them.

Append to `dashboard/src/theme/contrast.test.ts`:

```ts
describe("filled-chip label contrast", () => {
  // MUI's filled Chip/Button render palette.<tone>.main as the background
  // and contrastText as the label. palette.ts sets contrastText to onFill on
  // every one of these, so each pairing is real and must clear the body floor.
  const FILLED: Array<[string, string]> = [
    ["success", tokens.status.pass],
    ["error", tokens.status.fail.solid],
    ["warning", tokens.status.warn],
    ["primary", tokens.brand.solid],
  ];

  it.each(FILLED)("onFill on %s.main clears 4.5:1", (_tone, background) => {
    expect(contrastRatio(tokens.onFill, background)).toBeGreaterThanOrEqual(4.5);
  });
});
```

Run: `cd dashboard; npx vitest run src/theme/contrast.test.ts`
Expected: PASS, 4 new cases.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/components/SecurityReportCard.tsx dashboard/src/components/SecurityReportCard.test.tsx dashboard/src/pages/SecurityPage.tsx dashboard/src/pages/SecurityPage.test.tsx dashboard/src/test/fixtures.ts dashboard/src/theme/contrast.test.ts
git commit -m "fix(dashboard): attribute every security card to its trace"
```

---

### Task 12: Defect 4 — nav click blocked by the span panel

**Root cause.** `SpanDetailPanel` uses MUI's default `temporary` `Drawer`, which mounts a `Modal` with a full-viewport `Backdrop` and a focus trap. The backdrop sits above the rail and swallows the click.

**Fix.** Bound the panel's stacking context: hide the backdrop, drop the focus trap and scroll lock, and set `pointer-events: none` on the modal root with `pointer-events: auto` on the paper — so the panel only intercepts clicks inside its own bounds.

**Read the limitation in "Deviations from the spec" before writing this test.** jsdom does no hit-testing, so a jsdom click on a rail link succeeds whether or not the backdrop is there. The test below asserts the mechanism; Task 14's Playwright step is what proves the behaviour.

**Files:**
- Modify: `dashboard/src/components/SpanDetailPanel.tsx`
- Create: `dashboard/src/components/SpanDetailPanel.test.tsx`

**Interfaces:**
- Consumes: `Span`, `formatDuration`, `tokens`.
- Produces: `SpanDetailPanel({ span, onClose })` — unchanged props.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree } from "../test/fixtures";
import { SpanDetailPanel } from "./SpanDetailPanel";

const span = sampleSpanTree[0].children[1]; // s-generate

describe("SpanDetailPanel", () => {
  it("renders the span's detail when open", () => {
    renderWithProviders(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText("generate")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("renders nothing when no span is selected", () => {
    renderWithProviders(<SpanDetailPanel span={null} onClose={() => {}} />);
    expect(screen.queryByText("Metadata")).not.toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    renderWithProviders(<SpanDetailPanel span={span} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onClose).toHaveBeenCalled();
  });

  describe("pointer interception (regression: defect 4)", () => {
    // jsdom performs no hit-testing, so a click on a rail link succeeds here
    // whether or not a backdrop covers it. These assert the mechanism that
    // makes the real browser behave; Playwright proves the behaviour.
    it("renders no backdrop", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      expect(baseElement.querySelector(".MuiBackdrop-root")).toBeNull();
    });

    it("does not intercept pointer events outside its own bounds", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      const root = baseElement.querySelector(".MuiModal-root") as HTMLElement;
      expect(root).not.toBeNull();
      expect(root).toHaveStyle({ pointerEvents: "none" });
    });

    it("still accepts pointer events inside the panel", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      const paper = baseElement.querySelector(".MuiDrawer-paper") as HTMLElement;
      expect(paper).toHaveStyle({ pointerEvents: "auto" });
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd dashboard; npx vitest run src/components/SpanDetailPanel.test.tsx`
Expected: FAIL — a `.MuiBackdrop-root` exists and the modal root has no `pointer-events`.

- [ ] **Step 3: Rewrite `SpanDetailPanel.tsx`**

```tsx
import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { formatDuration } from "../lib/format";
import { tokens, SPACE, TABULAR_NUMS } from "../theme";
import type { Span } from "../types";

const PANEL_WIDTH = 380;

/**
 * Span detail, in a panel that stays inside its own bounds.
 *
 * The default temporary Drawer mounts a full-viewport backdrop and a focus
 * trap, which swallowed clicks on the nav rail while the panel was open.
 * Hiding the backdrop and scoping pointer events to the paper keeps the rail
 * reachable without turning the panel into a persistent layout element.
 */
export function SpanDetailPanel({
  span,
  onClose,
}: {
  span: Span | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={span !== null}
      onClose={onClose}
      hideBackdrop
      disableScrollLock
      disableEnforceFocus
      slotProps={{
        root: { sx: { pointerEvents: "none" } },
        paper: {
          sx: {
            pointerEvents: "auto",
            width: PANEL_WIDTH,
            bgcolor: tokens.surface,
            borderLeft: `1px solid ${tokens.border}`,
            borderRadius: 0,
          },
        },
      }}
    >
      <Box sx={{ width: PANEL_WIDTH, p: `${SPACE.md}px` }}>
        {span && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">{span.name}</Typography>
              <IconButton onClick={onClose} aria-label="close" size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: tokens.muted }}>
              {span.span_type}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, ...TABULAR_NUMS }}>
              Latency: {formatDuration(span.latency_ms)}
            </Typography>
            <Typography variant="body2">Status: {span.status}</Typography>
            {span.error_message && (
              <Typography variant="body2" sx={{ mt: 1, color: tokens.status.fail.text }}>
                {span.error_message}
              </Typography>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Metadata</Typography>
            <Box
              component="pre"
              sx={{
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: tokens.muted,
                bgcolor: tokens.bg,
                border: `1px solid ${tokens.border}`,
                borderRadius: 1.5,
                p: `${SPACE.xs}px`,
                ...TABULAR_NUMS,
              }}
            >
              {JSON.stringify(span.metadata, null, 2)}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
```

`slotProps` is the MUI 6 API; `PaperProps`/`ModalProps` still work but are deprecated. If `slotProps.root` is rejected by the types, fall back to `ModalProps={{ sx: { pointerEvents: "none" } }}` and `PaperProps={{ sx: { pointerEvents: "auto", ... } }}` — the rendered DOM and the test assertions are identical.

- [ ] **Step 4: Run to verify it passes**

Run: `cd dashboard; npx vitest run src/components/SpanDetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `cd dashboard; npm test`
Expected: PASS. `TraceDetailPage.test.tsx`'s "opens the span panel when a bar is clicked" exercises this component and must stay green.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/SpanDetailPanel.tsx dashboard/src/components/SpanDetailPanel.test.tsx
git commit -m "fix(dashboard): stop the span panel intercepting clicks outside its bounds"
```

---

### Task 13: Density pass over the four existing pages

Control-room density on the working pages. No behaviour changes — every existing page test must pass untouched.

**Files:**
- Modify: `dashboard/src/pages/TracesPage.tsx`
- Modify: `dashboard/src/pages/TraceDetailPage.tsx`
- Modify: `dashboard/src/pages/EvalsPage.tsx`
- Modify: `dashboard/src/pages/SecurityPage.tsx`
- Modify: `dashboard/src/components/Filters.tsx`

**Interfaces:**
- Consumes: `tokens`, `SPACE`, `ROW_HEIGHT` from `../theme`.
- Produces: no API change. Page components keep their names and signatures.

- [ ] **Step 1: Set the shared page header pattern**

Every page currently opens with `<Typography variant="h5" sx={{ mb: 2 }}>`. Standardise on `variant="h5"` with `sx={{ color: tokens.ink, mb: \`${SPACE.md}px\` }}` and, where the page has context worth stating, a `body2` sublabel in `tokens.muted` beneath.

Do **not** change the header text — `TracesPage` renders "Traces", `EvalsPage` renders "Eval scores over time", `SecurityPage` renders "Security report", `TraceDetailPage` renders `Trace {traceId}`. Tests match on some of these.

- [ ] **Step 2: Tighten the traces grid**

In `dashboard/src/pages/TracesPage.tsx`:

- Add `import { tokens, SPACE, ROW_HEIGHT } from "../theme";`
- On the `DataGrid`, add `rowHeight={ROW_HEIGHT}` and `columnHeaderHeight={ROW_HEIGHT}`.
- Change the wrapper `<div style={{ height: 600, width: "100%" }}>` to `<Box sx={{ height: 640, width: "100%" }}>` (and close with `</Box>`) so it participates in the theme.
- Right-align the three numeric columns by adding `align: "right", headerAlign: "right"` to the `total_latency_ms`, `total_tokens` and `total_cost_usd` column definitions. Numerals already carry `tabular-nums` from the `MuiDataGrid` override in Task 1.

Leave the column set, `getRowId`, pagination props and the delete button exactly as they are — `TracesPage.test.tsx` depends on them.

- [ ] **Step 3: Tighten the trace detail page**

In `dashboard/src/pages/TraceDetailPage.tsx`:

- Add `import { tokens, SPACE } from "../theme";`
- Wrap the waterfall in a surface: replace `<Waterfall roots={roots} onSelect={setSelected} />` with

```tsx
        <Box
          sx={{
            p: `${SPACE.md}px`,
            bgcolor: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 2.5,
          }}
        >
          <Waterfall roots={roots} onSelect={setSelected} />
        </Box>
```

- On the eval-results `Stack`, change `spacing={1}` to `spacing={0.75}` and give each `Chip` `sx={{ minWidth: 180 }}` so the rows align into a column rather than ragging.
- Change the `Typography variant="h5"` trace heading to include the trace id in `tokens.muted` at `body2` beneath, keeping the `h5` text as `Trace {traceId}` — `TraceDetailPage.test.tsx` does not assert on the heading, but keep it stable anyway.

- [ ] **Step 4: Tighten the evals and security pages**

In `dashboard/src/pages/EvalsPage.tsx`: wrap the `ScoreTimeseries` in the same surface `Box` used in Step 3, and change the metric `TextField`'s `sx` to `{ minWidth: 220, mb: \`${SPACE.md}px\` }`.

In `dashboard/src/pages/SecurityPage.tsx`: replace the results `<Stack spacing={2}>` wrapper with a responsive grid, so a long report stops being one tall column:

```tsx
        <Box
          sx={{
            display: "grid",
            gap: `${TILE_GAP}px`,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
          }}
        >
```

Close it with `</Box>` in place of `</Stack>`, drop the now-unused `Stack` import if nothing else on the page uses it, and import `TILE_GAP` from `../theme`. The `.map` inside is unchanged — `SecurityPage.test.tsx` counts `security-report-card` testids and must stay green untouched.

- [ ] **Step 5: Tighten the filter bar**

In `dashboard/src/components/Filters.tsx`, set every input to `size="small"` if it is not already, and set the container gap to `SPACE.xs`. Do not change the `TraceFilters` type or the `onChange` contract — `TracesPage` and its test depend on both.

- [ ] **Step 6: Run the full suite, typecheck and lint**

Run: `cd dashboard; npm test`
Expected: PASS — **with no test file edited in this task.** If a page test fails here, the density pass changed behaviour. Revert that specific change rather than editing the test.

Run: `cd dashboard; npx tsc -b; npx eslint . --ext ts,tsx`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/pages dashboard/src/components/Filters.tsx
git commit -m "style(dashboard): control-room density pass over the working pages"
```

---

### Task 14: Collapse the left rail on narrow viewports

**Added after Task 9 review.** Not in the original spec — found while investigating the Overview's breakpoints, and more consequential than the breakpoints were.

**The problem.** `AppShell` renders `variant="permanent"` at a fixed `RAIL_WIDTH = 208` with no responsive handling. That slice is taken from every viewport, so the content column is `viewport − 208 − 48`:

| Viewport | Content | 2-col tile |
|---:|---:|---:|
| 1440 | 1184 | 586 |
| 1024 | 768 | 378 |
| 768 | 512 | 250 |
| 600 | 344 | 166 |
| **375** | **119** | 54 |

At 375px the page has 119px to work with. No grid breakpoint fixes that — the rail has to go.

**Why the current test suite misses it.** Task 15's Playwright sweep asserts *no horizontal scroll* at 375px, and `minWidth: 0` on the main Box guarantees content squeezes rather than overflows. The assertion passes on an unusable page. Step 6 below fixes that check too.

**Files:**
- Modify: `dashboard/src/components/AppShell.tsx`
- Modify: `dashboard/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `tokens`, `SPACE` from `../theme`; `useProjects`, `useProject`.
- Produces: `AppShell` — props unchanged (`{ children: ReactNode }`). New export `RAIL_BREAKPOINT = 768`.

The threshold is 768 to match the Overview grid's own single-column breakpoint, so the rail disappears exactly when the grid collapses. Below it the content column would otherwise fall under ~512px.

- [ ] **Step 1: Write the failing tests**

jsdom does not implement `window.matchMedia`, so MUI's `useMediaQuery` returns its default (`false`) unless stubbed. Stubbing it is what makes both branches genuinely testable — without it, only the wide branch would ever run.

Append to `dashboard/src/components/AppShell.test.tsx`:

```tsx
/** Stub matchMedia so useMediaQuery can be driven deterministically. */
function setViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  );
}

describe("AppShell responsive rail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the rail and no menu button on a wide viewport", async () => {
    setViewport(false); // not narrow
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open navigation/i })).not.toBeInTheDocument();
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
  });

  it("hides the rail behind a menu button on a narrow viewport", () => {
    setViewport(true); // narrow
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
    // The temporary drawer is closed initially, so nav links are not rendered.
    expect(screen.queryByRole("link", { name: "Traces" })).not.toBeInTheDocument();
  });

  it("opens the drawer when the menu button is clicked", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });

  it("closes the drawer after following a link", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    fireEvent.click(screen.getByRole("link", { name: "Evals" }));
    // Navigating must not leave the overlay covering the page.
    expect(screen.queryByRole("link", { name: "Evals" })).not.toBeInTheDocument();
  });

  it("keeps the project switcher reachable on a narrow viewport", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
  });
});
```

Add `fireEvent` and `afterEach` to the existing imports at the top of the file.

- [ ] **Step 2: Run to verify they fail**

Run: `cd dashboard; npx vitest run src/components/AppShell.test.tsx --reporter=basic`
Expected: FAIL — no element with an accessible name matching "open navigation".

- [ ] **Step 3: Make the rail responsive**

In `dashboard/src/components/AppShell.tsx`:

Extend the imports:

```tsx
import { ReactNode, useState } from "react";
import {
  Box, Drawer, IconButton, List, ListItemButton, ListItemText, MenuItem,
  Select, Typography, useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
```

Add below `RAIL_WIDTH`:

```tsx
/**
 * Below this the rail's fixed 208px costs more than it gives: at 375px it
 * would leave 119px of content. Matches the Overview grid's own
 * single-column breakpoint, so the rail leaves exactly when the grid folds.
 */
export const RAIL_BREAKPOINT = 768;
const NARROW = `(max-width:${RAIL_BREAKPOINT - 0.05}px)`;
```

Inside the component, add state and the query, and extract the rail's contents so both drawer variants render the same thing:

```tsx
  const isNarrow = useMediaQuery(NARROW);
  const [open, setOpen] = useState(false);

  const railContent = (
    <>
      <Typography
        variant="h6"
        sx={{ px: `${SPACE.xs}px`, color: tokens.ink, letterSpacing: "-0.01em" }}
      >
        Agent<Box component="span" sx={{ color: tokens.brand.text }}>Proof</Box>
      </Typography>

      <List sx={{ display: "flex", flexDirection: "column", gap: "2px", py: 0 }}>
        {NAV.map((item) => {
          const current = isCurrent(pathname, item.to, item.exact);
          return (
            <ListItemButton
              key={item.to}
              component={RouterLink}
              to={item.to}
              selected={current}
              aria-current={current ? "page" : undefined}
              onClick={() => setOpen(false)}
              sx={{ py: "6px" }}
            >
              <ListItemText primary={item.label} primaryTypographyProps={{ variant: "body1" }} />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ mt: "auto", px: `${SPACE.xs}px` }}>
        <Typography variant="caption" sx={{ color: tokens.muted, display: "block", mb: "4px" }}>
          Project
        </Typography>
        <Select
          size="small"
          displayEmpty
          fullWidth
          value={project ?? ""}
          onChange={(e) => setProject(e.target.value || undefined)}
          inputProps={{ "aria-label": "Project" }}
          sx={{ bgcolor: tokens.bg }}
        >
          <MenuItem value="">All projects</MenuItem>
          {(projects.data ?? []).map((p) => (
            <MenuItem key={p} value={p}>{p}</MenuItem>
          ))}
        </Select>
      </Box>
    </>
  );

  const paperSx = {
    width: RAIL_WIDTH,
    boxSizing: "border-box" as const,
    bgcolor: tokens.surface,
    borderRight: `1px solid ${tokens.border}`,
    borderRadius: 0,
    px: `${SPACE.xs}px`,
    py: `${SPACE.md}px`,
    gap: `${SPACE.md}px`,
    display: "flex",
    flexDirection: "column" as const,
  };
```

Then replace the returned JSX with:

```tsx
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: tokens.bg }}>
      {isNarrow ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ [`& .MuiDrawer-paper`]: paperSx }}
        >
          {railContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          component="nav"
          aria-label="Main navigation"
          sx={{ width: RAIL_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: paperSx }}
        >
          {railContent}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: `${SPACE.lg}px`, minWidth: 0, bgcolor: tokens.bg }}>
        {isNarrow && (
          <IconButton
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            sx={{ mb: `${SPACE.sm}px`, color: tokens.ink }}
          >
            <MenuIcon />
          </IconButton>
        )}
        {children}
      </Box>
    </Box>
  );
```

`component="nav"` and `aria-label` on the permanent rail also close the missing-landmark finding recorded against Task 5.

- [ ] **Step 4: Run to verify they pass**

Run: `cd dashboard; npx vitest run src/components/AppShell.test.tsx --reporter=basic`
Expected: PASS, including the four pre-existing `AppShell` tests. Those run without a `matchMedia` stub, so `useMediaQuery` returns `false` and they exercise the wide branch exactly as before — confirm that rather than assuming it.

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `cd dashboard; npm test`, then `npx tsc -b`, then `npx eslint . --ext ts,tsx`
Expected: all clean. `App.test.tsx` also renders `AppShell`; it must stay green.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/AppShell.tsx dashboard/src/components/AppShell.test.tsx
git commit -m "feat(dashboard): collapse the left rail below 768px

The rail was permanent at a fixed 208px, so it took that slice from every
viewport -- at 375px it left 119px of content. Below 768px it now folds into
a temporary drawer behind a menu button, matching the Overview grid's own
single-column breakpoint. Also adds the nav landmark the permanent rail was
missing."
```

---

### Task 15: Full verification sweep

Nothing here is optional, and nothing here may be reported as passing without the command having been run and its output read.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `<scratchpad>/verify_dashboard.py` (throwaway Playwright script, not committed)

- [ ] **Step 1: Run every suite and record the real numbers**

```bash
cd dashboard && npm test
```
Expected: PASS. Record the test count.

```bash
cd server && python -m pytest tests/ -v
```
Expected: PASS. The API-key-gated integration tests skip; the three summary DB tests must **run**, not skip. If they skip, `docker compose up -d` and rerun.

```bash
cd sdk && python -m pytest tests/ -v
cd demo_agent && python -m pytest tests/ -v
```
Run separately — collecting both in one pytest run produces 6 collection errors because both packages name their test package `tests`.

- [ ] **Step 2: Typecheck and lint everything**

```bash
cd dashboard && npx tsc -b && npx eslint . --ext ts,tsx
```
Expected: both clean, zero warnings.

```bash
ruff check sdk/ server/
```
Expected: clean.

- [ ] **Step 3: Confirm no raw hex survives outside `theme/`**

```bash
grep -rnE "#[0-9a-fA-F]{6}\b" dashboard/src --include="*.tsx" --include="*.ts" \
  | grep -v "^dashboard/src/theme/" \
  | grep -v "\.test\."
```
Expected: **no output.** Any hit is a review failure under the global constraint. Test files are excluded because a test may legitimately assert a literal colour.

- [ ] **Step 4: Drive the real stack with Playwright**

Playwright is not a project dependency. Build a throwaway venv rather than polluting project deps:

```bash
python -m venv "$SCRATCHPAD/pwvenv"
"$SCRATCHPAD/pwvenv/Scripts/python" -m pip install playwright
"$SCRATCHPAD/pwvenv/Scripts/python" -m playwright install chromium
```

Bring the stack up and seed it:

```bash
docker compose up -d
```

Write `<scratchpad>/verify_dashboard.py`:

```python
"""Playwright sweep: five routes, two widths, no horizontal scroll, no console errors."""

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
ROUTES = ["/", "/traces", "/evals", "/security"]
WIDTHS = [(1440, 900), (375, 812)]

# No-overflow alone is not enough. `minWidth: 0` on <main> guarantees content
# squeezes rather than overflows, so a page whose content column has collapsed
# to 119px still passes a horizontal-scroll check. Assert usable width too.
MIN_CONTENT_PX = 320

def main() -> int:
    failures: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in WIDTHS:
            page = browser.new_page(viewport={"width": width, "height": height})
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            for route in ROUTES:
                errors.clear()
                page.goto(f"{BASE}{route}", wait_until="networkidle")
                page.wait_for_timeout(600)

                overflow = page.evaluate(
                    "() => document.documentElement.scrollWidth > "
                    "document.documentElement.clientWidth"
                )
                if overflow:
                    failures.append(f"{route} @ {width}px: horizontal scroll")

                content_px = page.evaluate(
                    "() => { const m = document.querySelector('main');"
                    " return m ? Math.round(m.getBoundingClientRect().width) : -1; }"
                )
                if content_px < MIN_CONTENT_PX:
                    failures.append(
                        f"{route} @ {width}px: main is only {content_px}px wide "
                        f"(min {MIN_CONTENT_PX}) — no-overflow passed but the page is unusable"
                    )

                if errors:
                    failures.append(f"{route} @ {width}px: console errors {errors}")
                page.screenshot(path=f"shot-{width}-{route.strip('/') or 'overview'}.png")

            # Trace detail: the deep route plus the defect-4 behaviour check.
            page.goto(f"{BASE}/traces", wait_until="networkidle")
            first = page.locator(".MuiDataGrid-row").first
            if first.count():
                first.click()
                page.wait_for_timeout(800)
                bar = page.locator('[data-testid^="waterfall-bar-"]').first
                if bar.count():
                    bar.click()
                    page.wait_for_timeout(400)
                    # Defect 4: the rail must stay clickable with the panel open.
                    try:
                        page.get_by_role("link", name="Evals").click(timeout=3000)
                        page.wait_for_url("**/evals", timeout=3000)
                    except Exception as exc:
                        failures.append(f"@ {width}px: nav blocked by span panel — {exc}")
            page.close()
        browser.close()

    for f in failures:
        print("FAIL:", f)
    print("PASS — no horizontal scroll, no console errors, rail reachable" if not failures else f"{len(failures)} failure(s)")
    return 1 if failures else 0

raise SystemExit(main())
```

Run: `"$SCRATCHPAD/pwvenv/Scripts/python" "$SCRATCHPAD/verify_dashboard.py"`
Expected: `PASS`, exit 0.

The nav-click assertion here is the **real** proof for defect 4 — the jsdom test in Task 12 only asserts the mechanism.

- [ ] **Step 5: Look at the screenshots**

Open the 1440px Overview screenshot. Check by eye:
- No gradient anywhere, magenta or otherwise.
- Green, red and amber appear only as verdicts, never as decoration.
- The security tile reads as the headline, not as one card among equals.
- Numerals are aligned.

Replay-mode data still makes weak screenshots even with the waterfall fixed, because the durations are genuinely near-zero. That is expected and tracked separately — shooting the demo in `--mode live` needs an API key.

- [ ] **Step 6: Add the dashboard CI job**

**Beyond the spec** — the spec asks that the dashboard tests stay green but the repo has no job that runs them, so "green" is currently unenforced. Drop this step if the user does not want it.

Append to `.github/workflows/ci.yml`:

```yaml
  test-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: dashboard/package-lock.json
      - run: cd dashboard && npm ci
      - run: cd dashboard && npm test
      - run: cd dashboard && npx tsc -b
      - run: cd dashboard && npx eslint . --ext ts,tsx
```

- [ ] **Step 7: Update `PROGRESS.md`**

Move the redesign into "Built & verified" with the verification note — the commands run and what their output actually said. Nothing goes in that section without one.

- [ ] **Step 8: Commit and open the PR**

```bash
git add .github/workflows/ci.yml PROGRESS.md
git commit -m "ci: run dashboard tests, typecheck and lint on every PR"
git push -u origin phase-7-agent-ci-gate
```

Then use `superpowers:requesting-code-review`, and `superpowers:finishing-a-development-branch` to integrate.

Note: PR #7 is already open on this branch and currently green on all five checks. Confirm with the user whether this work lands on top of it or on a fresh branch before pushing.

---

## Self-review

**Spec coverage.** Every section maps to a task: token system → 1; endpoint → 2, 3; IA and rail → 5; Overview and its four tiles → 6, 7, 8, 9; the four defects → 4, 10, 11, 12; density → 13; verification → 14. The component inventory is fully covered, with `lib/overview.ts` added (pure derivations the spec implies but does not name) and `theme/contrast.ts` added (the spec's contrast test needs something to test).

**Three gaps in the spec, closed explicitly** rather than papered over: `project` had to become optional or the Overview 422s on first render; p99 latency had no data source, so it joined the summary endpoint under the spec's own anti-sampling argument; span-type colours were raw hex that would have violated the no-raw-hex rule on day one.

**One thing the plan cannot deliver as specified.** The spec asks for a regression test per defect. Defect 4's regression test asserts the mechanism, not the behaviour, because jsdom does no hit-testing — a backdrop that swallows clicks in Chromium does not swallow them under `fireEvent`. The behavioural check is in Task 14's Playwright sweep. Do not report defect 4 as test-covered in the same sense as the other three.

**Contrast numbers were recomputed, not copied.** All eight match the spec to two decimals. Two additions came out of that check: `onFill` is `#100F13` rather than `bg`, because `bg` on `brand.solid` measures 4.49 and misses the body floor by 0.01; and every token was verified against `bg` as well as `surface`, since text sits on both.

**Type consistency.** `MIN_WIDTH_PCT` is removed and `MIN_BAR_PX` replaces it — Tasks 4 and 8 both use the new name. `Series` keeps its `name` field so the two untouched `ScoreTimeseries` tests still pass; only the point shape changes, from `{x, y}` to `{runIndex, at, y}`. `Tone` is defined once in `StatTile.tsx` and imported by `VerdictTile` and `lib/overview.ts`. `EvalSummary` is defined in Task 3 and consumed identically in 7, 8 and 9.

**Three existing tests change, each for a stated behavioural reason:** the waterfall min-width assertion (floor moves from % to px), the App redirect assertion (the redirect is removed by design), and the SecurityReportCard suite (attribution becomes unconditional). Task 13 changes no test at all — that is its check.
