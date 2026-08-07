# AgentProof — Progress

**Current phase:** Application hardening (Cekura, applying Monday 2026-08-10)
**Branch:** `application-hardening` (off `main` at `488b9bd`)
**Last updated:** 2026-08-07

## What this phase is

An external audit of the application draft found several claims the code does
not support. The goal this weekend is to make the strongest claims **true**,
not to trim them — except where building is the wrong answer (see "Reword, do
not build" below). The application gets rewritten Monday against whatever is
actually real by then.

The audience is a technical founder at an eval/observability company who will
open the repo and read the code before reading anything else.

## Last verified working

Full test sweep run on the host 2026-08-07. All green.

| Suite | Result | How verified |
|---|---|---|
| server | 139 passed, 13 skipped (39.9s) | `python -m pytest -q` from `server/` |
| sdk | 43 passed (1.1s) | `python -m pytest -q` from `sdk/` |
| demo_agent | 37 passed, 1 skipped (13.1s) | `python -m pytest -q` from `demo_agent/` |
| dashboard | 140 passed, 22 files (103.6s) | `npx vitest run --reporter=basic` |
| **Total** | **359 passed, 14 skipped** | |

Skips are DB-backed and key-gated integration tests, not failures. The README
undercounts: it claims 125 server and 41 dashboard tests.

**Repo state:** public at `github.com/yash2484/AgentProof`, 1 star, 0 forks.
Tags stop at `phase-6`; no `phase-7`, `phase-8` or `v1.0.0`. All four packages
are `0.1.0`. Not published to PyPI.

## Ground truth on the audited claims

Verified by reading code on 2026-08-07, not from the README.

| Claim in the draft | Reality |
|---|---|
| "G-Eval LLM-as-judge calibrated to Cohen's kappa > 0.6" | **Does not exist.** Zero occurrences of `kappa`, `calibrat`, `gold set`, `inter-rater` or `human label` in project code. The only "Cohen" is Cohen's *d*, the effect-size guard in the regression detector — a different statistic for a different purpose. No gold set, no labels, no agreement measurement. |
| "Sub-millisecond async trace exporter" | **Assumed, never measured.** No benchmark, no p50/p99, no timing code anywhere. The exporter is architecturally non-blocking (`queue.Queue` enqueue, background daemon thread), so "does not block the agent" is defensible; the number is not. |
| "Dual-layer prompt-injection detector" | **The second layer has never run.** `SecurityEvaluator.__init__` stores an injected client but never constructs one, and `runner.py:89` passes `None` outside tests. `detection_mode: dual` silently falls back to heuristic-only in production. |
| "50+ adversarial cases across 5 attack categories" | **3 categories, 40 patterns.** Categories: `injection_resistance`, `data_exfiltration`, `tool_misuse`. Patterns: 10 injection signatures, 5 compliance indicators, 6 sensitive-data patterns, 12 dangerous tools, 7 dangerous arg patterns — 5 rule *libraries*, which is likely where "5 categories" came from. Plus 28 security unit tests and 1 adversarial demo scenario. |
| "Framework-agnostic" | **One adapter.** `sdk/agentproof/adapters/langgraph.py` is the only one. `autogen` appears solely as an optional-dependency string in `sdk/pyproject.toml` with no module behind it. |
| Claude-as-judge wired | Code path is real and tested, but **no committed artifact in this repo shows a non-zero judge score.** Neither pinned baseline contains `faithfulness` or `relevance`, and both CI gates run `fixtures/regression_config.yaml`, which excludes `llm_judge` metrics by design. The judge has never been baselined and has never gated anything. |

## Weekend priority order

Ranked by application leverage per hour. **P1 and P2 are the two that matter
most if only two get done.**

| # | Task | Effort | Key? | State |
|---|---|---|---|---|
| P1 | Judge live end-to-end: committed baseline with real non-zero scores + nightly CI gate | 2-4h | **Yes** | Not started |
| P2 | Dual-layer fix: `SecurityEvaluator` constructs its own judge client | 1-2h | No (live check rides on P1) | Not started |
| P3 | Exporter latency benchmark, p50/p99, committed script + results | 1-2h | No | Not started |
| P4 | README pass: badges, dashboard GIF, corrected numbers, the nondeterminism paragraph | 1-2h | No | Not started |
| P5 | Regression-catch demo: deliberately degrade the agent, gate goes red, report names metric + p-value + effect size | 2-3h | Only for the judge-driven variant | Not started |
| P6 | Cohen's kappa, done properly: blind-labeled gold set, judge run, kappa + bootstrap CI | 5-8h | Yes | Sunday stretch |
| P7 | Adversarial corpus: 50+ labeled attack cases with expected outcomes | 2-3h | No | Optional |
| P8 | Alembic migration gap | 2-4h | No | Skip this weekend |
| P9 | Tag `phase-7`/`phase-8`, merge branches | 15min | No | End of weekend |

**Rationale for P1 first:** everything else is decoration on a dead core. A
founder opens `llm_judge.py`, sees a competent G-Eval implementation, looks for
evidence it has ever produced a score, and finds none. That is the worst moment
in the current repo.

**Rationale for P2 second:** it is a claim the code actively contradicts, and it
costs ~90 minutes. Fixing a false claim beats adding a true one — the damage
from shipping "dual-layer" and having a founder grep `security.py` is not a
missing feature, it is credibility on every other claim.

### Do NOT spend the weekend on

- **The phase-9 OpenAI/multi-provider abstraction.** Its entire premise was
  "Anthropic billing is broken, route around it". A working key removes the
  premise. What remains is an engineering-standards refactor with zero
  application leverage and no observable behaviour change. Shelved — see below.
- **Alembic (P8).** A real gap, but invisible in a 30-second read and expensive
  to fix properly.

### Reword, do not build

- **"Framework-agnostic"** cannot be made true this weekend; a second adapter is
  a day minimum. Reword to "framework-neutral core with a LangGraph adapter".
  Accurate, still strong, zero hours.
- **"50+ adversarial cases"** — padding a regex list to hit a number is exactly
  what looks bad under inspection. Either state the real shape or build a
  genuine labeled attack corpus (P7). Do not inflate the existing list.

### What the audit missed

- **Nothing in the repo shows the harness ever catching anything.** No failing
  build, no red gate, no report of a caught regression. For a company selling
  "catch agent regressions before production", a documented run where a
  deliberately degraded agent turned the gate red — naming the metric, p-value
  and effect size — is the most persuasive artifact available. That is P5, and
  it may outrank kappa.
- **Instrumentation overhead is a buying objection** for observability tooling.
  P3 answers it directly; frame it that way, not as a vanity number.
- **How you gate on a nondeterministic judge without flake** is already solved
  here (`min_sample_size=9`, effect-size guard, absolute-drop floor) and the
  README never says so. Best-engineered idea in the repo, currently invisible.
  ~20 minutes to write.
- **Judge cost per eval.** `input_tokens`/`output_tokens` are already recorded
  per judge call. Surfacing cost-per-trace-evaluated is nearly free and speaks
  to anyone running evals at scale.

## Where the API key is required

The first spend is one command, inside P1:

```
python -m agentproof_server.eval_engine.cli baseline \
  --traces <corpus> --project demo-research-agent \
  --out ../baselines/... --config ../agentproof.yaml
```

`agentproof.yaml` includes `faithfulness` and `relevance`; everything before
this point uses `fixtures/regression_config.yaml`, which is judge-free by
design. Corpus capture in replay mode, the P2 code and tests, the P3 benchmark
and the P4 README all run key-free.

Cost is small: roughly (judgeable spans x 2 metrics) calls, with `faithfulness`
already tiered to `claude-haiku-4-5`. A ~12-span corpus is ~24 calls. The kappa
gold set is 50-100 calls. Cents, not dollars — but non-zero.

`ANTHROPIC_API_KEY` goes in `.env` at the repo root (gitignored, never
committed). The key serves two consumers: the judge, and the demo agent in
`--mode live`.

## Shelved

- **Phase 9 — judge provider abstraction.** Design spec and a 9-task
  implementation plan are committed on the local branch
  `phase-9-judge-provider-abstraction` (`02f7a14`, `e4685e0`), unpushed, working
  tree clean. **Zero implementation code.** The design work is what surfaced the
  dual-layer bug, which is worth more than the branch. Pick it up after the
  application if the provider abstraction is still wanted.

## Known issues

1. **Docker image staleness after a dashboard dependency change.**
   `docker-compose.yml` masks `node_modules` with an anonymous volume that
   survives `docker compose up --build`. After adding a dashboard dependency run
   `docker compose rm -sfv dashboard` before `up -d`, or Vite fails to resolve
   the import and serves a blank page. **Never use `docker compose down -v`** —
   it destroys the `pgdata` volume.
2. **Port 5432 is shared** between Docker's Postgres and a native
   `postgres.exe`. Host-side `pytest` reaches the wrong database, so DB-backed
   tests skip there. Run them inside the `server` container with
   `-o asyncio_mode=auto` (the container has only `server/pyproject.toml`, not
   the repo-root file that sets `asyncio_mode`).
3. **The full server suite cannot run inside the container** — the SDK is not
   installed there, so `test_trace_pipeline.py` fails to collect. Host for the
   full suite, container for the DB tests.
4. **The span panel is invisible to screen readers' navigation.** MUI's Modal
   sets `aria-hidden="true"` on `#root` while the panel is open, so the nav rail
   is unreachable in the accessibility tree even though it is fully clickable.
   Inherent to `variant="temporary"`.
5. **`sdk/tests` and `demo_agent/tests` cannot be collected in one pytest run** —
   both name their test package `tests`. Run them separately.
6. **Replay-mode screenshots stay weak** because span durations really are
   near-zero. Shooting the demo in `--mode live` needs the API key.
7. **PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or Git Bash.
8. **Alembic `versions/` is empty** and there is no `alembic_version` table, so
   the `ondelete="CASCADE"` declared on `eval_results.trace_id` is not in the
   deployed schema. `delete_trace` removes eval rows explicitly to cover older
   databases, but CI's fresh Postgres builds the constraint *with* cascade, so
   that explicit delete is never actually the thing under test.

## Open decisions

- **P5 vs P6 if Sunday only fits one.** Kappa is the more senior claim and
  speaks to the hard problem in LLM-as-judge. The catch-demo is more persuasive
  in 30 seconds and far more likely to land. Leaning catch-demo.
- **Dead key settings.** `openai_api_key` in `server/config.py` and
  `OPENAI_API_KEY` in `docker-compose.yml` have zero readers. `anthropic_api_key`
  likewise — the SDK reads the environment directly. Wire or delete; leaving
  them implies support that does not exist.

## Next up

1. Count judgeable `llm_call` spans in the replay corpus (key-free) — decides
   whether the P1 baseline is statistically meaningful before any spend.
2. P2 dual-layer fix: code and unit tests, key-free.
3. Stop for the API key, then the single live pass that produces the P1 baseline
   and confirms P2 at the same time.
