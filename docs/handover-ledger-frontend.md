# Handover — Ledger frontend, then demo readiness

**Written:** 2026-08-10 · **Branch:** `overview-analytics`, head `654cfc6`
**For:** the next session, whose scope is **the frontend and nothing else**,
finishing in a state that can be screenshotted for a job application and
recorded for a LinkedIn demo.

Do not start new backend work. The server is complete and verified; every
remaining backend idea is parked in `PROGRESS.md` → *Next up* and in
`docs/review-later.md`. If a backend change looks necessary to finish the
frontend, it probably is not — check the spec first.

---

## 1. Where things stand

The analytics-depth rework is **done through the Overview redesign**. Branch is
unmerged, ~12 commits ahead of `main`.

| Suite | State | Command (from the right directory) |
|---|---|---|
| server unit | 355 pass | `python -m pytest tests/unit -q` from `server/` |
| server DB | 36 pass | `docker compose exec -T server python -m pytest tests/integration -q -o asyncio_mode=auto --ignore=tests/integration/test_trace_pipeline.py` |
| dashboard | 325 pass, 31 files | `npx vitest run` from `dashboard/` |
| lint | clean | `ruff check .` from repo root · `npx tsc --noEmit` + `npx eslint src --max-warnings 0` from `dashboard/` |
| browser | 0 overflow, 0 console errors, WCAG AA | Playwright at 1440px and 390px |

**These are the gates. Every one of them must still pass when the frontend work
lands.** `ruff format` fails on 65 files at `main` as well — this repo has never
used the formatter. Do not "fix" it.

## 2. The job

Implement **Ledger**, specified in full at
`docs/design/2026-08-10-ledger-design-system.md`. Read it before touching code;
it carries the tokens, the type scale, the per-page application and — most
usefully — §6, the list of things that will break.

The working specimen, rendered against live data across Overview, Traces and
Metric detail:
<https://claude.ai/code/artifact/f11669ac-9f3c-4bb8-8b62-49b0e0d037f0>

The three rejected directions, for context on *why* Ledger:
<https://claude.ai/code/artifact/2b9bb373-1a1e-4013-a5d8-11c7b48ffc39>

The governing rule, which decides every ambiguous call:

> **Prose is serif on paper. Data is mono on a tinted panel.**
> If something is coloured, it has a status.

`docs/overview-redesign-brief.md` stays valid. Ledger changes the surface, not
the information architecture — do not re-litigate the band order or what was
deleted.

## 3. Suggested order

Each step ends green. Do not batch them; the contrast tests in particular will
tell you early if the palette is wrong.

1. **Fonts first.** Install the three `@fontsource-variable` packages, import in
   `main.tsx`, flip `<meta name="color-scheme">` to `light`. This alone fixes
   the tracking bug that has made every heading look subtly off, and it is
   visible immediately.
2. **Tokens.** Rewrite `theme/palette.ts` to §2, flip MUI `mode` to `light`,
   rewrite `theme/typography.ts` to the three-role scale. Re-point
   `theme/contrast.ts` and its 26 tests at the light palette — re-point, do not
   delete; they have caught real failures.
3. **Primitives.** `SeverityChip`, `SyntheticBadge`, `StatTile`, `EmptyState`,
   `QueryBoundary`, `ScopeBar`. Get the vocabulary right once.
4. **Overview.** Smallest surface, and its four bands are already correct.
5. **Metric detail.** The page that justifies the register. Serif prose column,
   mono data column. **Keep `minHeight: 3` on histogram bars** — that is what
   makes a count of 1 visible, and its absence elsewhere is the defect that
   started this rework.
6. **Traces.** The hard one. Grid becomes a dense mono data surface, filters
   become pills, side panel keeps `?trace=` and gains one serif sentence.
   Re-verify no horizontal overflow at 390px — this page has regressed there
   once already.
7. **Evals and Security.** Re-hue groups and charts for a light ground.
8. **Full gates**, then the demo pass in §4.

## 4. Demo readiness — do not skip this

The frontend is not finished when it looks right. It is finished when it can be
shown.

### 4.1 Flip the landing project. This is a blocker.

`DEFAULT_PROJECT` in `dashboard/src/context/ProjectContext.tsx` is
`synthetic-showcase`, set deliberately for development because it is the only
corpus dense enough to read a design against.

**Every figure in it is `rng.gauss()`.** `raw_judge_output` is NULL on all 2400
of its rows — no judge was ever called. It must not appear in a screenshot, a
recording, or a resume claim (`docs/review-later.md` R5, R16).

Change it to `demo-research-agent` before any capture. One line.

### 4.2 Know what the real corpus actually contains

`demo-research-agent`, 31 traces, 296 measurements:

- **222 measured** — deterministic and security metrics computed by code from
  recorded spans. No model in the loop. Reproducible.
