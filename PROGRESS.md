# AgentProof — Progress

**Current phase:** All build work merged. Open question: the block is not reproducible.
**Branch:** `main` at `983fef2` (PRs #12 and #13). Demo PR #14 open, not merged.
**Last updated:** 2026-08-14

> **Read this before drafting anything public.**
>
> The gate was packaged as a composite action and this repo's CI consumes it via
> `uses: ./` (PR #10, `a68c165`). It was tested with a deliberately injected
> regression and **failed to catch it**, because the detector was using
> between-scenario difficulty as its noise model. The comparison is now paired
> scenario-against-scenario with practical-significance floors sized from
> measured judge noise. That fix is real and it is asserted by tests derived
> from the shipped baseline.
>
> **What 2026-08-14 established: the gate resolves this degradation in 5 of 6
> runs, and the miss rate is now measured rather than assumed.** PR #14 is the
> miss — it passed. Five further clean draws through the shipped rule all
> blocked. The effect sits near the deliberate `d_z ≥ 0.5` breadth guard, so it
> gets missed sometimes; that is statistical power, not a defect. Full six-run
> table and the two ruled-out hypotheses under **Gap A** in *Known gaps*.
>
> Also landed 2026-08-14: **Gap B is fixed** (`8140973`, branch
> `fix/judge-unmeasurable`) — an unreachable judge now reports `NO DATA` and
> fails the job on infrastructure grounds instead of scoring 0.0 and reading as a
> catastrophic regression.
>
> <details>
> <summary>Superseded intermediate framing from earlier the same day</summary>
>
> This block first read "pairing was necessary and not sufficient" and presented
> two runs as evidence the verdict was unstable:
>
> | Run | Verdict | Numbers |
> |---|---|---|
> | 2026-08-12, branch cut at `917aa4b` | **FAIL, exit 1** | `drop 0.085, p=0.0043, d_z=0.870` |
> | 2026-08-14, PR #14 on `983fef2` | **PASS, exit 0** | `drop 0.072, p=0.0996, d_z=0.377` |
>
> Two observations across two commits do not support a stability claim. Five more
> draws on the second commit did, in the other direction. Kept as a record of
> reading too much into n=2.
> </details>
>
> Nothing in the comparison changed between those two runs. `baselines/` and
> `fixtures/regression_config*.yaml` are byte-identical across
> `917aa4b..983fef2`; the detector diff is reporting text plus an `unpinned`
> counter. The candidate side is re-judged live on every run, so the judge's
> per-scenario noise moved `d_z` from 0.870 to 0.377 and flipped the verdict.
>
> **The block is real but not reproducible run to run.** Do not state "the gate
> blocks a real regression" as a settled property. It blocked once and passed
> once on identical inputs. This is `R25` (a baseline carries one evaluation
> run's judge noise) and it is now the most important open item in the repo.
>
> **Two older things a next session should not miss.** The demo `walkthrough.md`
> reproduction had been claiming an outcome the tool stopped producing — a
> single prompt-injection breach no longer blocks, and it takes three. That is
> disclosed, not fixed, and it is `R23` in `docs/review-later.md`. And the
> baseline was re-pinned in the keyed format, so any figure quoted from the
> pre-2026-08-12 baseline is superseded.

## Last verified working

Full sweep, 2026-08-12, on `feat/paired-regression`. Every figure below was
produced by running the command in the same session that wrote this table.

| Suite | Result | How verified |
|---|---|---|
| server (host) | **416 passed, 36 skipped** | `python -m pytest tests/ -q` from `server/` |
| sdk | **43 passed** | `python -m pytest tests/ -q` from `sdk/` |
| demo_agent | **38 passed** | `python -m pytest tests/ -q` from `demo_agent/` |
| dashboard | **418 passed, 33 files** | `npm test` from `dashboard/` |
| dashboard types + lint | exit 0, exit 0 | `npx tsc -b`; `npx eslint . --ext ts,tsx` |
| lint (python) | All checks passed | `ruff check sdk/ server/ demo_agent/ scripts/` from the repo root |
| CI, PR #12 | **8/8 green** | `lint`, `test-sdk`, `test-server`, `test-dashboard`, `judge-key`, `fixture-gate`, `agent-gate`, `judge-gate` |
| gate vs degraded agent | **FAIL, exit 1** | paired, `drop 0.085, p=0.0043, d_z=0.870` — **superseded, see below** |
| gate vs clean agent | PASS, exit 0 | paired, `delta -0.008` — no false positive |
| live endpoint | 200, all 8 metrics `method=paired`, `paired_n=13` | `GET /api/v1/evals/analytics?project=demo-research-agent` |

**Re-verified 2026-08-14 on PR #14** (`demo/weaken-writer-guardrail-paired`,
rebased onto `983fef2`), which is the run that supersedes the degraded-agent row
above:

| Check | Result | How verified |
|---|---|---|
| CI + Regression, PR #14 | **8/8 green over a degraded agent** | `gh pr checks 14` — `lint`, `test-sdk`, `test-server`, `test-dashboard`, `judge-key`, `fixture-gate`, `agent-gate`, `judge-gate` |
| `agent-gate` (key-free) | PASS, exit 0 | Correct, not a miss. All six metrics it can run score 1.000 with sd 0.000, so a grounding drop is invisible to them. Reproduced locally. |
| `judge-gate` (judged) | **PASS, exit 0** | `faithfulness baseline=0.908 candidate=0.836 — drop 0.072, p=0.0996 >= alpha=0.05, d_z=0.377 < 0.5` |
| `relevance` on the degraded agent | **scored higher** | `baseline=0.900 candidate=0.954`, paired delta `-0.054`. The rubric has no band for this — `R24`. |

The degradation was not tuned, the baseline was not re-pinned, and the job was
not re-run to look for a different answer. The first verdict is the recorded
one.

`demo_agent` is 38/38 for the first time: the `trigger_evals` timeout stopped
firing when `injection_resistance` moved from `dual` to `heuristic`, which
removed a judge call per `llm_call` span. Measured by putting it back — `dual`
fails at 36.3s, `heuristic` passes in three consecutive runs. **The symptom is
gone, the defect is not:** the 30-second timeout is still fixed against a batch
whose cost depends on the config.

Superseded figures from the previous sweep are kept below for the trail.

<details>
<summary>Previous sweep, 2026-08-10, after Ledger landed</summary>

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

</details>

**Repo:** public, `github.com/yash2484/AgentProof`. Tags continuous
`phase-1` … `phase-8`. Remote branches: `main`, `feat/paired-regression`.
`overview-analytics` and `feat/composite-action` are merged.

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
**Handover:** *(session notes, since removed)* ·
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

## Built & verified — the composite action and paired detection (this phase)

Two pieces of work, 2026-08-11 to 2026-08-12. The second exists because the
first was tested honestly.

**1. The gate became something a stranger can adopt.** PR #10, merged
`a68c165`. `action.yml` at the repo root wraps install → optional capture →
`eval_engine.cli regression`, installing the engine from `GITHUB_ACTION_PATH` so
a consumer gets the engine from the same commit as the `action.yml` they pinned.
`regression.yml` lost its hand-rolled steps and now calls `uses: ./`, so the
thing a stranger adds is the thing this repo runs. A `judge-gate` job runs the
two judged metrics when `ANTHROPIC_API_KEY` is present, resolving the secret in
its own job because `secrets` is unreadable from a job-level `if:` — forks get
no secrets and skip rather than fail.

The action refuses to run a config declaring `llm_judge` metrics without a key.
An unkeyed judge does not raise; it scores every span 0.0, so the report would
read `faithfulness 0.911 -> 0.000` and blame the pull request for a missing
secret.

**2. The gate failed its own test, and was rebuilt.** PR #12. A degradation was
injected (the clause *"Answer using ONLY the provided context."* removed from
the writer prompt, fixtures re-recorded live because replay is blind to prompt
changes). Faithfulness fell 0.109 and **the gate passed it** at `p=0.0939`.

The detector was correct to its specification and the specification was wrong:
thirteen per-scenario scores were being treated as thirteen draws from one
distribution, so the spread called "noise" was really difference in difficulty
between scenarios. 86.6% of that baseline's variance came from one hard
scenario, putting sigma at 0.218 against a per-scenario run-to-run variation of
**0.066** — about **three times** too large, and a minimum detectable regression
well above the drop on the table. No amount of extra corpus fixes that; the
error was in the model, not the sample.

> **Corrected 2026-08-14.** This read "0.034 — about six times too large" until
> the sd was re-measured over five clean draws instead of two. The defect and
> the fix are unchanged; the multiple was overstated by roughly 2x. The README
> carried the same 6x figure and is corrected in the same commit.

What landed:

- **Paired comparison.** Baselines carry `scores_by_key`; a run is compared
  scenario against scenario with a paired t-test and Cohen's *d_z*. Falls back
  to Welch when identity is missing, or when the candidate does not cover every
  pinned scenario — deliberately, since a run that quietly stops comparing the
  hard scenario is exactly the run that looks fine.
- **Scenario identity.** The SDK already supported per-invoke `trace_tags` and
  had no caller; `demo_agent` now stamps the scenario and the CLI reads it back.
  All-or-nothing per corpus and per metric.
- **A practical-significance floor**, necessary on both statistical paths.
  Pairing alone drops the noise floor far enough that almost anything becomes
  significant, and a gate that fires weekly gets switched off.
- **Per-metric floors, measured.** Evaluations of a byte-identical corpus:
  `faithfulness` sd **0.066** over five draws (0.034 over the original two —
  superseded), `relevance` sd 0.144, the six measured metrics 0.000.
  `relevance` sets its own floor at 0.15, above its 0.120 three-sigma.
  `faithfulness` runs on the global 0.05, which the corrected sd puts at about
  2.7 sigma rather than the ~5 sigma the old figure implied.
- **A warning state.** A drop clearing the floor and the effect guard but
  missing significance reports `warn`, not `ok`, in the CLI and on the dashboard
  card. "Could not tell" is not "fine".
- **Calibration tests** pinning the sensitivity itself, read from the shipped
  baseline rather than a copy: **0.116 unpaired, 0.050 paired**. An earlier
  version hardcoded a snapshot, the baseline was re-pinned, and the tests kept
  passing against their own stale copy — the exact drift they exist to prevent.
- **Dashboard/CI alignment.** `_gate_payload` was computing an unpaired verdict
  against a global floor while CI computed a paired one against per-metric
  floors, so the two could disagree about the same commit. Fixed, plus the two
  config drifts that made alignment impossible anyway; `test_config_drift.py`
  now enforces that a metric's definition is global and only the *set* is local.

**Baseline re-pinned** in the keyed format from the first of two clean runs on
unmodified main, by a rule fixed before either run's numbers were seen.
Continuity: faithfulness came out at 0.9077 and 0.9246 against the 2026-08-08
pinned 0.9108, so nothing drifted while the format changed.

**Result on the day, same degradation and same fixtures throughout:** unpaired
`p=0.0939` PASS → paired `drop 0.085, p=0.0043, d_z=0.870` FAIL, clean agent
`delta -0.008` PASS.

**This result did not hold on re-run.** On 2026-08-14 the identical degradation
against the identical baseline returned `drop 0.072, p=0.0996, d_z=0.377` and
PASSED. The unpaired-to-paired improvement above is a genuine property of the
detector and is asserted by `test_regression_calibration.py`; the FAIL verdict
is a single observation, not a stable one. See **Gap A** under *Known gaps*.

**What code review caught in this work**, all five in code written during it:

- **The alignment fix was still misaligned.** The endpoint decided pairing
  eligibility per *metric* from eval rows; the CLI decides it per *trace*,
  corpus-wide. Metrics have different `applies_to` targets, so one untagged
  trace with no tool_use span cost pairing for `faithfulness` and left
  `tool_allowlist` paired — CI unpaired everything, the dashboard did not. Same
  commit, two verdicts, which is the failure the alignment work existed to
  remove. The rule now lives in `eval_engine/pairing.py` and both callers
  import it; there is no second reading of it left to drift.
- **The detector paired on the key intersection.** Drop a scenario from the
  candidate and it kept pairing over whatever remained, as long as the overlap
  cleared `min_sample_size` — reporting a baseline mean computed over the
  survivors. Verified by removing the 0.20 scenario: the old code paired over
  12 and reported `baseline_mean=0.970` against a pinned 0.908. The candidate
  must now cover every pinned scenario or the comparison falls back.
- **The strip and the lede disagreed about the warning state.** `metricSeverity`
  ignored `is_warning`, so a metric whose scores all sat inside their threshold
  was painted clear while the headline called it unresolved.
- **A false sentence in the gate card.** `describeGate` asserted "not
  statistically significant" on every not-flagged verdict, including the
  significant-but-trivial ones (p=0.01 with d=0.30) that land there by design.
- **Two labels that lied quietly.** The no-drop exit inherited `method="welch"`
  for a test that never ran, and the verdict lede took `[0]` from an
  alphabetically-sorted gate and called it the worst metric.

The review also reported the suite at 408 tests against a measured 412 — worth
recording, since taking a reviewer's figures on trust is the same failure as
taking the calibration test's own stale copy on trust.

## Built & verified — Ledger (previous phase)

Spec: `docs/design/2026-08-10-ledger-design-system.md`. Built in the eight
steps of the Ledger frontend handover, one commit each, every one green.

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

Design spec: `docs/specs/2026-08-08-overview-analytics-design.md`.
Handover: *(session notes, since removed)*.

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

Design spec: `docs/specs/2026-08-09-analytics-depth-design.md` §6.4.
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
fabrication wearing a citation phrase. **Faithfulness 0.35**, against a 0.7
threshold.

Not an injected fault. The agent did it unprompted and the harness caught it.

By contrast `unanswerable` scored faithfulness 0.95 / relevance 0.00: the agent
correctly refused. The two metrics diverging is evidence they measure different
things.

**Quote these numbers carefully.** This entry read "Faithfulness 0.20" and
"1.00 / 0.40" until 2026-08-12. The fixtures never changed — they are frozen and
replayed byte-for-byte — but the judge re-scored the same text when the baseline
was re-pinned. `partially_covered` alone has returned 0.20, 0.40 and 0.35 across
three sessions. The finding is real and reproducible; the *exact figure* is not,
and a CV bullet or post that pins one to two decimal places will be wrong within
a month. Say 0.35 against a 0.7 threshold, or say it scores well below threshold
and drifts. `relevance` on `unanswerable` is worse still: 0.00–0.40 across five
runs, because its rubric has no band for a correct refusal (`R24`).

## Claims status

| Claim | State |
|---|---|
| Dual-layer detector | True — second layer builds and runs |
| Judge produces real scores | True — 0.9077 mean, n=13, committed keyed baseline (2026-08-12 re-pin; was 0.911) |
| Sub-millisecond exporter | True and measured — 1.4 µs p50 |
| Detector catches regressions | Measured — smallest resolvable faithfulness drop **0.116 unpaired, 0.050 paired**, asserted in `test_regression_calibration.py` |
| Judge catches fabrication | Measured — 1.00 vs 0.35 |
| Harness catches real failures | Demonstrated — faithfulness **0.35** on an unprompted fabrication, against a 0.7 threshold |
| **Gate blocks a real regression** | **True with a measured miss rate — quote the rate, never the bare claim.** Six homogeneous runs on `983fef2`: **5 blocked, 1 passed** (PR #14). Safe wording: *"it blocks a real injected regression in 5 of 6 runs; the effect sits near the deliberate effect-size floor, so it is missed roughly 1 run in 6, and that rate is measured."* Do not quote a single run's `p` or `d_z` as characteristic — the range is `p` 0.0049–0.0996, `d_z` 0.377–0.849. |
| **Judge noise on faithfulness** | Measured — per-scenario σ median **0.066**, max 0.126 over five clean draws. Supersedes the 0.034 in `regression_config_judged.yaml`, which is corrected in place. Consequence: the global `min_mean_drop: 0.05` sits near **2.7σ**, not the ~5σ the old figure implied. |
| **Unreachable judge is distinguishable from a bad agent** | True as of `8140973` — `NO DATA` verdict, exit 2, message stating it is infrastructure. Before that fix an exhausted credit balance produced a red check identical to a caught regression. |
| **Pairing fixed the noise model** | True and measured — the unpaired detector put sigma at 0.218 against a per-scenario run-to-run **0.066**, so its noise estimate was roughly **3x** too large. The defect and the fix survive 2026-08-14; the *multiple* does not — it read 6x against the old 0.034 sd. Still the claim to lead with, at the corrected magnitude. |
| **Gate is packaged for adoption** | True — composite `action.yml`, consumed by this repo's own CI via `uses: ./` |
| **"It caught a hallucination at 0.20"** | **Superseded. The same frozen fixture now scores 0.35.** Quote 0.35, or quote the range and say it drifts. |
| **"4/12 heuristic, 6/13 judge"** | **Superseded for the judge half** — measured under the unpaired detector and the old baseline. Not re-run under pairing. |
| **A single security breach blocks** | **False.** One prompt-injection breach in 13 passes; three are needed. Disclosed, `R23`. |
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

> **Gap A — the gate misses this degradation in roughly 1 run in 6.**
> Opened 2026-08-14 and **downgraded the same day** after measurement. Expected
> statistical power on a borderline effect, not a defect.
>
> **Superseded framing, kept because the correction is the useful part.** This
> entry twice claimed more than the evidence supported: first "the verdict is not
> reproducible", then "the mean drop is reproducible, the spread is not — the gate
> is effectively coin-flipping", both blamed on `R25` (the baseline pinning one
> run's judge noise). The second version rested on three observations spanning two
> commits, one of which was hand-computed rather than run through the shipped rule.
>
> **What six homogeneous observations on `983fef2` show.** Same degradation, same
> pinned baseline, same frozen fixtures, same config; five local draws through the
> shipped `detect_regression` plus the CI run on PR #14; every draw screened for
> failed judge calls:
>
> | Run | drop | p | `d_z` | Verdict |
> |---|---|---|---|---|
> | CI, PR #14 | 0.072 | 0.0996 | 0.377 | **pass** |
> | local 1 | 0.126 | 0.0094 | 0.752 | REGRESSION |
> | local 2 | 0.117 | 0.0164 | 0.669 | REGRESSION |
> | local 3 | 0.094 | 0.0049 | 0.849 | REGRESSION |
> | local 4 | 0.099 | 0.0350 | 0.552 | REGRESSION |
> | local 5 | 0.087 | 0.0057 | 0.827 | REGRESSION |
>
> **5 of 6 block.** The 2026-08-12 CI run (`d_z 0.870`) agrees but sits on a
> pre-rebase commit, so it is deliberately not pooled into that ratio.
>
> **Two hypotheses ruled out rather than assumed away.**
> - *A corpus difference between CI and local:* no. `demo_agent capture` is
>   deterministic — judge-visible text is byte-identical across captures, 13/13.
> - *PR #14 being anomalous:* no. Its spread of paired deltas (0.191) is 1.45σ
>   above the local mean of 0.147, one-sided p ≈ 0.073. An ordinary draw.
>
> **The actual explanation.** Decomposing the spread: ~0.103 is genuine
> scenario-to-scenario variation in how hard the degradation bites, against ~0.093
> of measurement noise. It hits `blended`, `success` and `overclaim_bait` hard and
> barely touches `injection` or `benchmarks`. The effect therefore sits near
> `min_effect_size_paired = 0.5`, a deliberate *breadth* requirement whose
> docstring rejects `d_z 0.41` on purpose. **An effect this close to the line gets
> missed sometimes; that is the guard working, not failing.**
>
> **Replication was designed, costed and rejected on the numbers.** It would not
> have flipped PR #14 (`d_z` 0.377 → ~0.46, still under 0.5); it buys ~8% spread
> reduction because the spread is mostly real heterogeneity; candidate-only
> averaging is asymmetric and inflates `d_z` while the baseline stays a single
> draw; and it triples judged CI cost permanently ($0.095 → $0.29 per run).
> Averaging the five draws *does* give a stable `drop 0.104, p=0.0080, d_z=0.777`
> — the mechanism works, it is simply not worth its price here.
>
> **Still open, deferred deliberately: *correcting* the baseline** to the mean of
> k clean draws. That improves the accuracy of the reported drop, since a scenario
> whose baseline draw landed high shows an inflated drop, but it cannot improve
> run-to-run stability — frozen noise is a fixed offset, not variance. It
> invalidates every recorded baseline figure, so it needs its own declared change.
> "Re-pinning" and "correcting" are not the same thing: redrawing one run swaps
> one noisy draw for another, averaging k reduces the noise by √k.
>
> **Do not fix this by re-running until it fails.**

> **Gap B — ~~the judged gate cannot tell "the agent got worse" from "the judge
> could not be reached."~~ FIXED 2026-08-14, `8140973`, branch
> `fix/judge-unmeasurable`.**
>
> **The fix.** `EvalScore`/`EvalResult` carry an `unmeasurable` flag (default
> off, so every existing evaluator is untouched); the detector short-circuits to
> a no-verdict result rather than computing a drop; the report renders `NO DATA`
> distinctly from `warn`; and a blocking metric that could not be measured fails
> the job on **exit 2** with a message stating it is infrastructure and not a
> caught regression. Partial failure taints the whole metric on purpose —
> scoring only the spans that answered would quietly change what the number
> covers between runs. 8 new tests, TDD; 421 passed / 39 skipped; verified
> end-to-end against an unreachable judge, which now prints `NO DATA` on both
> judged metrics and `Overall: FAIL (regressed: none)`.
>
> **Still outstanding from this gap:** `action.yml:107` only checks that
> `anthropic-api-key` is **non-empty**, never that it works. A cheap live
> preflight call before scoring would fail fast on a dead key instead of
> discovering it 12 judge calls in. Small, not yet done.
>
> **The defect, for the record.** `llm_judge.py` returned `0.0` for any
> exception and appended "(N judge call(s) failed or were refused → scored
> 0.0)". Nothing removed failed calls from regression scoring.
>
> Consequence, verified by hitting it: with the Anthropic credit balance
> exhausted every judge call 400s, faithfulness scores ≈0.000 against a 0.908
> baseline, and the gate reports a catastrophic uniform regression and **fails
> the build**. An unpaid bill is indistinguishable from a destroyed agent.
>
> This is the same defect class the project exists to remove, one step over:
> the codebase is careful that *unmeasured never renders as passing*, and here
> unmeasured renders as **failing**, which for a gate is just as wrong. A gate
> must be able to say "I could not measure this."
>
> **Do not re-run the judged gate until credit is restored.** It will produce a
> red check that looks like a caught regression and is nothing of the kind. That
> screenshot would be the single most damaging thing this repo could publish.
>
> Fix: mark judge-call failure as *unmeasurable* and have the judged gate exit
> with a distinct "could not measure" status rather than folding it into a
> score. Verify the key with one live call before scoring, and fail the job on
> infrastructure grounds instead of reporting a quality verdict.

0. **A single security breach does not block the build.** One scenario in
   thirteen successfully prompt-injected yields `d_z=0.277`, under the 0.5
   effect-size guard, and passes; three are needed to fire. Verified 2026-08-12,
   identical under both comparisons, so pairing did not cause it — it arrived
   when the corpus grew past `min_sample_size` and the decision moved off the
   absolute-drop floor. The guard suits graded quality metrics and fits security
   badly, and the six measured metrics have run-to-run σ **0.000**, so there is
   no noise for it to see through. `R23` in `docs/review-later.md`.
1. **6 of 8 metrics still sit flat at 1.000** on the demo corpus — the
   deterministic and security checks have no scenario that stresses them. Only
   `faithfulness` (σ 0.173) and `relevance` (σ 0.180) have spread. Both σ figures
   are *between-scenario* spread; the run-to-run noise that actually matters for
   the gate is far smaller — see #2.
2. **Judge scores drift between runs, now measured rather than anecdotal —
   figure revised upward 2026-08-14.** `faithfulness` per-scenario σ is
   **0.066 median, 0.126 max**, measured over **five** clean draws of a
   byte-identical corpus; every draw was screened for failed judge calls. The
   earlier **0.034** came from only two evaluations and is superseded — it is
   corrected in place in `fixtures/regression_config_judged.yaml`. `relevance`
   sits at **0.144** (2 of 13 scenarios, max swing 0.40) and the six measured
   metrics at **0.000**. `partially_covered` alone has returned 0.20, 0.40 and
   0.35 on the same frozen fixture across sessions.

   **Consequence for the floors.** They are sized against this number, so the
   global `min_mean_drop: 0.05` that `faithfulness` runs on sits near **2.7σ**
   of purely spurious mean movement (standard error of a 13-scenario mean is
   σ/√13 = 0.018), not the ~5σ the 0.034 figure implied. The floor was **not**
   raised: doing so cuts sensitivity and moves the calibration figures asserted
   in `test_regression_calibration.py`, which is a decision to take on its own
   evidence rather than as a side effect of correcting a measurement.
   `relevance` keeps its own floor of 0.15.
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

All build work is merged. `main` is `983fef2`; PRs #12 and #13 landed
2026-08-12. Local `main` may be stale — `git checkout main && git pull` first.
Tags stop at `phase-8`, so the composite-action and paired-detection phases are
untagged.

**The demo PR exists and is open: [#14](https://github.com/yash2484/AgentProof/pull/14).**
It did not go the way the previous session's note predicted. It shows 8/8 green
over a genuinely degraded agent, and the reason is **Gap A** above, not a
mistake in the PR. Read that gap before writing a word about the gate.

**Resolved 2026-08-14, no longer blocking:** credit restored (native key, both
pinned judge models verified serving as requested); Gap B fixed (`8140973`); Gap
A measured and downgraded; the local-vs-CI discrepancy ruled out via capture
determinism. Judge spend for the whole investigation: ~$0.67.

0. **Merge `fix/judge-unmeasurable`.** One commit, `8140973`. Suite green, lint
   clean. The only code change from this session and it stands on its own — an
   unreachable judge no longer reads as a destroyed agent.

1. **Decide `R23` — a single security breach does not block.** Likeliest fix is
   routing zero-noise metrics to an absolute-drop rule instead of a statistical
   one. Now the top open design question, Gap A having been downgraded.

2. **Re-read *Claims status* end to end** before anything goes on a CV or into a
   post. Every quantified claim must trace to a real run. Several entries are
   marked superseded; three new rows landed 2026-08-14. Do not quote any figure
   from memory, and quote the gate's **miss rate**, never the bare claim.

3. **Optional, own declared change: correct the baseline** to the mean of k
   clean draws (see Gap A). Improves the accuracy of the reported drop; does
   nothing for stability; invalidates every recorded baseline figure. This is
   also the only legitimate route to a re-run of PR #14 — it genuinely changes
   the instrument, so a fresh CI verdict would be a new measurement rather than
   a retry. Declare it before running it.

4. **The post and the demo script.** The safe arc, all of it verified: a gate
   shipped, was tested against a real injected regression, **failed to catch
   it**, was diagnosed by decomposing the variance (between-scenario difficulty
   was being counted as measurement noise, sigma 0.218 against a true
   run-to-run **0.066** — roughly three times too large), was rebuilt as a
   paired comparison, and the smallest resolvable drop went from 0.116 to 0.050.
   It was then re-tested six times: **it blocks in 5 of 6 runs**, and the run
   that missed is kept open as PR #14 rather than re-rolled.

   Lead with the failure. **Quote the miss rate, never a bare "it blocks".**
   Never quote a single run's `p` or `d_z` as characteristic — the measured
   ranges are `p` 0.0049–0.0996 and `d_z` 0.377–0.849.

   Two figures that are easy to get wrong because they were corrected on
   2026-08-14: judge sd is **0.066**, not 0.034, and the old noise model was
   **~3x** too large, not ~6x. Anything quoting the earlier pair is stale.

**Standing constraints, still in force.** Never re-pin a baseline to manufacture
a regression. Never tune a degradation until the p-value looks good. Never
re-run a gate hoping for a different verdict — the first run is the result.
Never print or commit `ANTHROPIC_API_KEY`.

Everything below is parked deliberately.

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
