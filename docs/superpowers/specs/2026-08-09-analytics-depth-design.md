# Analytics depth — design brief

**Date:** 2026-08-09
**Status:** approved 2026-08-09; execution starts at Phase B
**Scope:** Evals, Security, Traces, plus corrections to Overview
**Register:** product (design serves the task) — dark, Restrained colour, structure borrowed from the supplied references

## 1. Feature summary

The Overview now reads honestly, but it is the only surface that does. Evals is
one chart with eight unrelated series on a shared axis. Security is a wall of
identical PASS cards. Traces is a bare grid that never mentions evaluation at
all. None of the three says what any metric *means*.

This brief covers making all four surfaces legible to an engineer or analyst
tracking their LLM interactions — plain-language lead, statistics immediately
behind it, drill-down on click.

## 2. Primary user action

**Answer "which metric is worth my attention right now, and what exactly went
wrong in the runs behind it" without already knowing what the metric is.**

Everything else is subordinate to that sentence.

## 3. Diagnosis — what is actually wrong, with evidence

### 3.1 Overview: two numbers on one page use different rules

`metric_health` excludes degraded rows from its mean. The run `mean_score`
does not. Measured on the live demo project, runs 1–3 all sit at exactly
**0.750** — each had 3 traces × 8 metrics = 24 eval rows, of which 6 were
degraded judge calls that failed closed to 0.0. 18 ÷ 24 = 0.750.

**That flat line is not a quality signal. It is six broken API calls.**

Worse, even corrected, the run mean pools every metric: `faithfulness` 0.2 and
`latency_budget` 1.0 averaged together. It moves when the *mix* of metrics
changes, not when quality changes. A number that cannot move for a reason the
reader can name does not belong on the page.

### 3.2 Evals: eight series, one axis, no meaning

`ScoreTimeseries` plots every metric as a line on one 0→1 axis. Three
problems compound:

- **Different things share a scale.** `latency_budget` is binary compliance;
  `faithfulness` is a graded judge score with ±0.2 noise. Drawing them as
  peers implies they are comparable. They are not.
- **Six of eight lines are flat at 1.000**, so the chart is mostly a thick
  band at the top with two lines moving underneath it.
- **The x axis is ordinal run index**, deliberately (batch exports collapse
  real timestamps), but that means the chart cannot answer "is this getting
  worse over time" — only "did run 4 differ from run 3".

No metric carries an explanation. A reader who does not already know what
`tool_allowlist` measures learns nothing from the page.

### 3.3 Security: N identical cards, no denominator

`SecurityPage` renders one card per eval row, capped at 200. On the demo data
that is 105 security rows — 34 of them identical `injection_resistance` PASS
cards. There is no aggregation, no prevalence, no time dimension, and the
200-row cap means the page shows a sample while implying the whole history.

It repeats the Overview's original sin one level down: the same verdict stated
many times reads as many findings.

### 3.4 Traces: a grid that never mentions evaluation

`TracesPage` is a `DataGrid` of name / project / status / latency / tokens /
cost. Its columns are the *infrastructure* view. The product is an eval
harness, and the grid cannot answer "which traces failed something". You have
to click into each trace one at a time to find out.

Also: a destructive Delete button sits inline in the grid behind a
`window.confirm`. That is the only destructive action in the app and it is the
least guarded.

## 4. Governing principles

Carried forward from the Overview rework, unchanged:

> Every alarming statement carries a denominator and a time window; every
> LLM-judge number shows its ±0.2 noise; and the screen never launders untested
> or unmeasured into passing.

Two added for this round:

- **A metric explains itself where it is shown.** Not in a docs page, not in a
  tooltip only — the plain-language sentence is the primary label and the
  number is its evidence.
- **Never draw two things on one axis unless they share units and meaning.**
  Grouping is not cosmetic here; it is the correctness fix.

## 5. Information architecture — three metric groups

The eval config already types every metric. That typing becomes the page
structure, because metrics of the same type share units, aggregation and what
"good" means.

| Group | `metric_type` | Metrics today | Units | Reads as |
|---|---|---|---|---|
| **Answer quality** | `llm_judge` | `faithfulness`, `relevance` | graded 0–1, ±0.2 judge noise | distribution + threshold |
| **Adversarial safety** | `security` | `injection_resistance`, `data_exfiltration`, `tool_misuse` | 0/1 per span, `min` to trace | prevalence — how many runs were breached |
| **Budgets & contracts** | `deterministic` | `latency_budget`, `cost_budget`, `tool_allowlist` | binary compliance | compliance rate + the underlying real quantity |

A fourth group (`composite`) is supported by the type system but has no
metrics configured; the layout reserves the slot rather than special-casing
its absence later.

**Why this split is the fix.** Each group gets its own panel with its own
chart form and its own axis, so nothing is drawn as a peer of something it
cannot be compared to:

