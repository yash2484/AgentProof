# Dashboard Redesign — Design

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning
**Scope:** `dashboard/` (all pages), plus one new read-only endpoint in `server/`

## Why

The dashboard works but reads as templated. The whole visual identity is two lines in
`dashboard/src/theme.ts`:

```ts
palette: { mode: "light", primary: { main: "#3949ab" } }
```

No typography scale, no spacing system, no component overrides, no dark mode. On top of
that the app lands on `/traces` — a data table — which is a weak opening frame for a
project whose headline claim is that it catches agents becoming less safe.

Four functional defects were verified by running the stack and driving it with Playwright:

1. The waterfall is unreadable in replay mode. Spans are 0–1 ms and collapse to specks;
   `fact_checker` does not render at all.
2. The eval timeseries x-axis spans about four seconds, because every trace in a batch
   export lands within the same instant and the axis plots raw timestamps.
3. The security page renders duplicate all-PASS cards with no indication of which trace
   each came from.
4. Clicking a nav link while the span-detail panel is open times out — the open panel
   intercepts pointer events.

## Goals

- The overview frame should be worth screenshotting without explanation.
- The working pages should stay dense enough to debug a real agent run in.
- Every colour in the interface means something.
- The four defects above are fixed, with a regression test each.

## Non-goals

- No framework migration. MUI stays (see Decisions).
- No new backend features beyond the one aggregate endpoint below.
- No auth, no multi-user, no realtime/WebSocket. Out of scope.
- Light mode is not built in this pass. The token structure permits it later; nothing
  ships hardcoded to dark.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Layout | **D** — bento overview, control-room working pages | "Showpiece first, must survive real use" wants two densities; one layout serving both goes mushy. Splitting by page resolves it honestly. |
| Palette | **Graphite & Magenta** | Escapes the slate-and-emerald default on both axes. Brand hue sits outside every semantic band. |
| Framework | **Stay on MUI 6** | 41 passing tests, `x-charts` and `x-data-grid` in active use. The templated look comes from an empty theme, not from MUI. |
| Aggregates | **New server endpoint** | Client-side aggregation over the 200-row cap would make the overview imply full-history numbers while showing a sample. |

### Why the brand hue is constrained

This is a pass/fail product. Green, red and amber carry meaning — a metric held, a metric
regressed, a metric is near threshold. A brand accent drawn from any of those bands makes
brand and status indistinguishable, which is precisely the flaw in the palette originally
proposed (`#22C55E` green as *both* the brand accent and the PASS semantic).

The rule: **the brand hue stays out of the green (~145°), red (~28°) and amber (~78°)
bands.** Magenta satisfies this with the widest margin available.

## Token system

`dashboard/src/theme.ts` is replaced by `dashboard/src/theme/` containing `palette.ts`,
`typography.ts`, `components.ts` and an `index.ts` that composes them.

### Colour

Contrast ratios below are measured against `surface` (`#1D1B22`) using the WCAG 2.1
relative-luminance formula. They are asserted by a test (see Verification).

| Token | Hex | Ratio | Use |
|---|---|---|---|
| `bg` | `#141317` | — | Page background |
| `surface` | `#1D1B22` | — | Tiles, cards, panels |
| `border` | `#302D38` | — | Hairlines, tile edges |
| `ink` | `#F2F0F5` | 15.06 | Primary text |
| `muted` | `#918C9C` | 5.22 | Secondary text, labels, axes |
| `brand.solid` | `#D6409F` | 4.13 | Fills, bars, borders, focus rings |
| `brand.text` | `#E255AC` | 4.97 | Brand-coloured text at body size |
| `status.pass` | `#3FCF8E` | 8.54 | Metric held |
| `status.fail.solid` | `#E5484D` | 4.35 | Failure fills and bars |
| `status.fail.text` | `#EC5F63` | 5.18 | Failure text at body size |
| `status.warn` | `#E2A336` | 7.73 | Near-threshold |

`brand.solid` and `status.fail.solid` measure below the 4.5 body-text threshold but clear
the 3.0 threshold that governs non-text and large text. Splitting each into a solid and a
text token is what keeps both usable without shipping unreadable copy. **Components
reference semantic token names; raw hex in a component is a review failure.**

The magenta is used flat. No gradients — a magenta gradient is its own cliché and would
undo the reason for choosing it.

### Typography

Inter at weights 400 / 500 / 600. One family, hierarchy by weight and size, per the
"don't pair two similar sans-serifs" rule.

Scale: 11 / 12 / 13 / 15 / 18 / 24 / 32.

Every numeric cell — table figures, durations, token counts, scores, axis labels — carries
`font-variant-numeric: tabular-nums` so digits stop reflowing between renders.

### Spacing

8px base, dense scale: 8 / 12 / 16 / 24 / 32. Tile gap 12. Tile padding 16. Table row
height 36.

## Information architecture

```
/            Overview    NEW — bento hero frame
/traces      Traces      dense list
/traces/:id  Trace       waterfall + span panel
/evals       Evals       score timeseries
/security    Security    report
```

The current `/` → `/traces` redirect is removed. The top nav in `AppShell` becomes a
persistent left rail (nav placement stays identical across all pages).

## Overview page

Bento grid, asymmetric, where tile size encodes importance:

