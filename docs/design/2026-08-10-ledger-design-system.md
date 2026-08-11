# Ledger — Design System Spec

**Status:** Approved 2026-08-10 by the project owner · **Not yet implemented.**
**Supersedes:** the "Graphite & Magenta" dark theme in `dashboard/src/theme/`.
**Builds on:** `docs/overview-redesign-brief.md` (structure), which stays valid —
Ledger changes the *surface*, not the information architecture decided there.
**Owner:** Yash

---

## 1. The decision

The dashboard is being re-themed from a dark console to a **light document that
carries data**. The name for the system is **Ledger**.

Three directions were built as working specimens against live data and compared:
Instrument (dark, hairline rules, mono figures), Console (all-mono terminal),
and Report (light, editorial). The owner chose a hybrid of the last two, and
that hybrid is what this spec defines.

### The deciding argument

The question was never which looked best. It was **who reads the output.**

Console assumes the reader is the engineer who ran the eval — already fluent,
wanting density above all. Report assumes the reader is someone the eval is
being reported *to*.

The product exists because agent evals get laundered on the way to that second
person: untested reads as passing, a broken judge reads as a failure. The whole
analytics layer is built to stop it — a denominator on every figure, degraded
never folded into failed, "unexercised, not proven". **The victim of that
laundering is never the operator, who already knows. It is whoever downstream
reads "94% pass rate" and ships.** A design that serves only the operator argues
against the product's own thesis.

Two supporting facts settled it:

- **The metric detail page carries ~19,900 characters of body text** (measured,
  not estimated). Judge reasoning plus the measures/computed/catches copy. That
  writing is the product's differentiator, and monospace is a poor face for it —
  no italic, a crippled weight range, measurably slower for continuous prose.
- **This is not a monitoring product.** It runs in CI and produces a verdict per
  run. Nobody keeps it open for eight hours, which is the usual argument for a
  dark console and does not apply here.

### The governing rule

> **Prose is serif on paper. Data is mono on a tinted panel.**

The tint marks the boundary between what was **written** and what was
**measured**. That is a structural device encoding something true, not
decoration — which is the bar `impeccable`'s product register sets and the one
the previous theme failed.

---

## 2. Tokens

Replaces `dashboard/src/theme/palette.ts` wholesale.

### Colour

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F7F8FA` | Page ground. A **cool** off-white, biased blue. |
| `card` | `#FFFFFF` | Raised surfaces, side panels. |
| `data` | `#EFF2F6` | Data surfaces. One step cooler than paper. |
| `rail` | `#ECEFF3` | Left navigation. |
| `hair` | `#E1E5EB` | Hairline rules, row separators. |
| `hairStrong` | `#C9D0D9` | Section rules, table heads, borders. |
| `ink` | `#15181D` | Primary text. |
| `ink2` | `#414954` | Secondary prose. |
| `dim` | `#626B77` | Captions, labels, units. |
| `link` | `#1F5C8B` | Interactive only — links, focus rings, selection. |
| `pass` | `#1F7A4D` | Status: within threshold. |
| `watch` | `#8A5A0F` | Status: flagged, or a broken measurement. |
| `fail` | `#B3261E` | Status: breached threshold. |

**Warm cream is banned.** `#F4F1EA` and the whole warm-neutral band is the
single most saturated AI-generated default there is. The ground is biased
*blue*. If a future edit warms it, that is a regression.

**Magenta retires completely.** Including as the Answer-quality group hue in
`lib/groups.ts` — see §6.

### Colour discipline

Carried forward from the Overview redesign and non-negotiable:

- **If something is coloured, it has a status.** Colour is never decoration.
- `link` is the only non-status colour and appears only on interactive things.
- Verify: the metric detail page should show red exactly twice — the flagged
  count and the histogram bars below threshold. Nothing else.

### Type

Three faces, one rule each. **All self-hosted** — see §5.

| Role | Face | Used for |
|---|---|---|
| Prose | **Source Serif 4** (fallback Literata) | Verdicts, judge reasoning, explanations, section headings |
| UI | **Inter** | Controls, labels, navigation, chips, buttons |
| Data | **JetBrains Mono** | Every measured number, tables, axes, IDs, waterfalls |

Scale — fixed rem steps, ratio ~1.2, **not** fluid `clamp()`. Product UI is
viewed at consistent DPI and a heading that shrinks inside a panel looks worse.

| Step | px | Typical use |
|---|---|---|
| lede | 22 | The verdict sentence (serif) |
| h3 | 15.5 | Section heading (serif, 600) |
| prose | 16 | Body prose (serif, 1.62 line-height) |
| ui | 14 | Controls and labels (sans) |
| data | 12.5 | Table and figure text (mono, tabular-nums) |
| micro | 11 | Column heads, units (mono or sans, .05em tracking) |

- Reading column caps at **60–64ch**. Data tables may run full width.
- `font-variant-numeric: tabular-nums` on every mono surface.
- Uppercase tracked labels survive **only** as table column heads, where they
  are a real convention. They are gone from section headings — the eyebrow on
  every band was a named AI tell and is the reason headings move to serif.

