# AgentProof — Progress

**Current phase:** Ledger frontend — **built and verified**
**Branch:** `overview-analytics`
**Last updated:** 2026-08-10

> Ledger is implemented across all six routes and the app lands on the
> **measured** corpus (`demo-research-agent`). The branch is demo-ready: run
> `python scripts/demo_check.py` before any capture — it fails if the landing
> project or a generated-data marker ever regresses.

## Last verified working

Full sweep, 2026-08-10, after Ledger landed.

| Suite | Result | How verified |
|---|---|---|
| server (host) | 355 passed | `python -m pytest tests/unit -q` **from `server/`** |
| server DB (container) | 35 passed, 1 **intermittent** | `docker compose exec -T server python -m pytest tests/integration -q -o asyncio_mode=auto --ignore=tests/integration/test_trace_pipeline.py` — see Known issues #10 |
| dashboard | 383 passed, 32 files | `npx vitest run` (was 325/31 before Ledger) |
| lint | All checks passed | `ruff check .` from repo root |
| types + lint (dashboard) | exit 0 | `npx tsc --noEmit` and `npx eslint src --max-warnings 0` |
| production build | 4 latin woff2, 191 kB of type | `npx vite build` — asserts the font subset never widens |
| live endpoint | 200, partition holds | `GET /api/v1/evals/analytics` — `scored + unmeasurable + pending == traces` in every scope |
| all 6 routes in a browser | 0 overflow, 0 console errors, WCAG AA | `python scripts/ui_audit.py` at 1440px and 390px — 12/12 clean |
| demo readiness | passed | `python scripts/demo_check.py` — lands on `demo-research-agent`, no generated-data marker on any route |

Two scripts now carry the browser gate, because it caught three real defects
that no unit test could have:

- **`scripts/ui_audit.py`** — overflow, console errors, resolved font
  families, and a WCAG AA sweep per text node, at both viewports. Reports;
  does not gate.
- **`scripts/demo_check.py`** — fails if the app lands anywhere but the
  measured corpus, or if a generated-data marker appears anywhere a
  screenshot could catch it. **Run before any capture.**

`ruff format --check` reports 65 files at HEAD as well as on this branch — this
repo has never used the formatter, so it is not a regression and was not run.

The host skips are DB-backed integration tests (port 5432 conflict, see Known
issues) plus key-gated judge tests.