| Tile | Span | Content |
|---|---|---|
| Security verdict | 2×2 | The headline finding in a sentence, plus resistance and exfiltration scores |
| Gate | 1×1 | PASS / FAIL and `n/m held` |
| p99 latency | 1×1 | Value and trace count |
| Latest trace | full width | Mini waterfall, span names beneath |

The security tile leads because adversarial resistance is what separates AgentProof from a
telemetry tool. Latency and cost get small tiles deliberately.

Responsive: 3-col at ≥1024px, 2-col at ≥768px, single column below. The 2×2 tile becomes
full-width at the smallest breakpoint rather than shrinking.

## New endpoint

```
GET /api/v1/evals/summary?project=<name>
```

Returns per-metric aggregates computed in SQL, scoped to a project by joining
`eval_results` to `traces` (eval rows carry no project of their own — the existing
`list_results` handler already joins this way).

```json
{
  "project": "demo-research-agent",
  "trace_count": 247,
  "overall_pass_rate": 0.94,
  "metrics": [
    {
      "metric_name": "injection_resistance",
      "mean_score": 1.0,
      "pass_rate": 1.0,
      "count": 247,
      "last_evaluated_at": "2026-08-02T10:14:22Z"
    }
  ]
}
```

Read-only. `GROUP BY metric_name` with `avg(score)`, `count(*)`, `max(evaluated_at)`, and
pass rate as `avg(case when passed then 1.0 else 0.0 end)` — `passed` is boolean, so a bare
`avg()` over it is invalid in Postgres. No new tables, no migration.

The 3px minimum bar width is a rendering floor only; the axis stays linearly truthful and
the tooltip reports the real duration. A bar at the floor is not proportional, and that is
the accepted trade — an invisible span is worse than a slightly overstated one.

Empty project returns `trace_count: 0`, `overall_pass_rate: null`, `metrics: []` — not a
404. The overview renders an empty state from that, so a fresh install shows guidance
rather than an error.

## Defect fixes and acceptance criteria

| Defect | Fix | Acceptance |
|---|---|---|
| Waterfall unreadable at sub-ms durations | Bars scale linearly against the trace's own total duration (not wall-clock), with a 3px minimum *rendered* width so a near-zero span stays visible | A 4-span replay trace renders 4 distinguishable bars, `fact_checker` among them |
| Eval x-axis spans four seconds | Plot against run index, not raw timestamp; timestamp moves to the tooltip | Axis shows sequential run positions; a batch of traces exported in the same second spreads across the axis |
| Duplicate unattributed security cards | Key cards by `trace_id`; each card names and links to its trace | N traces produce N distinct cards, each linking to `/traces/:id` |
| Nav click blocked by span panel | Panel gets a bounded stacking context and stops intercepting pointer events outside its own bounds | Clicking a rail link with the panel open navigates |

## Component inventory

**New**
`theme/palette.ts`, `theme/typography.ts`, `theme/components.ts`, `theme/index.ts`,
`pages/OverviewPage.tsx`, `components/VerdictTile.tsx`, `components/StatTile.tsx`,
`components/MiniWaterfall.tsx`, `components/EmptyState.tsx`

**Modified**
`App.tsx` (route), `components/AppShell.tsx` (left rail), `components/Waterfall.tsx`,
`components/ScoreTimeseries.tsx`, `components/SecurityReportCard.tsx`,
`components/SpanDetailPanel.tsx`, `hooks/queries.ts` (summary query),
`api/client.ts` (summary fetch), `types/index.ts` (summary types), all four existing pages

**Server**
`api/evals.py` (summary route), `tests/unit/` (summary tests)

Files stay small and single-purpose. Any component past ~120 lines is a signal to split.

## Verification

- All 41 existing dashboard tests stay green. Any that need changing must be changed
  because behaviour intentionally changed, never to accommodate a regression.
- New unit tests for each new component, and one regression test per defect above,
  asserting the acceptance criterion.
- **Token contrast test:** computes WCAG ratios for every foreground/background pair in
  the palette and fails if a body-text token drops below 4.5 or a non-text token below
  3.0. This is what stops the palette silently regressing the way the pricing table did.
- Server: unit tests for the summary endpoint covering populated project, empty project,
  and project scoping (results from another project must not leak in).
- `tsc` and `eslint` clean; `ruff` clean on the server change.
- Playwright pass over all five routes at 1440px and 375px confirming no horizontal
  scroll and no console errors.

## Risks

**Bento is itself becoming a 2025–26 reflex.** Mitigated by restraint: no glassmorphism,
no gradient text, no uniform icon-heading-text card repetition, and tile sizes that vary
because importance varies rather than for visual interest.

**Dense dark layouts photograph poorly under feed compression.** The overview is the frame
intended for screenshots and is deliberately less dense than the working pages.

**Replay-mode data still makes weak screenshots** even with the waterfall fixed, because
the durations are genuinely near-zero. The real fix is shooting the demo in `--mode live`,
which needs an API key and is tracked separately from this work.

## Sequencing

1. Token system and theme composition — everything else depends on it.
2. Summary endpoint plus its tests (backend, independent of the frontend work).
3. `AppShell` left rail.
4. Overview page and its tiles.
5. The four defect fixes, each with its regression test.
6. Density pass over the four existing pages.
7. Full verification sweep.

Steps 1 and 2 are independent and can proceed in either order.
