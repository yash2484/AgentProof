# AgentProof — Progress

**Current phase:** Overview analytics — server side complete, dashboard next
**Branch:** `overview-analytics`
**Last updated:** 2026-08-08

## Last verified working

Server sweep, 2026-08-08, after the analytics endpoint landed.

| Suite | Result | How verified |
|---|---|---|
| server (host) | 234 passed, 24 skipped | `python -m pytest tests -q` **from `server/`** |
| server DB tests | 17 passed | `docker compose exec server python -m pytest tests/integration/test_evals_analytics_db.py tests/integration/test_evals_summary_db.py -q -o asyncio_mode=auto` |
| lint | All checks passed | `ruff check server/agentproof_server server/tests` from repo root |
| live endpoint | 200, real figures | `GET /api/v1/evals/analytics?project=demo-research-agent&days=0` against the running stack |

The 24 host skips are DB-backed integration tests (port 5432 conflict, see Known
issues) plus key-gated judge tests.

Application-hardening figures, verified 2026-08-08 before that merge, unchanged
since: sdk 43 passed; demo_agent 37 passed, 1 skipped; dashboard 140 passed;
CI 6/6; both regression gates PASS exit 0.

**Repo:** public, `github.com/yash2484/AgentProof`. Tags continuous
`phase-1` … `phase-8`. Remote branches: `main`, `overview-analytics`.

## Built & verified this phase — Overview analytics (server)

Design spec: `docs/superpowers/specs/2026-08-08-overview-analytics-design.md`.
Handover: `docs/handover-overview-analytics.md`.

- [x] **`GET /api/v1/evals/analytics`** — one endpoint, six SQL aggregates
  (`server/agentproof_server/api/analytics.py`). Every figure computed in SQL;
  the design spec's seven endpoints collapse to one. *Verified: 59 unit tests +
  14 DB-backed tests against real Postgres.*
- [x] **The misleading security verdict is gone.** The screen said
  *"injection_resistance regressed — the agent gave ground under attack"* from
  one row with no denominator. The endpoint now returns `1 of 35 flagged, mean
  0.971` with the gate verdict `p=0.1634 >= alpha=0.05, d=0.239 < 0.5`.
  *Verified: live call against the 25-trace demo project.*
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
   **Same root cause, second instance, found 2026-08-08:**
   `tests/integration/test_eval_pipeline.py::test_unfaithful_trace_scores_lower`
   fails reproducibly with `assert 1.0 < 0.7`. `build_demo_traces()[1]` names its
   `llm_call` span `synthesis`, but `agentproof.yaml` scopes faithfulness to
   `span_names: [writer]`, so the fabricated "built by NASA" claim is never
   judged. The test cannot pass with the current config. Fixing it means either
   renaming the demo span or widening `span_names` — an eval-semantics decision,
   deliberately not taken here. Live-data effect: on the demo project 5 metrics
   sit on the ceiling strip and 3 vary (`injection_resistance` now varies because
   of one failing row), not the 6/2 the design spec assumed.
4. **The exporter logs once per dropped trace** under sustained backpressure,
   which is most of the full-buffer path's extra cost. Rate-limit or count-and-
   summarise.
5. **Alembic `versions/` is empty**, so the `ondelete="CASCADE"` declared on
   `eval_results.trace_id` is not in the deployed schema.

## Next up

1. Overview analytics, dashboard side: types + api client + query hooks;
   severity tiers and register assignment as pure functions in `lib/` with
   colocated tests; then Band 1 (gate verdict, volume, measurement health),
   Band 2 (metric health, two registers), Band 3 (variance), Band 5 (findings).
2. Decide the `span_names: [writer]` mismatch above — it is currently a failing
   test and two traces with no faithfulness signal.
3. Cohen's kappa, done properly: a blind-labelled gold set, judge run against it,
   kappa with a bootstrap CI. A rushed one is worse than none.
4. Scenarios that stress the deterministic and security metrics, so more than two
   metrics have variance.
5. Nightly/manual judge workflow (`ANTHROPIC_API_KEY` as a repo secret) so the
   key-gated judge tests and the sensitivity sweep run somewhere other than a
   laptop.
6. Instrument a second real project — the strongest authenticity move, and the
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
8. **The server suite must be run from `server/`, not the repo root** — the exact
   opposite of `ruff`. Four tests in `test_regression_cli.py` and
   `test_regression_fixtures.py` load `../fixtures/regression_config.yaml`, a
   CWD-relative path. From the root they fail with `FileNotFoundError`, which
   reads as four real failures that are not there.
9. **`pytest` is not in the server image.** `server/Dockerfile` installs the
   runtime deps only, not `[dev]`, so running DB tests in the container needs
   `docker compose exec server pip install pytest pytest-asyncio` first. That
   install does not survive a rebuild.
10. **`baselines/` must be mounted into the server container.** Added to
    `docker-compose.yml` alongside `agentproof.yaml`, for the same reason:
    `settings.baselines_path` resolves against the process CWD (`/app`). Without
    the mount the gate verdict silently reports "no baseline" for every metric
    rather than erroring.

## Shelved

- **Phase 9 — judge provider abstraction.** Design spec and a 9-task plan on the
  local branch `phase-9-judge-provider-abstraction`, unpushed, zero
  implementation code. Its premise was "Anthropic billing is broken, route
  around it"; a working key removed the premise. The design work is what
  surfaced the dual-mode bug, which was worth more than the branch.