- **50 judged** — real Claude calls that returned a verdict with reasoning.
- **12 broken** — `AuthenticationError: 401 — invalid x-api-key`, from a run
  against an expired key.

Those 12 are **a demo asset, not an embarrassment.** They are the live proof of
the product's central claim: a broken measurement is shown as broken instead of
being averaged in as a failure. Most tools in this category would have rendered
them as twelve fabrication incidents. Say so out loud in the demo.

### 4.3 A demo path that tells the truth

1. **Overview** — the verdict sentence. On `demo-research-agent` the gate fires
   *"2 metrics regressed against baseline"*, which is the strongest opening the
   product has: a claim with a p-value and an effect size behind it.
2. **The trust band** — "5 of 8 metrics never moved — unexercised, not proven."
   This is the thesis in one line. No competitor says it.
3. **Metric detail, faithfulness** — the judge's own reasoning on a failing
   trace, quoting *"(no retrieval context available)"*. Real model output, and
   the reason the serif register exists.
4. **Traces** — filter to `degraded`, show the 12 broken measurements kept out
   of the failure count.
5. **Security** — prevalence, never a rate. One breach is one breach.

### 4.4 Verify before capture

- Landing project is `demo-research-agent` and no `GENERATED DATA` badge is on
  screen.
- Re-run the Playwright pass at 1440px and 390px: zero overflow, zero console
  errors, contrast AA.
- Screenshot at a **1440px viewport with `device_scale_factor=2`** — the
  existing script in the session scratchpad does this; copy it into
  `scripts/` if it is worth keeping.

## 5. Open, unattended, and honest about it

Nothing below blocks the frontend. All of it is written down so none of it
survives as an unexamined default.

### Newly opened by this work

| # | Item | Where |
|---|---|---|
| R16 | Landing default points at the generated corpus — **flip before demo** | `review-later.md` |
| R17 | Provenance is a hard-coded frozenset, not a property of the data | `review-later.md` |
| — | `theme/contrast.ts` tests encode dark-ground ratios | §6 of the spec |
| — | Group hues, span-type hues, chip fills all need light-ground variants | §6 of the spec |

### Carried, still open

- **R2** — "no applicable spans" still scores `1.0`, so unmeasurable is
  indistinguishable from passing at write time. The analytics layer cannot fix
  this; it is a stored-data decision and a migration.
- **R7** — the Budgets panel admits it cannot show the margin. Now unblocked by
  `measured_quantity` in `eval_engine/details.py`. Good frontend work if there
  is appetite after Ledger: p50/p99 of `latency_ms` and `cost_usd` against their
  limits.
- **R9** — findings capped at 50 with no disclosure. Latent: neither project
  exceeds it. A silent truncation is the one failure mode this whole rework
  exists to remove, so it should not stay latent forever.
- **R10** — only `injection_resistance` records an attempt signal, so
  `data_exfiltration` and `tool_misuse` cannot distinguish "clean" from "never
  tested".
- **R13, R14** — outcome column is unsortable; "worst metric" ties break
  arbitrarily.
- **R4** — the variance chart truncates its y-axis and says so. Confirm the
  disclosure is enough or switch to a zoomed inset.

### Worth doing before the application, not strictly frontend

- **Re-run the demo agent against a working `ANTHROPIC_API_KEY`.** 31 traces and
  50 real judged measurements is thin, and 12 of the judge calls are auth
  failures. A clean run would deepen the only corpus that may be shown as
  evidence. Costs cents. `ANTHROPIC_API_KEY` lives in `.env`, gitignored — never
  print or commit it.
- **`PROGRESS.md` → Claims status** should be re-read end to end before anything
  goes on a CV. Every quantified claim must be traceable to a real run.

## 6. Environment gotchas that cost time before

Full list in `PROGRESS.md` → *Known issues*. The three that will bite during
frontend work:

1. **Vite serves a stale module after an edit** in the mounted dashboard
   container. The file is correct inside `/app`, HMR misses it, the browser
   keeps rendering the old string. `docker compose restart dashboard`. This cost
   20 minutes chasing a fix that was already applied — and it will look exactly
   like "my theme change did nothing".
2. **Never `docker compose down -v`** — it destroys `agentproof_pgdata` and with
   it the only real corpus.
3. **After a dashboard dependency change** (which installing three font packages
   is), `docker compose up --build` is not enough: an anonymous volume masks
   `node_modules`. Run `docker compose rm -sfv dashboard` first.

## 7. House rules

- **No AI attribution in git.** No "Generated with Claude Code" footer, no
  `Co-Authored-By: Claude` trailer, in commits, PR bodies or merge text.
- TDD for anything with logic. The theme is mostly declarative, but
  `contrast.ts`, group-hue selection and any new pure helper are testable and
  should be tested first.
- Commit per step in §3, each one green.