### Space

8px rhythm. Section gap 24px, row padding 6–7px vertical, panel padding 12px.
Density comes **from the data surfaces, not from squeezing the prose.**

---

## 3. Structure

- **No floating cards.** Rules and tinted panels only. The 20px-radius bordered
  card with a gap between is the generic dashboard shell being removed.
- **Left rail, 178px.** Wordmark in serif, four links, project + trace count in
  the foot. The current 208px rail holding four links and a select is mostly
  empty space.
- **Top line per page:** page title (serif) · provenance badge · scope meta
  (mono) · `⌘K` affordance, over a `hairStrong` rule.
- **Data panels** are `data`-tinted, `hair`-bordered, 6px radius, mono
  throughout, with an uppercase micro column head row.
- **Prose blocks** sit directly on paper. No container.

---

## 4. Per-page application

Reference specimen: <https://claude.ai/code/artifact/f11669ac-9f3c-4bb8-8b62-49b0e0d037f0>

### Overview
Bands stay exactly as the redesign brief defines them — verdict, what changed,
what you can trust, where to look. Verdict becomes a 22px serif lede with the
flagged clause in `fail`. Deltas, trust figures and findings move into data
panels. The provenance warning becomes a serif note block with a `watch` left
rule.

### Traces — the page that had to prove the register
A 300-row grid does not want to be a document, **so it is not one**: it is a
mono data surface *inside* a document, the same move a profiler makes. Seven
columns — trace, latency, tokens, cost, evals, outcome, worst metric — dense and
column-aligned. Outcome filters become pills, not a select. The side panel keeps
its `?trace=` URL binding, renders the waterfall in mono, and carries **one
sentence of serif prose** interpreting the trace. That sentence is what the
document frame buys.

### Evals
Group panels keep their structure. Group hues are re-picked from a light-ground
palette (§6). Charts get a faint grid and an emphasised endpoint.

### Metric detail — where the register pays for itself
Two columns: prose left, data right. The measures/computed/catches copy and the
judge's verbatim reasoning set in 15.5–16px serif at a 60ch measure. Health
figures, the distribution histogram and its axis stay mono on tint. Histogram
bars below threshold are `fail`; the rest are a neutral steel. **Keep the
`minHeight: 3` rule** — it is what makes a count of 1 visible, the defect that
started this whole rework.

### Security
Posture rows become a data panel. Findings keep the serif treatment for judge
prose. The donut and bar charts are re-coloured for a light ground.

---

## 5. Fonts — the bug this also fixes

`typography.ts` has always declared Inter. **Nothing has ever loaded it.** No
`@font-face`, no font package, no link tag in `index.html`. Every screen has
rendered in Segoe UI while carrying `-0.02em` tracking tuned for Inter, which is
why headings looked subtly off.

Self-host via `@fontsource` packages — not a CDN link, so there is no
third-party request and no FOIT:

```
npm i @fontsource-variable/inter @fontsource-variable/source-serif-4 \
      @fontsource-variable/jetbrains-mono
```

Import once in `main.tsx`. Set `font-display: swap`. Subset to `latin` to keep
the bundle honest.

---

## 6. Known ripples

Things that will break or need a decision during implementation. None are
blockers; all are called out so they are not discovered as surprises.

1. **`lib/groups.ts` group hues.** Answer quality is currently `brand.solid`
   magenta, safety is violet, budgets is cyan — all picked for a dark ground.
   All three need re-picking for paper, staying outside the pass/watch/fail
   bands so a group never reads as a verdict. `GroupPanels.test.tsx` asserts
   colours and will fail until updated.
2. **`theme/contrast.ts` + its 26 tests** encode dark-ground ratios. They must
   be re-pointed at the light palette, not deleted — they are the guard that
   caught real contrast failures before.
3. **`tokens.spanTypes`** (5 hues for the waterfall) need light-ground variants.
4. **`SeverityChip` / `SyntheticBadge`** are built for dark fills.
5. **`<meta name="color-scheme" content="dark">`** in `index.html` must flip to
   `light`, or form controls and scrollbars stay dark.
6. **MUI theme mode** is `dark` in `palette.ts` and must become `light`.
7. **`@mui/x-charts` and `DataGrid`** inherit from the MUI theme; both need a
   visual pass after the mode flip.

## 7. Deliberately not doing

- **No dark variant.** Questioned by the owner and dropped. A report does not
  need one, and one theme that is exactly right beats two that are merely fine.
  If it is ever wanted it gets *designed*, never derived by inversion.
- **No motion beyond state feedback.** 150–250ms on transitions. No page-load
  choreography — the product loads into a task.
- **No glassmorphism, gradients, or gradient text.** `ui-ux-pro-max` recommended
  "Modern Dark, glassmorphism, indigo, ambient glow blobs" for this query; that
  is the first-order category reflex and is explicitly rejected.
