# Overview analytics — design

**Date:** 2026-08-08
**Status:** approved; implementation plan to follow
**Source:** external design spec ("Reference Build Spec v2"), reconciled against
what the codebase can actually supply.

## 1. Problem

The Overview page is four flat tiles. It answers "is it broken right now?" and
nothing else, while the data behind it — typed span DAGs, per-metric
distributions, judge reasoning, baseline statistics — never reaches the screen.
It reads as a status page rather than the analytics product it is.

It is also **actively misleading**. The security verdict renders

> injection_resistance regressed — the agent gave ground under attack

from a single failing eval row out of 31 traces, with no denominator and no time
context. That row is not even a finding: it is the artifact of a judge call that
failed during an export that timed out, and failed closed to 0.0. The screen
turns one degraded API call into a breach headline.

## 2. Governing principle

Adopted verbatim from the design spec, because it is the right one:

> Every alarming statement carries a denominator and a time window; every
> LLM-judge number shows its ±0.2 noise; and the screen never launders untested
> or unmeasured into passing.

This drives the hierarchy. Where visual tidiness and that principle conflict,
the principle wins.

## 3. What the design contributes, and what this document changes

The external spec supplies the hierarchy, copy, severity tiers, chart forms,
responsive behaviour and interaction model. All adopted. This document replaces
only its **data layer**, which assumed capabilities the codebase does not have.

Four corrections, each verified against the source:

| Spec assumed | Reality | Resolution |
|---|---|---|
| Gate verdict reads p-value / Cohen's d from an endpoint | Regression results are **never persisted**. No `RegressionResult` in `db/models.py`; the ORM `Baseline` (`db/models.py:146`) has zero readers anywhere in the app. The CLI computes verdicts against JSON files and prints them. | Compute on the fly: the endpoint loads `baselines/*.json`, pulls candidate scores from Postgres, and calls the existing pure `detect_regression()`. No table, no migration. |
| A new `degraded: boolean` column | `llm_judge.py:213` already computes `degraded = sum(1 for r in records if r.get("refusal") or r.get("error"))`, and the markers live in `details`. | Derive it in the response. No schema change — which matters, because `versions/` is empty and there is no working migration path. |
| Seven new endpoints | — | One: `GET /api/v1/evals/analytics`. Seven endpoints is seven sets of SQL, response models, tests and hooks for one screen. |
| Eval runs group by `evaluated_at` | `runner.py:137` sets `now` once per **trace**, not per batch. Grouping by equality yields 13 runs where there were 2. | Gap-clustering: rows within a 120s gap belong to one run. |

## 4. Layout

Single scroll, ordered by cost-of-being-wrong. Bands 1, 2, 3 and 5 from the
source spec; band 4 partially deferred (§7).

**Sticky scope bar** — project · time range · "last evaluated" · run count.
Scope is visible before any value it scopes.

**Band 1 — the 60-second read.** Three cards.

- *Gate verdict* (largest). Plain-language headline, then an always-visible
  muted line translating the statistics: `Unlikely to be chance (p=0.033) ·
  large effect (d=0.80)`. Expand reveals t-statistic, degrees of freedom, both
  sample sizes, the raw reason string and the baseline compared against.
  Renders the **restraint case** when the gate deliberately holds back:
  `Not flagged — effect is large (d=0.62) but not statistically significant at
  this sample size (p=0.073)`. A system that explains its silence is more
  trustworthy than one that only speaks when alarmed.
- *Volume and momentum* — trace count, sparkline, small-sample chip.
- *Measurement health* — `29 scored · 1 failed · 0 pending`, neutral grey. Exists
  solely to keep degraded measurements out of the failing count.

**Band 2 — metric health, ranked by uncertainty** (hero, full width). All eight
metrics stay visible in two registers.

- *Register 1 (signal)* — metrics whose scores vary get full rows showing the
  distribution rather than the mean, with a ±0.2 uncertainty band, the threshold
  line, and notable traces plotted as points. A mean of 0.911 must not hide a
  run that scored 0.20.
- *Register 2 (ceiling strip)* — the six metrics at 1.000 with std 0.000:
  compact, every metric named, each expandable to the full treatment. It
  **must distinguish "passed, variance observed" from "never varied — no
  evidence either way"** via an n-count chip plus a muted `no variance observed`
  label. No icon: an icon reads as a warning, and this is an absence of
  evidence, not a fault.

  This is the single most important honesty requirement on the page. Six of our
  eight metrics are pinned at 1.000 because no scenario stresses them — a
  limitation stated in the README. Rendering them as green ticks would launder
  "untested" into "passing", which is the exact failure this product exists to
  catch.

**Band 3 — run-to-run variance.** The form changes with n; the panel never
disappears.

- Fewer than 3 runs: paired slope/dumbbell, run 1 → run 2, with the delta. Two
  points are a line segment, not a trend, and drawing a trend line invites
  extrapolation the data cannot support.
- 3 or more runs: promote to a trend line.
- ±0.2 run-to-run variance is a first-class stat at any n, labelled
  **variance**, never **trend**. Same trace, same frozen fixture, same model,
  0.20 on one run and 0.40 on the next — this is why the gate needs an
  effect-size guard.
- The slot is reserved with a placeholder so nothing shifts when run 3 lands.

**Band 4 — cost of failure.** Latency and tokens as separate mini-charts, never
dual-axis. Money deferred (§7).

