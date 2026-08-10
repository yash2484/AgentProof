# Overview redesign — design brief

The Overview was the last page left on the old design. Evals, Security and
Traces were each rebuilt around a question; the Overview never had one, and it
showed. This brief records the diagnosis, the decisions, and what was
deliberately deleted.

Written 2026-08-10. Companion to
`docs/superpowers/specs/2026-08-09-analytics-depth-design.md` and
`docs/review-later.md` (R3 opened this work).

---

## 1. The complaint

> "I still don't understand how anyone is supposed to read this part and
> understand what to grasp from the representation — it's hard for me as
> someone making the project."

That is the author of the project failing to read their own dashboard. Taken at
face value it is a legibility failure, not a taste disagreement, so the brief
starts from evidence rather than from a mood board.

## 2. Diagnosis, with numbers

Measured against the live corpus, not by eye.

### 2.1 The distribution strip hides exactly what it exists to show

`MetricDistribution` normalised bar height by the **tallest bin**, in a 46px
track. On the pooled 30-day window:

| metric | bin | count | rendered height |
|---|---|---|---|
| `data_exfiltration` | 0.0–0.1 | 1 | **0.45px** of 46px |
| `data_exfiltration` | 0.9–1.0 | 103 | 46px |
| `tool_misuse` | 0.0–0.1 | 1 | **0.45px** of 46px |

The single data-exfiltration breach — the most serious event in the corpus —
rendered as a sub-pixel sliver. Normalising by the tallest bin means **the
rarer an event, the less visible it becomes**, which is backwards for a product
whose entire job is catching rare failures.

### 2.2 Four encodings, one track, no legend

The 46px track carried a histogram, a threshold line, a mean line, and a ±0.2
judge-noise band, all on one 0→1 axis with no key. The noise band was drawn
*behind* full-height bars, so it was occluded precisely where it mattered.

### 2.3 Bar colour encoded the wrong variable

Bars were painted with the **metric's** severity, so `faithfulness`' 38
measurements sitting in the 0.9–1.0 bin were red. A reader cannot tell whether
red means "these measurements are bad" or "this metric is bad".

### 2.4 Four of eight metrics rendered as a solid block

`cost_budget`, `latency_budget`, `tool_allowlist` and `injection_resistance`
have every measurement in one bin. Their "histogram" is a single 100%-height
rectangle spanning 0.9→1.0 — visually a progress bar at 95%, conveying nothing.

### 2.5 The page duplicated a better component one click away

`/evals/:metric` already renders this data properly: separated bars, `minHeight`
so a count of 1 stays visible, colour keyed to **bucket position vs threshold**,
and a sentence saying what the colours mean. The Overview shipped a worse
version of a chart the product already had.

### 2.6 Measurement health was arithmetically wrong

`totals.pending = traces - evaluated` subtracts two differently-scoped counts:
traces are filtered on `start_time`, eval rows on `evaluated_at`. **19 traces
were evaluated inside the window but started before it**, so `evaluated` (90)
exceeded `traces` (84) and the card rendered:

> 75 scored · 15 failed · **-6 pending**

Three defects in one line: a negative count, `degraded` labelled "failed" (the
one thing the card exists to prevent), and `scored` undercounting because the
15 traces holding *both* a good measurement and a broken one were counted
wholly as degraded.

### 2.7 No thesis, and no hierarchy

Five cards of near-identical weight. The largest type on the page belonged to
the least important number. The largest card said "No baseline" — the most
space for the least information.

## 3. The decision: the Overview becomes a triage page

Confirmed with the user, 2026-08-10.

Every other page answers a question. The Overview now answers the one no other
page does:

> **Since last time — did anything get worse, and can I trust today's numbers?**

Per-metric detail is not the Overview's job; it is `/evals`'. So the unreadable
widget is removed by **deletion, not redesign**. `MetricHealthPanel` and
`MetricDistribution` are deleted outright.

One insight from the deleted panel is load-bearing and survives as a headline
statement: *N of 8 metrics never moved — unexercised, not passing*. That is the
distinction the whole product exists to preserve and it must not die with the
component that happened to carry it.