- Quality → distribution strips over time (the Overview form, repeated per run)
- Safety → a prevalence bar: `1 of 35 runs breached`, never a 0–1 line
- Budgets → compliance % **plus a second chart of the real quantity** (p50/p99
  latency, tokens), because "97% within budget" hides how close to the edge
  the other 3% ran

## 6. Surface designs

### 6.1 Evals — from one chart to grouped panels with drill-down

**Layout.** Scope bar (shared with Overview) → a metric strip → three group
panels stacked → nothing else.

**Metric strip.** Borrowed from the references' KPI row: one compact tile per
metric, grouped and colour-keyed by group, each showing name, current value,
delta vs the previous run, and a severity dot. This is the navigation: click a
tile to open its detail.

**Group panels.** Each renders the group's own chart form (§5) with a heading
that states the group's question in plain language:

- *Answer quality — is the agent's output grounded in what it retrieved?*
- *Adversarial safety — did the agent give ground under attack?*
- *Budgets & contracts — did runs stay inside their limits?*

Note the second heading deliberately reuses the sentence the old Overview got
wrong. As a **question about a group**, with a prevalence bar and a
denominator underneath, it is honest. As an unqualified verdict it was not.

**Metric detail.** Clicking a tile or a series expands an inline panel (not a
modal — modals are the lazy answer and break the back button):

1. **What it measures**, one sentence, plain language.
2. **How it is computed** — judge rubric excerpt, regex family, or threshold
   expression. The actual mechanism, not a paraphrase.
3. **Why it matters** — one sentence on the failure it catches.
4. **Current state** — distribution, threshold, σ, n, `ci_block` status.
5. **History** — that metric alone across runs, with the ±0.2 band when judged.
6. **Worst traces** — the lowest-scoring runs, each linking to the trace with
   the offending span pre-selected.
7. **Judge reasoning** — for judged metrics, the actual `reasoning` string from
   `details.per_span`. Currently stored and never shown anywhere.

Item 7 is the highest-value thing on this page and costs nothing to surface —
it is already in the database.

**Copy source.** Metric explanations live in one typed registry in `lib/`,
keyed by metric name with a graceful fallback by `metric_type`, so a metric
added to `agentproof.yaml` still renders something sensible.

### 6.2 Security — prevalence first, findings second

**Replaces** the card wall entirely.

1. **Posture strip** — one row per security metric: `injection_resistance —
   1 of 35 runs breached`, with the attack-attempted count beside it.
   `details.injection_attempted` is already stored and never displayed; a
   breach rate is meaningless without knowing how many runs were even
   *attacked*. `0 of 0 attempted` and `0 of 34 attempted` are different facts.
2. **Breach timeline** — when breaches happened, by run. Empty is a legitimate
   and good state, drawn as an explicit "no breaches recorded in this window"
   line rather than a blank frame.
3. **Findings list** — only rows that failed, one entry each, with the
   offending span, the matched pattern or the judge's reasoning, and a link
   into the trace. Passing rows are counted, never enumerated.
4. **Coverage note** — which security metrics ran, against how many traces,
   and which never fired because no scenario stressed them. Same honesty rule
   as the Overview's ceiling strip.

### 6.3 Traces — the eval harness's own list

Keep `DataGrid` (it is the right tool and it is already wired to server-side
pagination). Change what it shows:

- **New column: eval outcome.** Per trace: `8/8 passed`, `6/8 · 2 failed`, or
  `not evaluated`. Needs a small server addition (§7).
- **New column: worst metric**, naming the lowest-scoring metric on that trace.
  This is the column that makes the grid scannable.
- **Row expansion** rather than navigate-only: expanding shows that trace's
  eval rows with scores and the judge's one-line explanation, plus the actions.
  Straight from the references' expanding-row pattern.
- **Filter by eval outcome** alongside the existing filters — "show me traces
  that failed something" is the query this page exists to answer.
- **Delete moves out of the row** into the expanded panel, behind a typed
  confirmation rather than `window.confirm`.

### 6.4 Overview — corrections only

No redesign. Three fixes:

1. **Replace the pooled `mean_score` line.** Options considered: drop the
   panel; plot per-group means as separate series; plot only the gate's
   metric. **Decision: per-group means, three series, one panel** — it keeps
   the panel's purpose (run-to-run movement) while never averaging across
   units. Requires the group split to reach the API.
2. **Make degraded handling consistent.** The run mean must exclude degraded
   rows exactly as `metric_health` does. Currently a run of six failed judge
   calls reads as a 0.750 quality score.
3. **Reconcile the trace-count discrepancy.** `metric_health.count` reports 35
   for deterministic metrics on a 25-trace project, because traces evaluated
   twice contribute twice. That is defensible for a distribution but confusing
   next to `totals.traces: 25`. The count needs a label that says what it
   counts — eval rows, not traces.
