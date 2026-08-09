# AgentProof — Progress

**Current phase:** Overview analytics — complete, ready for review
**Branch:** `overview-analytics`
**Last updated:** 2026-08-09

## Last verified working

Full sweep, 2026-08-09, after the Phase C Evals rebuild landed.

| Suite | Result | How verified |
|---|---|---|
| server (host) | 289 passed, 36 skipped | `python -m pytest -q` **from `server/`** |
| server DB tests | 26 passed | `docker compose exec -T server python -m pytest tests/integration/test_evals_analytics_db.py -q -o asyncio_mode=auto` |
| dashboard | 275 passed, 30 files | `npx vitest run` |
| lint | All checks passed | `ruff check .` from repo root |
| types + lint (dashboard) | exit 0 | `npx tsc --noEmit` and `npx eslint src --max-warnings 0` |
| live endpoint | 200, per-group means | `GET /api/v1/evals/analytics?project=synthetic-showcase&days=0` |
| page in a browser | renders, 0 console errors | Playwright at 1440px and 390px against the live stack; no horizontal overflow |

The host skips are DB-backed integration tests (port 5432 conflict, see Known
issues) plus key-gated judge tests.

Two container integration tests fail and are **not** from this work:
`test_eval_pipeline.py::test_unfaithful_trace_scores_lower` (known gap #3, the
`span_names: [writer]` mismatch) and `test_eval_pipeline_end_to_end` (404 on a
seeded trace). Both fail identically with `api/analytics.py` reverted to `HEAD`,
checked by swapping the file and re-running. `test_trace_pipeline.py` cannot be
collected in the container at all — it imports the `agentproof` SDK, which the
server image does not install.

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
7. **Deterministic `details` use different keys per project.** The real
   evaluators write `total_cost_usd` and `total_latency_ms`; the synthetic
   generator writes `cost_usd` and `latency_ms`. Anything reading those keys
   must handle both, and the synthetic corpus should mirror the real names —
   otherwise it stops being a valid stand-in, which is its whole purpose. This
   blocks the Budgets margin chart: an aggregate written against one shape
   returns data for one project and silently nothing for the other. Also
   `tool_allowlist` has object `details` on only 6 of 36 demo rows.

## Next up

1. **Phase D — Security rebuild** (spec §6.2): posture strip with
   attempted-vs-breached denominators from `details.injection_attempted`,
   breach timeline, findings list, coverage note.
2. **Phase E — Traces** (spec §6.3).
3. **Then the Overview's visual design and theme**, deferred to last at the
   user's instruction (2026-08-09): they cannot read the metric-health
   distribution bars or tell what to take from them. Treat it as a redesign of
   that panel's form, not a tweak — it packs histogram, threshold, mean marker
   and judge band into one 0–1 track with no legend.
4. **A budgets aggregate for the underlying quantity.** The Budgets panel
   currently states that a compliance rate hides the margin and cannot yet
   show it: `details` carries `latency_ms`, `cost_usd` and `violations` under
   different keys per metric, and nothing aggregates them. Spec §7 lists it.
3. Decide the `span_names: [writer]` mismatch above — it is currently a failing
   test and two traces with no faithfulness signal.
3. Band 4 (latency and tokens as separate mini-charts) and span-role ranking
   are still deferred; see the design spec §7 for why.
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

## Shelved

- **Phase 9 — judge provider abstraction.** Design spec and a 9-task plan on the
  local branch `phase-9-judge-provider-abstraction`, unpushed, zero
  implementation code. Its premise was "Anthropic billing is broken, route
  around it"; a working key removed the premise. The design work is what
  surfaced the dual-mode bug, which was worth more than the branch.