### Bands

1. **Verdict** — one sentence, largest type, on the page background rather than
   in a card. Derived by a pure function so it is testable without rendering.
2. **What changed** — per group, latest run against the previous, with the
   noise floor stated. The old `VariancePanel` was the best component on the
   page; it gets promoted rather than replaced.
3. **What you can trust** — corrected measurement health, the unexercised-metric
   count, and the provenance of the numbers in scope.
4. **Where to look** — findings, each routing to the page that owns it.

## 4. Provenance: "real vs generated" is the wrong axis

The user asked how any project counts as real when the corpus is generated. The
database answers it better than the badge did.

| class | how the number was produced | demo-research-agent | synthetic-showcase |
|---|---|---|---|
| **measured** | computed by code from recorded spans; no model; reproducible | 222 | 900 authored |
| **judged** | a live model call read real output and returned a verdict | 50 | 0 |
| **broken** | judge call errored or refused | 12 | injected at 2% |
| **authored** | drawn from a random distribution by the generator | 0 | 2400 |

`synthetic-showcase` has `raw_judge_output IS NULL` on **every one of its 2400
rows** — no judge was ever called. Scores come from `rng.gauss(...)`, breaches
from `rng.random() < 0.06`.

Two consequences the page must carry:

- A **deterministic metric on the demo project is more trustworthy than a
  judged one**, because arithmetic over recorded spans has no model in the
  loop. A binary GENERATED / REAL badge cannot express that, so the page uses
  the three-word vocabulary above instead.
- `12 of 74` judged measurements on the "real" project failed with
  `AuthenticationError: 401 — invalid x-api-key`. The real corpus is partly a
  record of a broken run, and the page says so rather than averaging it away.

### Scope rules

- **"All projects" excludes generated corpora.** All means all *measured*.
  Pooling 300 fabricated traces with 36 real ones under an unlabelled heading
  was the single worst honesty defect on the page (R5).
- **The landing default is `synthetic-showcase` for now**, at the user's
  request: it is the only corpus dense enough to see the design working.
  This is a development convenience that contradicts R5's spirit, so it is a
  single named constant, documented, and the provenance strip is unmissable
  whenever it is in scope. **Flip it to the measured project before any demo,
  screenshot, or external use.**

## 5. Theme rules

The page ran four colour systems at once: severity chips (amber/red/green),
brand magenta (noise band, sparkline, links), group hues (magenta/violet/cyan),
and status colours on bars. Amber was the loudest colour on the darkest ground
and it marked the *second-least* severe tier, so the page read as alarmed about
everything.

One accent per role, enforced:

| role | colour | where it may appear |
|---|---|---|
| severity | red / amber / green | severity chips and the verdict line — nowhere else |
| group identity | magenta / violet / cyan | the change band only |
| brand | magenta | navigation, links, focus rings |
| provenance | muted + border | the trust band; deliberately quiet, never alarming |

The severity rule is the one that was actually being broken, and deleting the
distribution strip enforces it: severity used to paint **bar fills**, so
`faithfulness`' 38 measurements in the 0.9–1.0 bin were red because the metric
was flagged. Colour now describes a verdict and never a quantity.

One honest caveat rather than a rule the code does not keep: the brand magenta
is *also* the Answer-quality group's hue (`groups.ts`), so on the change band a
series line shares a colour with the page's links. That predates this work,
`/evals` and `/security` were rebuilt around it, and re-hueing a group to
satisfy a table would be churn for its own sake. It is recorded here so the
next reader knows it is a decision and not an oversight.

Hierarchy comes from **structure, not chrome**: Band 1 is not a card, so the
verdict sits on the page ground with nothing competing. Bands 2–3 are cards.
Band 4 is a bare list. Uniform card weight is what flattened the old page.

## 6. What this brief does not settle

Tracked in `docs/review-later.md`. R3 closes with this work. R4 (truncated
variance axis) and R5 (synthetic never as evidence) are touched but not closed —
R5 in particular is now *more* load-bearing, because the landing default points
at the generated corpus.
