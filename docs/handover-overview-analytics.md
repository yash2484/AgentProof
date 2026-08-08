# AgentProof — Handover: Overview analytics rework

**Date:** 2026-08-08
**Prepared:** after the design spec was committed, before any implementation.
**Audience:** the next session picking this up cold.

## 1. Where the project stands

**The application-hardening work is merged.** `main` is at `ab1d8ea` (merge of
PR #9). Tags are continuous `phase-1` … `phase-8`. The only remote branches are
`main` and `overview-analytics`. Working tree clean.

Verified on `main` before the merge: server 169 passed / 13 skipped, sdk 43,
demo_agent 37, dashboard 140, `ruff` clean, six CI jobs green.

Read `PROGRESS.md` first — it carries the verification evidence, the claims that
must not be made, and five known gaps stated rather than fixed.

**Current branch:** `overview-analytics`, one commit `8653b0d` — the design spec
at `docs/superpowers/specs/2026-08-08-overview-analytics-design.md`. **No
implementation code yet.**

## 2. What this next piece is

The Overview page is four flat tiles that answer "is it broken right now?" and
nothing else. It is being rebuilt into an analytics surface.

It is also actively misleading today: the security verdict renders
*"injection_resistance regressed — the agent gave ground under attack"* from one
failing eval row out of 31 traces, with no denominator. That row is not even a
finding — it is a judge call that failed during an export that timed out and
failed closed to 0.0. Fixing that is non-negotiable, not cosmetic.

An external design specialist produced the hierarchy, copy, severity tiers,
chart forms, responsive behaviour and interaction model. All adopted. The spec
in `docs/superpowers/specs/` replaces only its **data layer**, which assumed
capabilities this codebase does not have.

## 3. Decisions locked

Do not relitigate without cause.

| Decision | Choice |
|---|---|
| Runs | Traces and eval runs are **separate** counts. They answer different questions. |
| Aggregates | Computed in **SQL**, not client-side. The eval-results endpoint caps at 200 rows; client aggregation would show a sample while implying full history. |
| Endpoints | **One** — `GET /api/v1/evals/analytics`. The design spec proposed seven. |
| Gate verdict | Computed **on the fly** from `baselines/*.json` + Postgres scores via the existing pure `detect_regression()`. No table, no migration. |
| `degraded` | **Derived** from `details`, not stored. No schema change. |
| "Never varied" marker | n-count chip + muted `no variance observed` label. **No icon** — an icon reads as a warning, and this is an absence of evidence. |
| Severity language | "Regressed" only with a baseline comparison and a p-value behind it. Everything else is "flagged". |

## 4. Load-bearing facts, each verified this session

Verifying these again is cheap; assuming them is not.

**Regression results are never persisted.** `grep RegressionResult` across
`db/models.py` and every API file returns nothing. The ORM `Baseline`
(`db/models.py:146`) has **zero readers anywhere in the application**. The CLI
computes verdicts against JSON files, prints them, and discards them. This is
why the gate verdict card — the largest element on the page — has to compute on
the fly.

**No per-span eval rows exist.** `runner.py:104` states `span_id` is
"intentionally left as the EvalResult default (None)". Per-span scores live only
inside the `details.per_span` JSONB blob. This is what makes span-role ranking
expensive, and it is deferred for that reason.

**`evaluated_at` is stamped once per trace, not per batch.** `runner.py:137`
does `now = datetime.now(UTC)` inside `evaluate_trace`. Grouping eval runs by
timestamp equality yields **13 runs where there were 2**. Use gap-clustering
(rows within ~120s belong to one run).

**`degraded` is already computed.** `llm_judge.py:213`:
`degraded = sum(1 for r in records if r.get("refusal") or r.get("error"))`. The
markers live in `details`. Derive it in the response — a real DB column would
need a migration, and `versions/` is empty with no working migration path.

**`metric_type` already exists** on the eval result row, the DB column and the
dashboard type: `"deterministic" | "llm_judge" | "security" | "composite"`.
Reuse it. `ci_block` does **not** exist on the row — it is on `MetricConfig`
server-side, default `True`, and needs adding to the serialisation.

**Six of eight metrics sit at exactly 1.000 with std 0.000** because no scenario
stresses them. Only `faithfulness` (σ 0.218) and `relevance` (σ 0.180) vary.
The ceiling strip must distinguish this from "healthy" — it is the single most
important honesty requirement on the page.

**Token rules are enforced by a test.** `brand.solid` (#D6409F) and
`status.fail.solid` (#E5484D) clear 3.0 but not 4.5 contrast — fills, bars,
borders and focus rings only; text uses the `.text` variants. Magenta is used
flat, no gradients. `spanTypes` hues sit outside the semantic bands so a span
type can never read as a verdict. `theme/contrast.test.ts` recomputes WCAG for
every token and fails the build.

## 5. What is deferred, and why

- **Span-role ranking** — the JSONB cost above, and the value is currently thin:
  `faithfulness` and `relevance` are scoped to `span_names: [writer]`, so for
  the two metrics that vary there is exactly one role to rank.
- **Money in the cost panel** — replay traces cost ~$0.01, so it renders $0.00
  throughout. Latency and tokens ship.
- **A dense fixture toggle** — not applicable to a dashboard reading a real API.
  Becomes a test instead: server-side aggregation plus components unit-tested
  against a generated thousand-trace dataset.

## 6. Next steps

1. Server: `GET /api/v1/evals/analytics` — SQL aggregates, response model, tests.
2. Server: gate verdict on the fly; expose `ci_block`; derive `degraded`.
3. Dashboard: types, api client, query hooks.
4. Dashboard: severity tiers and register assignment as **pure functions in
   `lib/`** with colocated tests — that is where this repo puts logic, and it
   keeps the components thin.
5. Dashboard: Band 1 (gate verdict, volume, measurement health), Band 2 (metric
   health, two registers), Band 3 (variance), Band 5 (findings feed).
6. Verify — including rendering it in a real browser and looking at it.

## 7. Environment gotchas that cost real time

- **Docker is currently stopped** and Docker Desktop is closed. `docker compose
  up -d` restarts it; `agentproof_pgdata` is intact with 31 traces and their
  eval results. **Never `docker compose down -v`** — it destroys that volume.
- **`ANTHROPIC_API_KEY` is in `.env`** (gitignored, never committed) and works.
  Judge calls cost cents. Never print or commit it.
- **Run `ruff check` from the repo root** with explicit paths. Running it from
  `server/` silently checks nothing *and still reports errors*, which reads as a
  failure that isn't there.
- **Port 5432 is shared** with a native `postgres.exe`, so host-side DB tests
  skip. Run them in the `server` container with `-o asyncio_mode=auto`.
- **The full server suite cannot run in the container** — the SDK is not
  installed there. Host for the full suite, container for DB tests.
- **`sdk/tests` and `demo_agent/tests` cannot be collected in one pytest run** —
  both name their test package `tests`.
- **PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or Git Bash.
- **`run --export` times out at 13 traces.** The eval trigger runs judge calls
  synchronously and exceeds the HTTP timeout; the traces still land and the
  server keeps evaluating. Evaluate in the container instead. The README example
  is stale on this point.

## 8. Process notes worth carrying forward

- **Prove regression tests discriminate.** Reintroduce the gap, watch the test
  fail, restore. This caught a wrong assumption three times on the last plan,
  and on this one it proved the dual-mode fix and the fault-injection suite were
  really testing the detector rather than the mutation.
- **Measure before pinning.** The sensitivity sweep was expected to fire at 3
  broken traces in 12; it fired at 4. The assertion now pins the measured value,
  not the guess.
- **Never put AI attribution in git.** No "Generated with Claude Code" footer,
  no `Co-Authored-By: Claude` trailer, in commits, PR bodies or merge text.
  Going-forward-only; the existing trailered commits are not being rewritten.
- **Verify before deleting.** Before removing the merged branch, every commit
  was confirmed an ancestor of `main`, trees diffed empty, files confirmed
  present, and suites re-run on `main`.