`test_eval_pipeline.py` now passes 3/3 against real judge calls; the two
failures logged earlier were both fixed by the `span_names` widening (gap #3).
`test_trace_pipeline.py` still cannot be collected in the container — it
imports the `agentproof` SDK, which the server image does not install.

Application-hardening figures, verified 2026-08-08 before that merge, unchanged
since: sdk 43 passed; demo_agent 37 passed, 1 skipped; dashboard 140 passed;
CI 6/6; both regression gates PASS exit 0.

**Repo:** public, `github.com/yash2484/AgentProof`. Tags continuous
`phase-1` … `phase-8`. Remote branches: `main`, `overview-analytics`.

## The measured corpus — `demo-research-agent`

Re-run live 2026-08-10 with a working `ANTHROPIC_API_KEY`. This is the corpus
the app lands on and the only one that may be shown as evidence.

| | Before the re-run | Now |
|---|---|---|
| traces | 32 | **45** |
| measurements | 312 | **520** |
| computed by code (deterministic + security) | 195 | **390** |
| genuine judge verdicts, with reasoning | 60 | **108** |
| judge calls that failed auth | 12 | **12** (all historical) |
| evaluation runs in window | 8 | **10** |

The re-run added **13 traces, 208 measurements and 48 genuine verdicts with
zero auth failures.** The 12 `401 invalid x-api-key` rows are the original
ones and are kept deliberately: they are the live demonstration that a broken
measurement is excluded rather than counted as a failure. Total spend on the
corpus to date is **$0.128** across 37,800 tokens.

**The gate verdict changed, and this matters for the demo.** Before: *"2
metrics regressed against baseline"*. Now all **8 of 8 metrics are comparable
and none regressed** — `faithfulness` actually improved (0.911 → 0.925).

What the run bought instead is the **restraint case**, which is the behaviour
worth leading with (see R26): `relevance` dropped and the gate refused to
call it —

```
relevance   base=0.931  cand=0.908   p=0.3877 >= alpha=0.05,  d=0.113 < 0.5
```

An effect exists, neither the significance nor the effect-size guard clears,
and the product says so rather than reporting a decline. That is the sentence
almost nothing else in this category will print.

**Consequence:** there is currently **no regression on the demo corpus**, so
the "CI run blocks a merge" opening in R26 cannot be shown from this data as
it stands. Do not manufacture one by re-pinning a baseline — that would be
fabricating the exact claim the product exists to make honestly. The real
options are to run a genuinely degraded agent version (a weakened prompt is a
legitimate change) and let the gate catch it, or to open the demo on the
restraint case instead.

## What this product is for

Recorded 2026-08-10. **Judgement, not measurement** — inferred from what the
code does well, validated with nobody. Full reasoning and the review triggers
are in `docs/review-later.md` R23–R25.

**Best case: a CI regression gate for a team shipping an agent as a product.**
A fixed eval set runs against a pinned baseline and returns a verdict per run
carrying a p-value and an effect size. The distinguishing behaviour is that it
declines to conclude when the sample cannot support a conclusion.

Three properties carry that, all verified in code:

- the ±0.2 judge swing is **measured**, not assumed, and appears on every
  judged figure, so a smaller move is labelled as not evidence;
- degraded is never folded into failed (the 12 auth-failed judge calls in
  `demo-research-agent` are excluded from every score, not counted against
  the agent);
- a metric that never varied reads as unexercised, never as passing.

**Not** an observability or monitoring product. Evaluation is after-the-fact
and batch; there is no live ingest. The Ledger spec says it directly: *"This
is not a monitoring product. It runs in CI and produces a verdict per run."*
Competing with LangSmith or Langfuse on live tracing means competing on the
one axis where this is weakest.

**The "developer using an LLM CLI" audience does not work directly** and a
demo should not be built on it. Every ad-hoc coding session is a different
task, so there is no fixed input to pin a baseline against, and the
regression detector — the core of the product — has nothing to bite on. See
R24 for the other two reasons.

**The variant that does work** is fixed-task self-benchmarking: pin a set of
coding tasks, then change something the user controls (`CLAUDE.md`, skills,
model tier, MCP config) and re-run the same set. That restores the fixed
input. Enabled by Claude Code's own session transcripts, which already carry
model, token usage, tool calls, full content and a `parentUuid` chain that
maps onto the span DAG — verified by inspection, see R25. The missing piece
is an importer, not a capability, and the metric config has to be rethought
for coding work before it is built.

### Who it is for, in one paragraph

**Tier 1:** teams of 2–15 shipping an LLM agent as a *core product feature*,
with CI already running — support agents, document analysis, research
assistants, coding agents, regulated-output tools. They ship weekly, change
prompts constantly, cannot justify a dedicated evals engineer, and their
failures reach customers. **Start in the LangGraph community**, where the
integration cost is one line. Full tiering, the communities ranked by
signal-to-noise, and what *not* to chase are in `review-later.md` R26.

**The wedge:** other tools report that a number moved; this one reports
whether it moved further than the measured noise, and refuses to answer when
the sample cannot support an answer. LangSmith owns tracing and breadth by
default — do not compete there.

**Demo implication:** lead with a CI run that blocks a merge, p-value
visible, ideally followed by one that *declines* to block and says why. The
dashboard is the evidence, not the claim.

## Decided, not yet built — Ledger, the theme rework

**Spec:** `docs/design/2026-08-10-ledger-design-system.md` ·
**Handover:** `docs/handover-ledger-frontend.md` ·
**Specimen:** https://claude.ai/code/artifact/f11669ac-9f3c-4bb8-8b62-49b0e0d037f0

The dashboard moves from a dark console ("Graphite & Magenta") to a **light
document that carries data**. Three directions were built as working specimens
against live data — Instrument (dark, hairline rules), Console (all-mono
terminal), Report (light, editorial) — and the owner chose a hybrid of the last
two on 2026-08-10.

**The rule:** prose is serif on paper, data is mono on a tinted panel. The tint
marks the boundary between what was *written* and what was *measured*.

**Why, in one line:** the product exists because evals get laundered on the way
to whoever ships on them, and that reader is never the operator. A console
design serves only the operator and argues against the product's own thesis.
Two measured facts settled it — the metric detail page carries ~19,900
characters of body text that monospace sets badly, and this is a CI product read
per run, not a monitoring product watched all day.

**Also fixes a real bug:** `typography.ts` has always declared Inter and
**nothing has ever loaded it** — no `@font-face`, no package, no link tag. Every
screen has rendered in Segoe UI while carrying `-0.02em` tracking tuned for
Inter, which is why headings looked subtly off.

No dark variant. Questioned by the owner and dropped: one theme that is exactly
right beats two that are merely fine.

## Built & verified — Ledger (this phase)

Spec: `docs/design/2026-08-10-ledger-design-system.md`. Built in the eight
steps of `docs/handover-ledger-frontend.md`, one commit each, every one green.

**The dashboard is a light document that carries data.** Prose is serif on
paper, data is mono on a tinted panel, and a colour always means a status.
The tint is the structural device: it marks the boundary between what was
*written* and what was *measured*.

What the work turned up that the spec could not have known:

- **The serif was invisible, and silently so.** `Source Serif 4 Variable`
  unquoted is invalid CSS — a font-family identifier may not begin with a
  digit — so browsers discarded the whole declaration. Headings rendered at
  the correct size, weight and tracking in the wrong face, with nothing in
  the console. A unit test now asserts every stack is quotable-and-quoted.
  (The spec's claim that Inter had never loaded was stale; `main.tsx` had
  imported `@fontsource/inter` since the previous phase.)
- **The series ramp was built for a dark ground.** It lightened each sibling
  series toward white, which on the old surface only improved legibility and
  on paper walked series 2–4 into the background. Measured: only one
  lightening step clears 3:1 here, so the ramp now steps mostly toward ink.
- **The scope bar asserted a falsehood.** Given no runs it printed
  "0 runs · never evaluated" above a page listing 300 traces. Absent is not
  zero — the same laundering the product exists to prevent, committed by the
  product. Now guarded by a test pinning `undefined` against `[]`.
- **The verdict lede leaked a developer diagnostic.** On the measured corpus
  the largest sentence in the product read `Small sample -> absolute-drop
  floor: drop 1.000 >= 0.05..`. It now says what moved.

Deliberately **not** built: the spec's `⌘K` affordance. No command palette
exists, and advertising a shortcut that does nothing is worse than silence.

Colour discipline holds: the categorical band (span types and metric groups
share one set) sits ≥25° from every verdict hue, asserted by hue distance
rather than a hex allowlist — which is what let the old test pass while the
palette moved underneath it. Magenta is retired everywhere.

The token compatibility layer that carried 30 files through the flip has been
deleted, and a test asserts the old names cannot come back.

## Built & verified — the Overview redesign (previous phase)

Full diagnosis, decisions and theme rules: `docs/overview-redesign-brief.md`.

**The Overview is now a triage page.** It answers the one question no other
page does — *since last time, did anything get worse, and can I trust today's
numbers?* — in four bands: verdict, what changed, what you can trust, where to
look. All four are `aria-label`led landmarks.

**Deleted rather than redesigned:** `MetricDistribution`, `MetricHealthPanel`,
`MeasurementHealth`, `VolumeCard`, `GateVerdictCard`. The first two duplicated
`/evals` and `/evals/:metric` and did it worse. Measured defect: bar height was
normalised by the tallest bin, so `data_exfiltration`'s single breach rendered
**0.45px tall in a 46px track**. Rare events were invisible in proportion to
their rarity. The gate card's one real fact ("no baseline is pinned, so no
regression verdict is possible") survives as a figure in the trust band.

**Three server defects found by the design work, all fixed:**

1. `totals.pending` rendered **-6** on the live corpus. It was
   `traces - evaluated`, subtracting two differently-scoped counts — traces
   filtered on `created_at`, eval rows on `evaluated_at`. 19 traces were
   evaluated inside the window but created before it. Replaced by
   `_trace_health_stmt`, a genuine SQL partition where
   `scored + unmeasurable + pending == traces` at every input.
2. `scored` undercounted by 15. Traces holding both a usable measurement and a
   broken one were counted wholly as degraded.
3. The card labelled `degraded` as **"failed"** — the exact thing that card
   existed to prevent.

**"All projects" no longer pools a generated corpus** (`provenance.py`).
337 traces → 37, enforced server-side so the mixed figure cannot be produced by
the API at all. Consistent across analytics, security and the traces list.

**Provenance replaces the binary badge.** Checked against the database rather
than assumed: `demo-research-agent` holds 222 measurements computed by code
from recorded spans, 50 returned by a live judge, and 12 that failed with
`AuthenticationError: 401`; `synthetic-showcase` has `raw_judge_output IS NULL`
on all 2400 rows. So a deterministic metric on the demo project is *more*
trustworthy than a judged one there, which a two-state badge cannot say.

**Two defects found while wiring it up:**

- The switcher rendered **blank** when the landing project was absent (MUI
  renders a Select whose value is missing from its options as empty). It now
  falls back to "all projects" and self-heals.
- Deriving the project list from an unscoped `listTraces` made the generated
  corpus **vanish from the switcher** the moment aggregates began excluding it.
  Fixed with `GET /api/v1/projects`, which lists every project with its
  provenance: the rule is that generated data must never be *pooled*, not that
  it must be hidden.

New pure modules, both TDD: `lib/verdict.ts` (14 tests) and `lib/provenance.ts`
(6 tests). `server/provenance.py` has 10.

**Open follow-ups:** R16 (landing default points at the generated corpus — flip
`DEFAULT_PROJECT` before any demo) and R17 (provenance is a hard-coded set) in
`docs/review-later.md`.

## Built & verified this phase — Overview analytics (server)

Design spec: `docs/superpowers/specs/2026-08-08-overview-analytics-design.md`.
Handover: `docs/handover-overview-analytics.md`.

- [x] **`GET /api/v1/evals/analytics`** — one endpoint, six SQL aggregates
  (`server/agentproof_server/api/analytics.py`). Every figure computed in SQL;
  the design spec's seven endpoints collapse to one. *Verified: 59 unit tests +
  14 DB-backed tests against real Postgres.*
- [x] **The misleading security verdict is gone.** The screen said
  *"injection_resistance regressed — the agent gave ground under attack"* from
  one row with no denominator. Giving it a denominator made it
  `1 of 35 flagged, mean 0.971`; finding the nested judge record (below)
  showed the 1 was never a finding. It now reads **`0 of 35 flagged, mean
  1.000, 1 degraded`**. *Verified: live call against the demo project.*
- [x] **`degraded` derived from `details`, no migration.** A judge error or
  refusal is a failed *measurement*, not a finding. Degraded rows are excluded
  from `mean_score`, `std`, `pass_rate` and the histogram, and counted
  separately — the judge fails closed to 0.0, and folding a timed-out API call
  into the mean is exactly how one bad call became a breach headline.
  *Verified: DB tests for an `error` blob, a `refusal` blob, a NULL `details`,
  and a deterministic 0.0 that must still read as a real failure.*
- [x] **Eval runs gap-clustered, not grouped by timestamp.** `runner.py:137`
  stamps `evaluated_at` per trace, so equality grouping reported 13 runs where
  there were 2. Rows within 120s are one run. *Verified: DB test seeds 13
  traces 4s apart and asserts one run; a companion test pins that zero
  tolerance reproduces the 13-run miscount.*
- [x] **Gate verdict computed on the fly.** Regression results are never
  persisted, so the endpoint loads `baselines/*.json` (newest `created_at`
  wins per metric), pulls candidate scores from Postgres and calls the existing
  pure `detect_regression()`. No table, no migration. The candidate sample is
  the *latest run*, not the whole window. *Verified: the restraint case
  (d=0.607 clears, p=0.116 does not → not flagged, both numbers returned) and
  the firing case, plus no-candidate-scores → `comparable: false`.*
- [x] **`has_variance` keeps "never varied" out of the healthy bucket.** `std`
  is `stddev_samp`, which is NULL at n=1 — "cannot tell", not "perfectly
  stable". Both NULL and 0.0 report `has_variance: false`. *Verified: DB tests
  at n=1 and with four identical scores.*
- [x] **`ci_block` serialised** on eval-result rows and `/evals/metrics`. It
  lives on `MetricConfig` (default `True`) and had never reached the client, so
  nothing downstream could tell a blocking metric from an advisory one.
  Unknown metrics fall back to `True`. *Verified: 3 unit tests; live call shows
  `relevance` correctly `ci_block: false`.*

**One bug the live check caught in this session's own code.** Summing
per-timestamp trace counts reported `trace_count: 26` for a project holding 25
traces — 13 traces evaluated twice inside one window, double-counted. Fixed by
carrying trace ids through the fold and deduping per run (`array_agg` in SQL);
now caps at 13. Regression test pins it, and a companion test pins that the
same trace in *two* runs still counts in each.

## Built & verified this phase — Overview analytics (dashboard)

- [x] **The Overview is an analytics surface, not four flat tiles.** Sticky
  scope bar (project · window · last evaluated · run count), then Band 1
  (gate verdict, volume, measurement health), Band 2 (metric health in two
  registers), Band 3 (run-to-run variance), Band 5 (findings). *Verified: 194
  dashboard tests; rendered in Chromium against the live stack at 1440px and
  375px with zero console errors and no horizontal overflow.*
- [x] **The misleading verdict is deleted, not just unused.** `VerdictTile`
  and `lib/overview.ts` are gone — they were the only source of
  *"injection_resistance regressed — the agent gave ground under attack"*,
  and leaving them in the tree meant someone could wire them back in. Both
  had become dead code once the page was rebuilt. *Verified: a test asserts
  the rendered page contains neither "gave ground" nor "regressed".*
- [x] **Severity and register assignment are pure functions** in
  `lib/analytics.ts` with 31 colocated tests — the small-sample cap, the
  100%-at-any-n rule, the `ci_block` distinction, and the rule that a metric
  with `std = 0` can never render as healthy.
- [x] **The restraint case reaches the screen.** Live, with the demo project
  selected: *"Not flagged — injection_resistance · effect is small (d=0.24)
  and not statistically significant at this sample size (p=0.163)"*, with
  t-statistic, both sample sizes and the raw reason one click away.
- [x] **Two copy bugs found by looking at the rendered page**, neither
  catchable by a passing test suite: the statistics line said "small **but**
  not significant", manufacturing a disagreement between two guards that
  actually agreed (now "but" only when the effect cleared and significance
  did not); and the footer read "in the last all time". Both now pinned by
  tests.
- [x] **A histogram bug the tests could not see.** `floor(1.0 * 10) / 10`
  opened a zero-width bin at 1.0 whose bar rendered off the end of a 0→1
  track — 34 of `injection_resistance`'s 35 observations were invisible.
  Scores of exactly 1.0 now clamp into the 0.9–1.0 bin. *Verified: DB test
  asserts no 1.0 bucket exists; confirmed by eye in the browser.*

## Built & verified — analytics depth, Phase A (Overview corrections)

Design spec: `docs/superpowers/specs/2026-08-09-analytics-depth-design.md` §6.4.
Phase B (the `synthetic-showcase` corpus) shipped first and is what exposed
three of these four defects — at 25 traces and 4 runs they were invisible.

- [x] **The pooled run mean is gone; three per-group series replace it.**
  Metric type now maps to a group server-side (`metric_group()`: `llm_judge →
  quality`, `security → safety`, `deterministic → budgets`, anything else →
  `other`), and `eval_runs` rows carry `group_means` instead of one
  `mean_score`. A judge score, a 0/1 breach flag and a binary budget check do
  not share a unit. *Verified, measured on the 300-trace corpus: quality reads
  0.925 → 0.785 (−0.140) across nine runs where the pooled figure read 0.972 →
  0.918 (−0.054) — a real drift rendered as noise, diluted by six metrics
  pinned at 1.000.*
- [x] **Degraded rows excluded from run means**, as `metric_health` already
  excluded them. Runs 1–3 of the demo corpus read a flat `0.750` because each
  held 24 eval rows of which 6 were broken judge calls scoring 0.0 — six failed
  API calls rendered as a quality score. *Verified: DB test seeds two clean 1.0
  rows against two degraded ones and asserts 1.0, not 0.5; a companion test
  asserts a run of only broken calls scores `null`, not zero.*
- [x] **The overloaded word "runs" is fixed.** The same screen said `9 runs`
  (scope bar, evaluation runs) and `33 of 294 runs flagged` (findings feed,
  eval rows). Both true, two different nouns. Severity copy and the count chip
  now say **measurements**, which is what `metric_health.count` holds — not
  runs, and not traces either, since 25 traces produced 35 rows for a
  deterministic metric. *Verified: two tests assert the copy contains neither
  "run" nor "trace"; confirmed in the browser.*
- [x] **A fourth defect, found by rendering the fix.** With three honest series
  the 0–1 axis flattened the drift to a hairline — the same invisibility the
  pooled mean produced, arriving by a different route. The axis now drops to
  the tenth below the lowest point (capped at 0.9 so a perfect run keeps
  visible range) **and says so**: *"Axis starts at 0.70, not 0."* A truncated
  axis exaggerates movement, and an undeclared one is a deception whether or
  not it was meant as one. *Verified: 4 unit tests on `axisFloor`, plus tests
  that the disclosure appears when truncated and is absent when it is not.*
- [x] **One taxonomy, not two.** `hasJudgeNoise` now reads the server-assigned
  group rather than re-deriving from `metric_type`, and the ±0.2 judge band is
  scoped to the judged group only — a latency budget is measured, not judged,
  so drawing an uncertainty band around it invented uncertainty that is not
  there. *Verified: a test asserts the deterministic group's delta carries no
  "judge swing" text.*

**TDD note.** The four new DB tests were checked genuinely red by swapping
`api/analytics.py` back to `HEAD` and re-running — all four failed, then passed
against the new file. The unit tests went red first in the ordinary way.

## Built & verified — analytics depth, Phase C (Evals rebuild)

Design spec §6.1. The page it replaces drew eight metrics as eight lines on
one 0–1 axis; three of those lines meant different things by "1.0".

- [x] **Three group panels, three chart forms, three axes.** Quality is graded
  → a distribution over runs with the ±0.2 band. Safety is 0/1 taken to the
  trace by `min` → a prevalence **count**, never a rate, because "97% safe" is
  not a sentence anyone should say about a security control. Budgets are
  binary compliance → a rate that openly admits it hides the margin.
- [x] **A metric strip that is also the navigation** — every metric as a tile
  carrying its current value, its delta since the previous run *in words*, its
  denominator, and its severity. Clustered by group rather than laid out as a
  uniform eight-up grid, because the grouping is the information.
- [x] **`/evals/:metric`** — what it measures, how it is computed, what it
  catches, then current state, distribution, history, and the worst rows.
- [x] **The judge's reasoning is on screen for the first time.** Those strings
  have been written to `details.per_span` since the judge shipped and
  displayed nowhere. The demo project's worst faithfulness row now shows the
  judge's full argument for scoring it 0.350.
- [x] **A metric explanation registry** (`lib/metricCopy.ts`) keyed by name
  with a fallback by type, so a metric added to `agentproof.yaml` still
  renders something sensible. "How it is computed" states the actual
  mechanism — a reader who cannot reproduce the number cannot argue with it.

**Three defects the live render found, none catchable by a passing suite.**

1. **A deep link pooled the generated corpus into the real one.**
   `ProjectContext` is in-memory, so `/evals/faithfulness` opened fresh fell
   back to *all projects* — a tile reading `2 of 27` opened a page reading
   `321`, silently mixing `synthetic-showcase` into `demo-research-agent`.
   Scope now travels in the URL (`?project=…&days=…`), the detail page states
   its scope, and the pooling case says so in words.
2. **Sibling series were indistinguishable.** Two magenta lines stepped by
   opacity read as one colour dimmed on a dark surface. Now stepped by
   lightness, mixed toward white.
3. **The synthetic corpus contradicted itself on screen** once reasoning was
   displayed: a 0.616 labelled *"Every claim traces to a retrieved chunk"*.
   Prose is now banded by score. Banding it initially *weakened the drift*
   from 0.15 to 0.08 — `random.choice` consumes a variable number of bits with
   sequence length, so a copy change shifted the whole RNG stream. The choice
   is now a pure function of the score and touches no randomness. Drift
   measured after reseeding: **0.938 → 0.771**.

## Built & verified — analytics depth, Phase E (Traces rebuild)

Design spec §6.3. The grid showed name, status, latency, tokens and cost —
everything except the thing this product measures.

- [x] **Two columns that make the list scannable:** what a trace's
  measurements did (`1 of 8 failed`, `8/8 passed`, `not evaluated`) and which
  metric scored lowest on it (`Faithfulness 0.679`).
- [x] **One aggregate per page, never N+1.** Outcomes arrive as a single
  `GROUP BY trace_id` over the page's ids, with `array_agg` ordered by score
  carrying the worst metric's *name* out of SQL alongside the counts.
- [x] **The outcome filter runs in the database**, joined as a subquery.
  Trimming the page client-side would have returned short pages and a wrong
  total. *Verified: the four outcomes partition the corpus exactly —
  53 failed + 232 passed + 15 degraded + 0 unevaluated = 300 traces.* An
  unknown value 422s with the list of valid ones.
- [x] **An unmeasured trace never renders as a pass.** `0/0` reads as a pass
  at a glance, so it says `not evaluated`; a trace whose measurements all
  broke says `degraded`, because something ran and it broke — a different fact
  from nobody trying.
- [x] **Selection and filter live in the URL** (`?trace=…&outcome=…`), so both
  survive a reload and the back button. The panel sits beside the list, not
  over it.
- [x] **Delete moved out of the row and behind a typed confirmation.** It was
  a button on every row guarded by `window.confirm` — one mis-click from
  destroying a recording.

**One defect the live render found:** the outcome filter was unreachable by
its accessible name. An `aria-label` passed through `inputProps` lands on
MUI's hidden input rather than the combobox the user operates, so keyboard and
screen-reader users had no name for the control. The visible label is now the
accessible name, pinned by a test that opens the filter through it.

## Built & verified — analytics depth, Phase D (Security rebuild)

Design spec §6.2. Replaces a wall of one card per security eval row — a layout
that grew linearly with traces, enumerated passes as loudly as failures, and
carried no denominator anywhere on it.

- [x] **`GET /api/v1/security/analytics`** — posture per metric, attack
  surface, breaches per run, and findings, all aggregated in SQL.
- [x] **The attempted denominator is on screen for the first time.**
  `injection_attempted` has been stored since the security evaluator shipped
  and displayed nowhere. A breach count means little without it: `0 of 0
  attempted`, `0 of 34 attempted` and "nobody checked" are three different
  facts and only one is reassuring, so the field is tri-state end to end.
  *Live on the demo project: `injection_resistance — no breaches in 36
  measurements · 5 of 36 measurements were under attack`.*
- [x] **A fourth instance of the shape bug, caught by the accessor.** The flag
  nests under the heuristic leg in `dual` mode. Measured before the fix: the
  demo project had it on **0 of 37 rows at top level and 37 nested, with 5
  real attempts** — a top-level read would have reported zero attacks while
  five sat in the data. The `$.**` predicate and `attack_attempted()` find it.
- [x] **Counts, never rates.** No percentage appears anywhere in the posture
  strip, and a test enforces it: "97% safe" is not a sentence anyone should be
  comfortable saying about a control.
- [x] **Charts chosen by what the data is**, per the local chart guidance: a
  donut for the attack surface (two categories, one dominant — the one place
  a pie form is correct), columns for breaches by run (discrete buckets, so
  nothing is drawn between them), counts everywhere else. Pie forms grade C
  for accessibility because slices carry meaning in colour alone, so the raw
  counts and the percentage sit in text beside the ring, never only inside it.
- [x] **Empty is stated, not left blank.** "No breaches recorded across 9
  runs" is the good outcome and says so; a blank frame reads as broken.
- [x] **`SecurityReportCard` deleted, not orphaned** — same discipline as
  `VerdictTile` in Phase A. Dead code that renders a denominator-free verdict
  is code someone can wire back in.

**Two defects the live render found.**

1. **A control that was attacked and held was being called unexercised.** The
   "never varied" copy was written for the Overview's ceiling strip, where a
   flat score means nothing probed it. With five recorded attacks behind it, a
   flat score means it *resisted* them. The honesty rule cuts both ways, and
   understating real evidence is as wrong as overstating it. Now reads
   `resisted every recorded attack (5)`.
2. **The scope bar reported `0 runs · never evaluated`** above a page showing
   nine runs, because it took a whole eval-analytics payload and the Security
   page has its own shape. It now takes the run list itself; all three pages
   report 9 runs, verified in the browser.

## Built & verified — `eval_engine/details.py`, one home for shape knowledge

Three separate defects this session came from code assuming one shape of the
`details` JSON blob while a second shape existed: degraded detection missing
`$.llm.per_span`, the drill-down needing prose from both places, and the same
budget quantity arriving under different keys per project. Rather than fix the
class a fourth time, shape knowledge now lives in one tested module and
readers never index `details` directly.

- [x] **`per_span_records` / `is_degraded` / `has_broken_record`** — the
  recursive walk plus a deliberately *non*-recursive single-leg variant, since
  the security evaluator asks about the llm leg alone when deciding whether to
  fall back and must not see the other leg.
- [x] **`reasoning_records`** — judge prose with the score it explains, or the
  error when the call failed. Heuristic records contribute nothing rather than
  an empty quote, because a blank block reads as "the judge said nothing" when
  no judge ran.
- [x] **`measured_quantity`** — the real number behind a budget check with its
  limit, read under either spelling. This is what will let the Budgets panel
  show the margin it currently only admits to hiding.
- [x] **The asymmetry that caused it is fixed at source.**
  `LatencyBudgetEvaluator` had always surfaced a stable `latency_ms` alias
  alongside its budget field; `CostBudgetEvaluator` never did. It does now, and
  the synthetic generator writes both spellings for both metrics — the corpus
  only works as a stand-in while its shapes are the real shapes.
- [x] **`api/analytics.py` and `eval_engine/security.py` now import it** rather
  than carrying their own copies.

*Verified against every stored row, not fixtures: the accessor read a budget
quantity for **all 674** deterministic rows across both projects with zero
misses, and returned prose for the demo project's 28 nested dual-mode
`injection_resistance` rows. 19 new unit tests, red first (ModuleNotFoundError
before the module existed).*

## Built & verified — the nested judge record (found during Phase C scoping)

- [x] **Degraded detection missed every `dual`-mode security row.** A security
  metric in `dual` mode writes `{"heuristic": {…}, "llm": {"per_span": […]},
  "combine": "min"}` (`security.py:180`), so the judge's `error`/`refusal`
  markers sit one level below where both `is_degraded()` and the SQL jsonpath
  were looking. Measured against the live corpus: the top-level-only path
  matched **300 of `injection_resistance`'s 336 rows** — the missing 36 were
  every real dual-mode row, exempt from degraded detection entirely.
- [x] **One number on screen was actually wrong because of it.** An
  `injection_resistance` row read `0.0 / failed`: the judge returned
  `529 Overloaded` on one span, failed closed to 0.0, and `combine: min` took
  it — while the heuristic leg had scored every span 1.0 with
  `injection_attempted: false`. An API outage was rendering as *"the agent
  gave ground under attack"*, on the real demo project, on the most damaging
  metric there is. *Verified: the row is quoted in full in the DB test;
  post-fix the metric reads `mean 1.000 · 0 of 35 flagged · 1 degraded`.*
- [x] **Both predicates now search `per_span` at any depth** — Python walks
  nested dicts, SQL uses the `$.**` recursive accessor. Still scoped to
  `per_span` rather than matching `error` anywhere, so an unrelated key cannot
  erase a real finding from the mean. *Verified: 5 unit tests (nested dual,
  clean dual, flat regression, precision guard, SQL shape) + 2 DB tests, red
  before the change.*

**Left for the user to decide, not changed here.** `combine: "min"` takes a
failed-closed 0.0 from a broken judge leg even when the heuristic leg scored
1.0. Arguably a degraded LLM leg should fall back to the heuristic rather than
poison the combination. That changes *stored scores*, not display, so it is an
eval-semantics call — logged as gap #6 below.

## Built & verified — application hardening (previous phase)

- [x] **Dual-mode security detection actually runs its judge.** `SecurityEvaluator`
  stored an injected client but never built one, and `runner.py` passes `None`
  outside tests, so `detection_mode: dual` had always been heuristic-only in
  production. *Verified: new tests fail against the un-fixed `__init__`
  (`assert None is <object>`), pass after.*
- [x] **The API key in `.env` reaches the SDK.** Two independent bugs, either of
  which silently scored every judge metric 0.0: pydantic-settings loads `.env`
  into `Settings` but never into `os.environ`, and `.env` was resolved relative
  to the working directory while the eval CLI runs from `server/`. *Verified: key
  masked-checked as visible from both repo root and `server/`, then a live judge
  call returned a real score.*
- [x] **Judge metrics are scoped to the span their rubric describes.** New
  `MetricConfig.span_names`. Previously `applies_to: llm_call` graded the
  planner's search-query list and the fact-checker's verdict line against a
  groundedness rubric, and `aggregation: min` let the worst of those decide.
  *Verified: faithfulness 0.200 → 0.833, relevance 0.267 → 0.900 on the same
  corpus.*
- [x] **The corpus is a recording of a real run, not authored fiction.** 13
  scenarios (was 3), fixtures captured live from claude-haiku-4-5 and replayed
  byte-for-byte. *Verified: live and replay corpora produce identical llm_call
  content; `sample_size` 13 clears `min_sample_size` so Welch's t-test engages.*
- [x] **Fault injection proves the gate fires and fires specifically.** Four
  faults — obeyed injection, PII disclosure, `shell` + `rm -rf`, blown latency —
  each asserting non-zero exit *and* the right metric named, plus a control and a
  specificity assertion. *Verified to discriminate: with `min_mean_drop` and
  `min_effect_size` neutered, all five fault assertions fail and the control
  still passes.*
- [x] **Detector sensitivity measured, both kinds.** Heuristic metric fires at
  4/12 (33%); judge metric at 6/13 (46%). *Verified: sweep tables in
  `docs/detector-sensitivity.md`; the heuristic figure is pinned as an assertion.*
- [x] **Judge fault injection.** Grounded answer 1.00, same answer plus a
  fabricated statistic and an invented ISO standard 0.35 — below the 0.7
  threshold, gap 0.65, enough to trip the real detector. *Verified: 4 tests pass
  against live API calls; skipped without a key.*
- [x] **Instrumentation overhead measured.** enqueue 1.4 µs p50 / 4.8 µs p99;
  full 4-span trace 35.3 µs p50 / 112.3 µs p99. *Verified: `sdk/benchmarks/`,
  10,000 iterations, results committed in `RESULTS.md`.*

## The finding worth leading with

The `partially_covered` scenario asks about retry logic and rate limits, which
the document set does not cover. The agent opened with *"Based on the provided
context, retry logic and rate limiting interact..."* and then produced a
detailed, confidently formatted answer that appears nowhere in the sources — a
fabrication wearing a citation phrase. **Faithfulness 0.20.**

Not an injected fault. The agent did it unprompted and the harness caught it.

By contrast `unanswerable` scored faithfulness 1.00 / relevance 0.40: the agent
correctly refused. The two metrics diverging is evidence they measure different
things.

## Claims status

| Claim | State |
|---|---|
| Dual-layer detector | True — second layer builds and runs |
| Judge produces real scores | True — 0.911 mean, n=13, committed baseline |
| Sub-millisecond exporter | True and measured — 1.4 µs p50 |
| Detector catches regressions | Measured — 4/12 heuristic, 6/13 judge |
| Judge catches fabrication | Measured — 1.00 vs 0.35 |
| Harness catches real failures | Demonstrated — faithfulness 0.20, unprompted |
| **Cohen's kappa** | **Does not exist. Do not claim it.** |
| **"Framework-agnostic"** | **One adapter (LangGraph). Reword, do not build.** |
| "50+ adversarial cases, 5 categories" | Actual: 3 categories, 40 patterns, 28 tests |

## Deferred decisions

`docs/review-later.md` carries what was consciously **not** done in each phase,
and the judgement calls that want a second pair of eyes: metric copy accuracy,
the deferred Overview redesign, the truncated variance axis, the Budgets margin
chart, the uncapped-findings disclosure, and the two security metrics that
record no attempt signal. Read it alongside the gaps list below — gaps are
defects in shipped behaviour, that file is decisions and deferrals.

## Known gaps, stated not fixed

1. **6 of 8 metrics still sit flat at 1.000** on the demo corpus — the
   deterministic and security checks have no scenario that stresses them. Only
   `faithfulness` (σ 0.218) and `relevance` (σ 0.180) have spread.
2. **Judge scores drift between runs.** `partially_covered` scored 0.20 when the
   baseline was pinned and 0.40 on the sensitivity sweep — same trace, same
   fixture, same model. ±0.2 per-trace swing. This is the argument for the
   effect-size guard, and the reason the judge sweep is a script rather than a
   pinned test.
3. **One trace carries no faithfulness signal.** The `error` scenario's retriever
   fails before the writer runs, so there is no writer span and the metric scores
   1.0 for "no applicable spans" — clean and fabricated alike. This part stands:
   "no applicable spans" still scores 1.0, which launders unmeasured into
   passing at the evaluator level.
   **The second instance is now CLOSED (2026-08-09).**
   `test_unfaithful_trace_scores_lower` failed with `assert 1.0 < 0.7` because
   `build_demo_traces()[1]` names its `llm_call` span `synthesis` while
   `agentproof.yaml` scoped faithfulness to `span_names: [writer]`, so the
   fabricated "built by NASA" claim was never judged. Resolved by widening the
   scope to `[writer, synthesis]` — the same role under a different name,
   carrying the same `user_prompt`/`completion` metadata — rather than renaming
   the span, which would have edited a recording. *Verified: the whole of
   `test_eval_pipeline.py` now passes 3/3 in the container, including the
   end-to-end test that was also failing.*
4. **The exporter logs once per dropped trace** under sustained backpressure,
   which is most of the full-buffer path's extra cost. Rate-limit or count-and-
   summarise.
5. **Alembic `versions/` is empty**, so the `ondelete="CASCADE"` declared on
   `eval_results.trace_id` is not in the deployed schema.
6. **CLOSED (2026-08-09): `dual` mode's `combine: "min"`** took a failed-closed
   0.0 from a broken judge leg even when the heuristic leg scored 1.0. `min`
   combines two opinions, not an opinion and a failure. It now falls back to
   the heuristic leg when the LLM leg is degraded, and records
   `combine: "heuristic — llm leg degraded"`. The broken records stay in
   `details` on purpose: the configured mode was `dual` and only half of it
   ran, so the row must still read as degraded rather than let a
   heuristic-only score masquerade as a dual-mode one. **Going forward only** —
   rows already stored keep their 0.0, because rewriting recorded eval results
   would undermine the byte-for-byte recording claim. *Verified: 4 unit tests,
   including one asserting a healthy dual run still takes the worst of the two
   legs, so the fallback cannot become a way to ignore a judge that disagrees.*
7. **CLOSED (2026-08-09): deterministic `details` used different keys per
   project.** See the `eval_engine/details.py` section above. Remaining, minor:
   `tool_allowlist` has object `details` on only 6 of 37 demo rows, so its
   violation list is unavailable for the rest.

## Next up

**Ledger is done and the branch is demo-ready.** The two items that were here
are closed: the theme is implemented across all six routes, and
`DEFAULT_PROJECT` now points at the measured corpus (R16 closed).

1. **Merge `overview-analytics`.** ~20 commits ahead of `main`, all gates
   green. Nothing on the branch is half-finished.

2. **DONE 2026-08-10 — re-ran the demo agent live.** See *The measured
   corpus* above: 45 traces, 520 measurements, 108 genuine judge verdicts,
   zero new auth failures. $0.128 spent.

3. **Decide the demo opening.** The re-run removed the regression, so the
   "CI blocks a merge" frame has no data behind it right now. Either produce
   a genuinely degraded agent version and let the gate catch it, or open on
   the restraint case (`relevance`, p=0.39, d=0.11, declined). Do not re-pin
   a baseline to manufacture a regression.

4. **Re-read *Claims status* end to end** before anything goes on a CV. Every
   quantified claim must be traceable to a real run.

No new backend work. The server is complete and verified. Everything below is
parked deliberately.

### Parked — backend and data

3. **A budgets aggregate for the underlying quantity** (R7, spec §7). The
   Budgets panel states that a compliance rate hides the margin and cannot yet
   show it. Now unblocked: `measured_quantity` in `eval_engine/details.py` reads
   both key spellings. Chart p50/p99 of `latency_ms` and `cost_usd` against
   their limits.

4. **Re-run the demo agent against a working `ANTHROPIC_API_KEY`.** The only
   corpus that may be shown as evidence holds 31 traces, of which 50
   measurements are real judge verdicts and 12 are `AuthenticationError: 401`.
   A clean run deepens it for cents. Key is in `.env`, gitignored — never print
   or commit it.

5. **Scenarios that stress the deterministic and security metrics**, so more
   than two metrics have variance. Five of eight currently never move, which is
   honestly reported but thin.

6. **Cohen's kappa, done properly** — a blind-labelled gold set, judge run
   against it, kappa with a bootstrap CI. A rushed one is worse than none.

7. **Nightly/manual judge workflow** with `ANTHROPIC_API_KEY` as a repo secret,
   so key-gated tests and the sensitivity sweep run somewhere other than a
   laptop.

8. **Instrument a second real project** — the strongest authenticity move, and
   the honest answer to *"has this run against anything but its own demo?"*

### Parked — known gaps with entries in `docs/review-later.md`

R2 (unmeasurable scores 1.0, needs a migration) · R4 (truncated variance axis) ·
R9 (findings capped at 50 without disclosure — latent, neither project exceeds
it) · R10 (only `injection_resistance` records an attempt signal) · R13, R14
(outcome column unsortable, worst-metric ties arbitrary) · R17 (provenance is a
hard-coded set).


## Known issues

1. **Docker image staleness after a dashboard dependency change.**
   `docker-compose.yml` masks `node_modules` with an anonymous volume that
   survives `docker compose up --build`. Run `docker compose rm -sfv dashboard`
   before `up -d`. **Never `docker compose down -v`** — it destroys `pgdata`.
   `rm -sfv` was **not** sufficient during the Ledger work: the container came
   back crash-looping on `Cannot find module '@rollup/rollup-linux-x64-gnu'`
   because the volume was reused anyway.
   `docker compose up -d --force-recreate --renew-anon-volumes dashboard` is
   the one that reliably works.
1a. **Vite serves stale modules to the container after a host-side edit.**
   The single biggest time sink of this phase. The file is correct on disk and
   in `/app`, HMR misses it, and the browser keeps rendering the old build —
   which looks exactly like "my change did nothing", and cost a wrong
   diagnosis before it was recognised. `docker compose restart dashboard`
   after any theme or config edit, *before* concluding anything from a
   screenshot.
2. **Port 5432 is shared** between Docker's Postgres and a native `postgres.exe`,
   so host-side DB tests skip. Run them inside the `server` container with
   `-o asyncio_mode=auto`.
3. **The full server suite cannot run inside the container** — the SDK is not
   installed there.
4. **The span panel is invisible to screen readers' navigation.** MUI's Modal
   sets `aria-hidden="true"` on `#root` while the panel is open.
5. **`sdk/tests` and `demo_agent/tests` cannot be collected in one pytest run** —
   both name their test package `tests`.
6. **PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or Git Bash.
7. **`ruff check` must be run from the repo root** with explicit paths; running it
   from `server/` silently checks nothing and still reports errors.
8. **The server suite must be run from `server/`, not the repo root** — the exact
   opposite of `ruff`. Four tests in `test_regression_cli.py` and
   `test_regression_fixtures.py` load `../fixtures/regression_config.yaml`, a
   CWD-relative path. From the root they fail with `FileNotFoundError`, which
   reads as four real failures that are not there.
9. **`pytest` is not in the server image.** `server/Dockerfile` installs the
   runtime deps only, not `[dev]`, so running DB tests in the container needs
   `docker compose exec server pip install pytest pytest-asyncio` first. That
   install does not survive a rebuild.
10. **Vite serves a stale module after an edit** in the mounted dashboard
    container — the file is correct inside `/app`, HMR does not pick it up, and
    the browser keeps rendering the old string. `docker compose restart
    dashboard` clears it. Cost 20 minutes chasing a fix that was already
    applied.
11. **`baselines/` must be mounted into the server container.** Added to
    `docker-compose.yml` alongside `agentproof.yaml`, for the same reason:
    `settings.baselines_path` resolves against the process CWD (`/app`). Without
    the mount the gate verdict silently reports "no baseline" for every metric
    rather than erroring.
12. **`test_eval_pipeline_end_to_end` fails intermittently — OPEN, backend.**
    Observed 2026-08-10 during the Ledger verification sweep. It POSTs a batch
    of demo traces, gets **200**, then immediately POSTs `/evals/run` for one
    of them and gets **404 "Trace not found"**. Checked in Postgres afterwards:
    no `seed-*` rows exist at all, so the batch reported success without
    persisting.

    Observed 2 failures in 4 runs. Fails more readily as part of the full
    integration suite than alone, which points at ordering or a cold
    connection pool rather than randomness.

    **Not caused by the Ledger work:** `git diff 36b77c2..HEAD` touches zero
    backend files (only `dashboard/`, `docs/`, `scripts/`, `PROGRESS.md`), and
    this branch changed no server code at all.

    Worth fixing before the batch endpoint is trusted anywhere: an endpoint
    that returns 200 without writing is the same class of defect as a metric
    that reports a pass without measuring.

## Shelved

- **Phase 9 — judge provider abstraction.** Design spec and a 9-task plan on the
  local branch `phase-9-judge-provider-abstraction`, unpushed, zero
  implementation code. Its premise was "Anthropic billing is broken, route
  around it"; a working key removed the premise. The design work is what
  surfaced the dual-mode bug, which was worth more than the branch.