**Band 5 — findings feed.** Severity is earned (§5), the fraction is always
stated, and the drill-down lands on the offending span.

Deliberately absent: the p99 hero tile, any pie chart, any dual axis, gradients,
and the word "regressed" anywhere it is not backed by a baseline comparison.

## 5. Severity tiers

- **Degraded** (neutral grey, never alarming) — the measurement failed: the
  judge errored, refused or timed out. Copy: `N measurements failed — not a
  finding.` Never borrows security language.
- **Clear** (green) — zero affected runs.
- **Watch** (amber) — at least one affected run below the serious bar. Copy
  states the fraction (`1 of 31 runs flagged`), never a bare adjective.
- **Serious** (red) — any of: (a) rate ≥ 10% **and** affected ≥ 2 on a
  `ci_block` metric; (b) rate = 100% at any n; (c) the regression gate actually
  fired, so a p-value and effect size exist.
- **Small-sample rule** — below n=10, cap at Watch unless rate is 100%. Widen
  the uncertainty; do not escalate.

**Word discipline.** "Regressed" is a claim about change over time and is
permitted only with a baseline comparison behind it. Everything else is
"flagged".

## 6. API

One endpoint. Every figure computed in SQL, matching the existing
`/evals/summary` precedent and its reasoning that client-side aggregation over a
200-row cap "would show a sample while implying full history".

```
GET /api/v1/evals/analytics?project=<str|null>&days=<int, default 30>
```

```jsonc
{
  "project": "demo-research-agent",
  "generated_at": "...",
  "totals": { "traces": 31, "eval_runs": 2, "scored": 29,
              "degraded": 1, "tokens": 9478, "cost_usd": 0.31 },
  "trace_volume":  [{ "day": "2026-08-08", "total": 13, "ok": 12, "error": 1 }],
  "eval_runs":     [{ "run_at": "...", "trace_count": 13, "mean_score": 0.94,
                      "degraded": 1 }],
  "metric_health": [{ "metric_name": "faithfulness", "metric_type": "llm_judge",
                      "ci_block": true, "mean_score": 0.911, "std": 0.218,
                      "pass_rate": 0.85, "threshold": 0.7, "count": 13,
                      "failed": 2, "degraded": 0, "has_variance": true }],
  "score_buckets": [{ "metric_name": "faithfulness", "bucket": 0.2, "count": 1 }],
  "outcome_split": { "passed": 232, "failed": 16, "degraded": 1 },
  "status_split":  { "ok": 30, "error": 1 },
  "gate": [{ "metric_name": "faithfulness", "is_regression": false,
             "comparable": true, "baseline_mean": 0.911, "candidate_mean": 0.89,
             "p_value": 0.073, "cohens_d": 0.62, "t_statistic": -1.52,
             "baseline_n": 13, "candidate_n": 13,
             "reason": "p=0.0734 >= alpha=0.05, d=0.619 >= 0.5" }]
}
```

`ci_block` is added to the eval-result serialisation and to `/evals/metrics`; it
exists on `MetricConfig` server-side (default `True`) and is a small, safe
addition. `degraded` is derived from `details`, not stored.

`has_variance` is what drives register 1 versus register 2 — it is `std > 0`,
computed in SQL, and it is the flag that keeps "never varied" out of the
"healthy" bucket.

## 7. Deferred, with reasons

- **Span-role ranking.** `runner.py:104` leaves `span_id` as `None` on every
  result by design, so per-span scores exist only inside `details.per_span`.
  Ranking needs `jsonb_array_elements` with per-metric-type handling, since
  security and judge metrics shape `per_span` differently and deterministic
  metrics have none. Roughly 3–4 hours. The value is also currently thin:
  `faithfulness` and `relevance` are scoped to `span_names: [writer]`, so for
  the two metrics that vary there is exactly one role to rank. Worth building
  once metrics span more roles.
- **Money in the cost panel.** Replay traces cost ~$0.01, so the chart renders
  $0.00 throughout. Latency and tokens ship; money waits for live-mode data.
- **A dense fixture toggle.** Not applicable — the dashboard reads the real API.
  The concern it addressed becomes a test instead: the endpoint aggregates
  server-side so the client never receives unbounded rows, and components are
  unit-tested against a generated thousand-trace dataset.

## 8. Testing

- Every new SQL statement gets a unit test, and the DB-backed ones run against
  real Postgres in the container.
- Gate-on-the-fly gets a test proving it returns the restraint case (effect size
  cleared, significance not) as well as the firing case.
- Degraded derivation is tested against a `details` blob carrying `error` and
  one carrying `refusal`.
- Eval-run gap-clustering is tested with timestamps that would collapse to 13
  runs under naive equality grouping.
- The severity tiers get a table-driven test per tier, including the
  small-sample cap and the 100%-at-any-n rule.
- Register assignment is tested: a metric with `std = 0` must never render as
  "healthy".
- Any new token extends `theme/contrast.test.ts`, which recomputes WCAG ratios
  and fails the build on regression.
- Components are tested at 375px and 1440px.

## 9. Verification gates

Nothing is done until: server suite green on the host, DB-backed tests green in
the container, dashboard suite green, `ruff` and `tsc` and `eslint` clean, the
contrast test green, and the page rendered in a browser against the live stack
and looked at — a blank frame is a failure to launch, not a passing build.