4. **Fix the overloaded word "runs".** Confirmed against the synthetic corpus:
   the scope bar says `9 runs` while the findings feed says
   `33 of 294 runs flagged` on the same screen. Both are true and they mean
   different things — an *evaluation run* versus an *evaluated trace*. One of
   them has to change, and it is the severity copy: `33 of 294 traces`.
   Invisible at 25 traces and 4 runs; glaring at 300 and 9.

## 7. Server work

Small, additive, no migration.

- **`metric_type` and group into `/evals/analytics`** — `metric_type` is
  already returned; add a `group` field derived from it so the client is not
  re-deriving taxonomy.
- **Per-group run means** in the `eval_runs` rows, replacing the single pooled
  mean.
- **Exclude degraded rows from run means** (one predicate, already written).
- **`GET /api/v1/evals/metric/{name}`** — the drill-down payload: distribution,
  per-run history, worst N traces with span ids, and judge reasoning strings.
  One endpoint, matching the precedent set by `/evals/analytics`.
- **Eval outcome per trace on `/traces`** — `passed/total` and worst metric,
  as a left join. Needed by the grid; must not become an N+1.
- **Security prevalence** — attempted vs breached counts per security metric,
  read from `details.injection_attempted`.

## 8. Synthetic data — `synthetic-showcase`

The demo corpus is a real recording replayed byte-for-byte, and both the
README and PROGRESS make that claim load-bearing. Nothing generated goes near
it.

- **A second project**, `synthetic-showcase`, seeded by a script under
  `server/agentproof_server/scripts_pkg/`.
- **Shape:** ~300 traces across **180 days**, 8–10 gap-separated eval runs,
  a **slow drift** in answer quality rather than a step change — gradual
  degradation is both the more realistic failure and the more interesting one
  to read, since a step is obvious from any single pair of runs while a drift
  is exactly what a regression gate exists to catch. Plus a scattering of
  degraded judge calls and at least one genuine security breach.
- **Determinism:** seeded RNG, so the same corpus regenerates exactly.
- **Labelled everywhere:** a badge in the project switcher, a line in the scope
  bar, and a note in the README. A reader must never mistake it for measured
  data.
- **Never baselined.** No `baselines/*.json` for this project unless generated
  alongside it and labelled the same way.

## 9. Key states

Per surface: default, loading (skeletons, not spinners), error with retry,
empty, and the two that matter most here —

- **Unmeasured** — the metric exists but nothing exercised it. Must never read
  as passing. Already solved on the Overview; the same treatment extends to
  Evals and Security.
- **Degraded** — the measurement broke. Neutral grey, never security language,
  never counted as a failure.

## 10. Testing

- Metric grouping, group means, and the explanation-registry fallback are pure
  functions in `lib/` with colocated tests.
- Every new SQL statement gets a unit test; DB-backed ones run in the container.
- A test asserts no chart mixes metric types on one axis.
- The seeded corpus gets a test that it regenerates identically from its seed.
- Components tested at 375px and 1440px; any new token extends
  `theme/contrast.test.ts`.
- Each surface rendered in a real browser and looked at. Three of the four
  defects fixed in the last round were invisible to a green suite.

## 11. Phasing

Each phase ends green and useful on its own.

| Phase | Contents |
|---|---|
| **A** | Overview corrections (§6.4) + the server work they need. Smallest, fixes a live wrong number. |
| **B** | `synthetic-showcase` generator. Unblocks judging every later design against realistic density. |
| **C** | Evals rebuild: metric strip, three group panels, metric detail with judge reasoning. |
| **D** | Security rebuild: posture strip, breach timeline, findings list, coverage. |
| **E** | Traces: eval outcome columns, row expansion, outcome filter, delete relocation. |

## 12. Decisions taken

Recorded so they are not relitigated.

| Decision | Choice |
|---|---|
| Theme | Dark, existing tokens. References contribute structure only. |
| Audience | Engineer-first. Plain-language lead sentence, statistics immediately beneath, drill-down on click. Not a simplified mode. |
| Grouping key | `metric_type`, already on every row. No new taxonomy. |
| Drill-down surface | Inline expansion, not a modal. |
| Synthetic data | Separate labelled project. The real corpus is untouched. |
| Charts | @mui/x-charts, already a dependency. |
| Run mean | Per-group, degraded excluded. Never pooled across types. |

## 13. Resolved on approval

1. **Metric detail gets its own route**, `/evals/:metric`. Deep-linkable, and
   the Overview's findings feed links straight to it rather than dumping the
   reader on a filtered list. The inline expansion described in §6.1 becomes
   the route's content, so nothing in that section is wasted.
2. **`synthetic-showcase` spans 180 days with a slow drift.**
3. **Execution starts at Phase B**, not A: every later design decision gets
   judged against realistic density instead of 25 traces and 4 runs. The wrong
   0.750 line on the Overview survives one phase longer, which is the accepted
   cost.
