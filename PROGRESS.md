# AgentProof — Progress

**Current phase:** Application hardening — complete, awaiting merge
**Branch:** `application-hardening` (PR #9, six CI jobs green)
**Last updated:** 2026-08-08

## Last verified working

Full sweep on the host, 2026-08-08. All green.

| Suite | Result | How verified |
|---|---|---|
| server | 169 passed, 13 skipped | `python -m pytest -q` from `server/` |
| sdk | 43 passed | `python -m pytest -q` from `sdk/` |
| demo_agent | 37 passed, 1 skipped | `python -m pytest -q` from `demo_agent/` |
| dashboard | 140 passed, 22 files | `npx vitest run --reporter=basic` |
| lint | All checks passed | `ruff check server/ sdk/ demo_agent/ scripts/` |
| CI (PR #9) | 6/6 jobs pass | agent-gate, fixture-gate, lint, test-dashboard, test-sdk, test-server |
| regression gate 1 | PASS, exit 0 | fixture corpus vs `demo-research-agent.json` |
| regression gate 2 | PASS, exit 0 | 13-trace replay corpus vs `demo-agent-replay.json` |

Skips are DB-backed integration tests (port 5432 conflict, see Known issues) and
one key-gated demo test.

**Repo:** public, `github.com/yash2484/AgentProof`. Tags now continuous
`phase-1` … `phase-8`. Remote branches: `main`, `application-hardening` only.

## Built & verified this phase

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
   1.0 for "no applicable spans" — clean and fabricated alike.
4. **The exporter logs once per dropped trace** under sustained backpressure,
   which is most of the full-buffer path's extra cost. Rate-limit or count-and-
   summarise.
5. **Alembic `versions/` is empty**, so the `ondelete="CASCADE"` declared on
   `eval_results.trace_id` is not in the deployed schema.

## Next up

1. Merge PR #9 — nothing on `main` reflects any of this yet.
2. Cohen's kappa, done properly: a blind-labelled gold set, judge run against it,
   kappa with a bootstrap CI. A rushed one is worse than none.
3. Scenarios that stress the deterministic and security metrics, so more than two
   metrics have variance.
4. Nightly/manual judge workflow (`ANTHROPIC_API_KEY` as a repo secret) so the
   key-gated judge tests and the sensitivity sweep run somewhere other than a
   laptop.
5. Instrument a second real project — the strongest authenticity move, and the
   honest answer to "has this run against anything but its own demo?"

## Known issues

1. **Docker image staleness after a dashboard dependency change.**
   `docker-compose.yml` masks `node_modules` with an anonymous volume that
   survives `docker compose up --build`. Run `docker compose rm -sfv dashboard`
   before `up -d`. **Never `docker compose down -v`** — it destroys `pgdata`.
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

## Shelved

- **Phase 9 — judge provider abstraction.** Design spec and a 9-task plan on the
  local branch `phase-9-judge-provider-abstraction`, unpushed, zero
  implementation code. Its premise was "Anthropic billing is broken, route
  around it"; a working key removed the premise. The design work is what
  surfaced the dual-mode bug, which was worth more than the branch.
