# Phase 4 — Regression Detector (Welch's t-test) + CI/CD GitHub Action

**Status:** Approved (2026-06-20)
**Roadmap:** README Phase 4. Builds on the Phase 2 eval engine and the Phase 3
security module, reusing `EvalScore` / `EvalResult` / `BatchEvalReport`,
`EvalRunner`, and the `MetricConfig.regression_alert` / `ci_block` flags.

## 1. Goal

Detect statistically significant **quality regressions** in eval scores between
a pinned, known-good baseline and a new eval run, and gate CI on them via a
self-contained GitHub Action. A regression is a *drop* in a metric's mean
per-trace score that is both statistically significant (Welch's t-test) and
large enough to matter (effect-size guard).

## 2. Scope

### In scope
- A pure statistics core: Welch's t-test + Cohen's d + a regression decision
  rule.
- A **pinned-baseline** model: a fixed, explicitly-recorded score distribution
  that new runs are tested against.
- File-based CLI subcommands (`baseline`, `regression`) that need **no
  database**.
- A committed fixture trace corpus and a committed baseline JSON.
- A separate `regression.yml` GitHub Actions workflow that runs the check and
  fails the build on a regression.
- README roadmap update (Phase 4 → done).

### Out of scope (YAGNI)
- DB-backed baseline CRUD and API endpoints. The scaffolded `Baseline` DB table
  and `eval_results.baseline_id` column stay as-is for a future server /
  dashboard path (Phase 5+).
- Per-metric overrides of regression parameters — a single global
  `RegressionConfig` is used in Phase 4.
- Previous-run and rolling-window baseline models (a pinned baseline only).

## 3. Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| R1 | **Pinned baseline.** New batch is tested against a fixed, explicitly-pinned known-good distribution. | Deterministic and ideal for CI gating; matches the already-scaffolded `Baseline` schema (`scores` / `mean` / `std` / `sample_size` / `pinned`). Avoids the boiling-frog problem of previous-run/rolling baselines. |
| R2 | **Regression = significance AND effect size.** Flag iff the one-sided Welch's t-test reports a mean *drop* with `p < alpha` (default 0.05) **and** Cohen's d ≥ `min_effect_size` (default 0.5). | Significance alone lets large N flag trivially-small drops; the effect-size guard keeps the gate meaningful. |
| R3 | **File-backed, DB-free CI.** The Action evaluates a committed fixture corpus with the current config and compares to a committed baseline JSON. | Self-contained, fast, no Postgres service. The server keeps its DB path independently. |
| R4 | **Welch's t-test via scipy.** `scipy.stats.ttest_ind(equal_var=False, alternative="less")`. | scipy ≥ 1.12 and numpy ≥ 1.26 are already server dependencies — zero new deps, and a battle-tested implementation rather than a hand-rolled t-distribution CDF. |
| R5 | **Same corpus for baseline and candidate.** Baseline and candidate evaluate the identical committed corpus. | A green run has zero score delta; a regression can only appear when the *config or code* lowers scores on that fixed corpus — exactly the signal CI should catch. |
| R6 | **Deterministic CI gate.** The blocking workflow runs deterministic + heuristic-security metrics only (no API key, reproducible). | LLM-judge metrics are nondeterministic; the detector still supports them, but they are excluded from the default blocking gate (opt-in, documented). |
| R7 | **Separate `regression.yml` workflow.** A new workflow file, not a job inside `ci.yml`. | Keeps the regression gate independently visible and runnable. |

## 4. Components

### 4.1 `eval_engine/regression.py` (pure, no I/O)
- `welch_t_test(baseline: Sequence[float], candidate: Sequence[float]) -> tuple[float, float, float]`
  — returns `(t_statistic, df, p_value)` using
  `scipy.stats.ttest_ind(candidate, baseline, equal_var=False, alternative="less")`
  (one-sided: is the candidate mean *less than* the baseline mean?).
- `cohens_d(baseline, candidate) -> float` — pooled-standard-deviation effect
  size; sign convention so a candidate drop yields a positive d.
- `detect_regression(baseline: Baseline, candidate_scores: Sequence[float], cfg: RegressionConfig) -> RegressionResult`
  — the decision rule:
  1. **Short-circuit:** if `candidate_mean >= baseline.mean` → not a regression.
  2. **Sample / variance guard:** if either sample has fewer than
     `cfg.min_sample_size` points, or the t-test returns `nan` (zero variance in
     both samples), fall back to the absolute floor: regression iff
     `baseline.mean - candidate_mean >= cfg.min_mean_drop`.
  3. **Normal case:** regression iff `p < cfg.alpha` **and**
     `cohens_d >= cfg.min_effect_size`.
  Each result carries a human-readable `reason`.

### 4.2 `eval_engine/models.py` (additions)
- `Baseline` — pydantic, JSON-serializable, carrying the DB table's core score
  columns (`project`, `metric_name`, `scores: list[float]`, `mean`, `std`,
  `sample_size`, `created_at`). The DB-only `pinned` / `updated_at` columns are
  not modelled here since Phase 4 is file-based.
- `RegressionConfig` — `alpha=0.05`, `min_effect_size=0.5`,
  `min_mean_drop=0.05`, `min_sample_size=2`.
- `RegressionResult` — `metric_name`, `baseline_mean`, `candidate_mean`,
  `delta`, `t_statistic`, `p_value`, `cohens_d`, `is_regression`, `reason`.
- `RegressionReport` — `results: list[RegressionResult]`,
  `regressed_metrics: list[str]`, `passed: bool`, `timestamp`.

### 4.3 Baseline construction
- `build_baselines_from_report(report: BatchEvalReport, project: str) -> list[Baseline]`
  — groups the per-trace `EvalResult.score` values by `metric_name` and computes
  `mean` / `std` / `sample_size`. Only metrics with `regression_alert=True`
  participate.
- JSON (de)serialization helpers for writing/reading a baseline file
  (`{ "project": ..., "baselines": [Baseline, ...] }`).

### 4.4 CLI (`eval_engine/cli.py`, file-based, DB-free)
Two new subcommands alongside the existing DB-backed `evaluate`:
- `baseline --traces <corpus.json> --config <cfg> --project <name> --out <baseline.json>`
  — evaluate the corpus in-memory via `EvalRunner.evaluate_batch`, build pinned
  baselines, write the JSON.
- `regression --traces <corpus.json> --baseline <baseline.json> --config <cfg>`
  — evaluate the corpus, compare each `regression_alert` metric to its baseline,
  print a per-metric report, and **exit 1** if any metric that is *also*
  `ci_block=True` regressed (else exit 0).
- Both read traces from a JSON file (`[trace_dict, ...]`); no Postgres. The
  existing `evaluate` subcommand is unchanged.

### 4.5 Fixtures
- `fixtures/regression_corpus.json` — a committed corpus (~12–20 traces) built in
  the style of `seed_demo_traces.py` (`build_demo_traces` /
  `build_security_demo_traces`), with stable `trace_id`s and enough per-metric
  variance for a meaningful t-test.
- `baselines/demo-research-agent.json` — the committed pinned baseline generated
  from that corpus with the tracked `agentproof.yaml`.

### 4.6 GitHub Action — `.github/workflows/regression.yml`
- Triggers on `pull_request` and `push` to `main`.
- Installs the server package, runs
  `python -m agentproof_server.eval_engine.cli regression --traces fixtures/regression_corpus.json --baseline baselines/demo-research-agent.json`.
- **No Postgres service.** Non-zero exit fails the check.

## 5. Data flow

```
fixture corpus (JSON) ──EvalRunner.evaluate_batch──▶ BatchEvalReport
        │                                                  │
   `baseline` cmd ──▶ build_baselines_from_report ──▶ baselines/<project>.json (committed)
        │                                                  │
        ▼ (later, in CI)                                   │
   same corpus ──EvalRunner.evaluate_batch──▶ candidate per-metric scores
                                                           │
                          detect_regression(baseline, candidate, cfg)
                                                           │
                                              RegressionReport ──▶ exit 0 / 1
```

## 6. Error handling & edge cases
- **n < `min_sample_size`** or **zero variance in both samples** → t-test `nan`;
  fall back to the `min_mean_drop` absolute floor (§4.1 step 2).
- **Candidate improved** (`candidate_mean >= baseline.mean`) → never a
  regression (short-circuit), even if "significant".
- **Metric present in config but missing from baseline** (e.g. newly added) →
  reported as `is_regression=False` with a `reason` noting no baseline; does not
  fail CI.
- **Empty corpus** → CLI errors out (mirrors `evaluate_batch`'s existing
  `ValueError`).

## 7. Testing (TDD)
- Unit: `welch_t_test` and `cohens_d` against hand-computed / scipy-verified
  values; `detect_regression` across the four cases — no change, significant
  drop, trivial drop blocked by the effect-size guard, and the
  degenerate/zero-variance fallback.
- Unit: `build_baselines_from_report` grouping and stats.
- Unit: CLI `regression` exit codes — `0` on the clean corpus, `1` on a
  seeded-regression corpus or a weakened config.
- All reproducible without network or DB. `ruff` clean across `sdk/` and
  `server/`.

## 8. Conventions
- Implementation plan lives in `.claude/plans/` (gitignored); this design doc is
  the committed artifact (same as Phase 2/3).
- Executed via subagent-driven development: fresh implementer per task, spec +
  quality review after each, broad whole-branch review at the end. Cheap models
  for mechanical tasks (models, fixtures, workflow YAML), standard for the
  detector core and CLI integration.
