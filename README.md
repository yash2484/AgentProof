# AgentProof

[![CI](https://github.com/yash2484/AgentProof/actions/workflows/ci.yml/badge.svg)](https://github.com/yash2484/AgentProof/actions/workflows/ci.yml)
[![Regression](https://github.com/yash2484/AgentProof/actions/workflows/regression.yml/badge.svg)](https://github.com/yash2484/AgentProof/actions/workflows/regression.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

**A CI regression gate for teams shipping an agent as a product.**

A fixed eval set runs against a pinned baseline and returns a verdict per run
carrying a p-value and an effect size.

Other tools report that a number moved. This one reports whether it moved
further than the **measured** noise — and refuses to answer when the sample
cannot support an answer.

![The AgentProof overview, rendered from the measured demo corpus](docs/images/overview.png)

That screenshot is a real render of the corpus in this repository, produced by
`scripts/ui_audit.py`. Nothing in it is mocked up. Read the four tiles across
the middle: *78 of 85 traces measured*, *7 never evaluated — not passing,
unmeasured*, *5 of 8 metrics never moved — unexercised, not proven*. Those
sentences are the product.

## What it refuses to say

The most useful thing this gate does is decline.

```
relevance  baseline=0.900 candidate=0.877 -- Paired mean drop 0.023 < practical
floor 0.15 over 13 scenarios — below the level worth acting on, regardless of
significance.
```

That is a real line from this repository's CI. Relevance fell by 0.023 between
the pinned baseline and the run. The movement is real, and the gate declines
anyway, because 0.023 sits inside this metric's *measured* noise: across two
evaluations of a byte-identical corpus, relevance moves with a per-scenario
standard deviation of 0.144. It does not round the drop away, and it does not
promote it to a finding.

The floor it is compared against was measured, not chosen. That distinction is
the product.

A tool that only ever reports movement will report noise, and a team that gets
paged for noise turns the gate off within a month.

## It caught a real hallucination

The demo agent was asked about retry logic and rate limits, which its document
set does not cover. It answered:

> *"Based on the provided context, retry logic and rate limiting interact with
> coordination patterns in the following ways..."*

and then produced a detailed, confidently formatted answer that appears nowhere
in the retrieved sources. A fabrication wearing a citation phrase.

**Faithfulness: 0.35**, against a 0.7 threshold. No fault was injected — the
agent did that on its own, and the harness caught it.

That number used to read 0.20 in this file. The fixture never changed; it is
frozen and replayed byte-for-byte. The judge re-scored the same text 0.35 when
the baseline was re-pinned on 2026-08-12. Nothing regressed and nothing was
fixed — a judge is a measuring instrument with its own error bar, and that is
the entire reason this gate compares distributions against a pinned baseline
instead of comparing one number to another.

On a question with genuinely no answer in the corpus, the same agent scored
faithfulness **0.95** and relevance **0.00**: it correctly refused, so nothing
was fabricated, but nothing was answered either. Two metrics measuring different
things and diverging when they should.

Relevance on that scenario is the least trustworthy number on this page, and it
is worth saying so where it is quoted. Across five evaluations of the identical
fixture it returned 0.00, 0.10, 0.10, 0.40 and 0.40. The rubric has a band for
"directly answers" and a band for "off-topic or empty", and none for "correctly
declined because the corpus cannot answer" — so the judge picks a different band
each run. See [docs/limitations.md](docs/limitations.md).

## Evidence, not adjectives

Every number below is produced by committed code you can re-run.

### The gate has been proven to fire — and its miss rate is measured

Four realistic faults are injected into a pinned corpus, each asserting the gate
exits non-zero **and names the metric that should have caught it** — plus a
control run that must stay green, and a specificity assertion so an unrelated
metric is not dragged down.

```
[ok        ] latency_budget       baseline=0.833 candidate=0.833 -- No drop
[ok        ] injection_resistance baseline=0.917 candidate=0.917 -- No drop
[REGRESSION] data_exfiltration    baseline=0.917 candidate=0.250 -- p=0.0002 < alpha=0.05, d=1.757 >= 0.5
[ok        ] tool_misuse          baseline=0.917 candidate=0.917 -- No drop
Overall: FAIL (regressed: ['data_exfiltration'])
```

The fault tests were themselves verified to discriminate: with the detector's
thresholds neutered, every fault assertion fails and the control still passes.

```bash
cd server && python -m pytest tests/unit/test_fault_injection.py
```

These are deterministic faults, and the gate catches them every time. A judged
quality regression is a different question, because the judge is a noisy
instrument: on the injected grounding regression the gate blocks in **5 of 6
measured runs**. Both numbers are stated below rather than only the flattering
one.

### How small a regression it catches

Every gate has a minimum detectable effect whether or not anyone measures it.
This one's is measured, asserted in
[`test_regression_calibration.py`](server/tests/unit/test_regression_calibration.py),
and derived from the shipped baseline rather than a copy of it — so re-pinning
is allowed to move it and is required to say so in a diff.

| comparison | smallest faithfulness drop it resolves |
|---|---|
| unpaired, two-sample | 0.116 |
| **paired, scenario against itself** | **0.050** |

Both are found by bisection against `baselines/demo-agent-replay.json`. The
paired floor is the practical-significance floor itself: once between-scenario
difficulty is removed, what remains is small enough that the question stops
being "can we detect this" and becomes "do we care".

**One caveat worth stating rather than burying.** That baseline pins one judge
draw per scenario, so each pinned score carries a single run's noise. These two
floors are therefore point estimates against a noisy reference, not exact
quantities. Correcting the baseline to a mean of k draws would tighten them by
roughly ten percent; it is deliberately deferred, because it invalidates every
figure derived from the current baseline and is worth doing once, alongside the
next change that touches the decision rule.

It stays quiet below those numbers on purpose. A gate that cries wolf gets
switched off.

```bash
cd server && python -m pytest tests/unit/test_regression_calibration.py
```

The gap between those two rows is not academic. It is the difference between
passing and failing a real degradation — see below.

Note on [docs/detector-sensitivity.md](docs/detector-sensitivity.md): its
heuristic sweep still stands, and `fixture-gate` still exercises that unpaired
path in CI. Its **judge** sweep, and its conclusion that the judge gate is
deafer on purpose-of-metric grounds, predate pairing and are partly explained by
the noise-model defect described in the next section. Treat that half as
superseded until it is re-run.

### Instrumentation overhead

| operation | p50 | p99 |
|---|---:|---:|
| `enqueue` (normal) | 1.4 µs | 4.8 µs |
| `enqueue` (buffer full, drops oldest) | 4.8 µs | 12.2 µs |
| span open + close | 6.9 µs | 23.5 µs |
| full 4-span trace, built and enqueued | 35.3 µs | 112.3 µs |

A fully instrumented agent run costs **0.035 ms at p50** against LLM calls that
take hundreds of milliseconds. Network export is excluded by design: it runs on a
background daemon thread and never blocks the caller.

```bash
python sdk/benchmarks/bench_instrumentation.py
```

### The judge discriminates

| | faithfulness |
|---|---|
| grounded answer | 1.00 |
| same answer + a fabricated statistic and an invented ISO standard | **0.35** |

Below the 0.7 threshold, a gap of 0.65, and enough to trip the real regression
detector end to end.

## How it gates a nondeterministic judge without flaking

This is the part most eval tooling gets wrong, so it is worth stating plainly.

Judge scores drift. Evaluating a byte-identical corpus repeatedly, with the same
frozen fixtures and the same model, moves them:

| metric | per-scenario sd | largest single swing | draws |
|---|---:|---:|---:|
| `faithfulness` | **0.066** (max 0.126) | 0.27 | 5 |
| `relevance` | 0.144 | 0.40 | 2 |
| the six measured metrics | 0.000 | 0.00 | 2 |

The `faithfulness` figure was **0.034 until 2026-08-14**, when five clean draws
replaced the original two and roughly doubled it. Two evaluations are enough to
notice drift and not enough to size it; the correction is recorded because the
floors below are set against this number.

A gate that compared means would fire on that. Five rules keep it honest, and
the first one matters most:

1. **Compare each scenario against itself.** A baseline stores a score *per
   scenario*, so a run is compared scenario by scenario rather than as two
   unordered bags of numbers. Without this, the spread being called "noise" is
   really the difference in difficulty between scenarios, and the gate goes
   deaf. That is not hypothetical here — see the next section.
2. **A practical-significance floor.** Significance answers "is this real", never
   "does this matter". Below the floor the gate declines regardless of how
   certain the statistics are.
3. **Per-metric floors, measured rather than chosen.** One number cannot serve a
   metric with an sd of 0.066 and one with 0.144. `relevance` sets its own at
   0.15, above the 0.120 that three sigma of its own noise reaches. The global
   0.05 floor that `faithfulness` runs on sits at about 2.7 sigma of spurious
   movement in the mean, not the ~5 sigma implied before the sd was corrected —
   a thinner margin than previously documented, and deliberately left in place
   rather than raised, since raising it cuts sensitivity.
4. **A one-sided t-test at alpha=0.05 plus an effect-size guard** — Cohen's *d*
   unpaired, *d_z* paired. Both must agree. The effect-size guard is what stops
   one collapsing scenario from convicting the whole suite.
5. **An absolute-drop floor below `min_sample_size` (9)** — under nine samples per
   group the t-test is underpowered, so a blunt rule decides instead of a
   confident-looking wrong one.

When a drop clears the floor and the effect-size guard but misses significance,
the gate reports **`warn`**, not `ok`. This is the 2026-08-11 verdict described
in the next section, re-run against the detector as it stands today:

```
[warn      ] faithfulness  baseline=0.911 candidate=0.802 -- p=0.1071 >= alpha=0.05,
             d=0.501 >= 0.5. Material but not significant — underpowered at a
             sample of n=13. Not blocking, and not clean either.
```

"We looked and it is fine" and "we looked and could not tell" are different
answers, and a gate that renders them identically is hiding the only line in the
report worth a second look.

Deterministic and heuristic metrics gate **every pull request**, free and
key-free. Judge metrics are run against a key on demand, because they cost money
and cannot be made deterministic.

## The gate failed its own test, and that is why it works now

On 2026-08-11 a degradation was deliberately introduced to find out whether the
gate could see it: the clause *"Answer using ONLY the provided context."* was
removed from the writer's system prompt, and the replay fixtures were re-recorded
live against the weakened prompt. Faithfulness fell by 0.109 across thirteen
scenarios.

The gate passed it.

```
[ok] faithfulness  baseline=0.911 candidate=0.802 -- p=0.0939 >= alpha=0.05, d=0.532 >= 0.5
Overall: PASS
```

The detector was behaving exactly as specified. The specification was wrong.

It was treating thirteen per-scenario scores as thirteen draws from one
distribution, so the spread it called "noise" was really the difference in
difficulty between scenarios. **86.6% of that baseline's variance came from a
single hard scenario.** Its sigma was 0.218, against a per-scenario run-to-run
variation of 0.066 measured directly — a noise estimate roughly **three times**
too large, which put the smallest resolvable regression well above the drop on
the table. The eleven-point drop was never catchable. No amount of extra corpus
would have fixed it, because the error was in the model, not the sample.

> This paragraph read "roughly six times too large" until 2026-08-14. That
> multiple was computed against the old sd of 0.034; measuring five draws instead
> of two put the sd at 0.066 and halved it. The defect and the fix are unchanged
> — the magnitude was overstated, and correcting it is cheaper than defending it.

The fix was to compare each scenario against itself. Same degradation, same
fixtures, only the comparison changed:

| run | comparison | verdict |
|---|---|---|
| degraded agent | unpaired | PASS — `p=0.0939`, missed |
| degraded agent | **paired** | **FAIL** in 5 of 6 runs — see below |
| clean agent | paired | PASS — `delta -0.008`, no false positive |

**The paired row is a rate, not a single result, and that matters.** Six
measured runs of the same degradation against the same pinned baseline: five
block, one passes. `d_z` ranges 0.377–0.849 and `p` ranges 0.0049–0.0996. The
effect sits near the `d_z >= 0.5` effect-size guard, so it is missed roughly one
run in six.

That is the guard working rather than failing — it exists to require *breadth*,
and this degradation genuinely hits some scenarios far harder than others. The
run that missed is kept open and annotated as
[PR #14](https://github.com/yash2484/AgentProof/pull/14) rather than re-run
until it went red. A gate's miss rate is a property worth measuring and
publishing; quoting a single blocking run as though it were deterministic is the
kind of claim this project exists to avoid making.

Pairing alone would have traded a deaf gate for a hair-trigger one: it drops the
noise floor far enough that almost any movement becomes significant, and a gate
that fires every week gets switched off. The practical-significance floor and
the per-metric floors above are what hold that back, and both were set from
measurements rather than taste.

The sensitivity is now asserted by tests derived from the shipped baseline, so
this class of blindness fails CI instead of shipping quietly.

## What you are looking at

Three of the four routes. Each states the limits of its own figures rather than
leaving them to be inferred.

### Evals — a flat metric is not a passing metric

![The evals page, grouped by metric type](docs/images/evals.png)

Metrics are grouped by what they measure, never pooled, because a judge score
graded 0–1 and a binary budget check do not share a unit. Pooling them was
measured on this corpus: a −0.15 drift in the judged metrics rendered as a flat
line, diluted by six metrics pinned at 1.000.

The panel says outright: *"Injection resistance, Tool misuse have never varied —
no scenario in this window stressed them. That is an unexercised control, not a
passing one."*

### Security — counts, not rates, and the denominator with them

![The security page, showing attack surface coverage](docs/images/security.png)

**15 of 78 traces attacked (19.2%). 63 were never probed.** A breach count means
little without knowing how much of the surface was tested, so the coverage sits
beside the count. Failures are enumerated; passing rows are counted and never
listed, because a wall of green invites the reading that everything was checked.

> Corrected 2026-08-17. This read `5 of 38 (13.2%), 33 never probed` — a figure
> from an older corpus that survived the screenshot above being re-rendered, so
> the sentence and the image directly beneath it disagreed. The numbers here are
> the ones in the screenshot, and the ones
> `GET /api/v1/security/analytics?project=demo-research-agent` returns.

## The corpus, stated plainly

The dashboard lands on `demo-research-agent`, a real LangGraph agent, and every
figure above comes from it. `scripts/demo_check.py` fails the build if the app
ever lands anywhere else.

| | |
|---|---:|
| traces | 85 |
| evaluation runs | 15 |
| measurements | 840 |
| computed from recorded spans by code | 629 |
| returned by a live judge call | 192 |
| judge calls that errored or refused | 19 |
| total cost of the live runs | **$0.255** across 75,900 tokens |

The 19 broken judge calls are **kept and shown as broken**. Eighteen are
`faithfulness` and `relevance`; the nineteenth is `injection_resistance`, whose
`dual` mode runs a judge alongside the regex library and had that leg fail. They
are excluded from every figure rather than counted as failures, and the
dashboard reports them as their own quantity. A harness that quietly folded them
into a pass rate would be committing the error it exists to catch. An earlier
version of this table attributed twelve of them to `401`s against a dead key;
the stored explanations no longer carry the status code, so that breakdown is
not repeated here rather than restated on memory.

Two caveats a reader should have before trusting any chart here:

- **The runs are not all the same size.** Four of the fifteen evaluated a single
  adversarial trace; the rest range from three to fifteen. The variance panel
  prints the per-run trace counts and states that those points are not
  like-for-like, rather than drawing them as a trend.
- **85 traces is small.** It is enough to prove the harness works end to end. It
  is not enough to characterise an agent, and nothing here claims otherwise.

## Quick start

```bash
cp .env.example .env   # works as-is; add ANTHROPIC_API_KEY for judge metrics and live mode
docker compose up -d   # Postgres + API + dashboard
# Server:    http://localhost:8000  (GET /health -> {"status": "ok"})
# Dashboard: http://localhost:5173
python scripts/seed_dashboard.py     # load demo traces + evals
```

The first `docker compose up -d` builds images and can take several minutes;
subsequent runs start in seconds.

## Demo agent

A LangGraph research assistant — planner → retriever → writer → fact_checker —
instrumented only through the `agentproof` SDK, across 13 scenarios including a
prompt-injection attempt, a tool failure, and four questions its corpus cannot
fully answer.

The replay fixtures are a **recording of a real live run**, not authored text, so
CI grades genuine model output while staying deterministic and free. Replay
reproduces the recorded run byte-for-byte.

```bash
pip install -e ./sdk -e ./demo_agent
python -m demo_agent run --scenario all --mode replay --export
```

- `--mode replay` (default) needs no API key; `--mode live` calls Claude.
- `--record-fixtures PATH` with `--mode live` freezes a live run as replay
  fixtures.

Capture the agent's traces as an eval corpus and gate them — no database, no API
key, this is what CI runs:

```bash
python -m demo_agent capture --scenario all --mode replay --out corpus.json
cd server && python -m agentproof_server.eval_engine.cli regression \
  --traces ../corpus.json \
  --baseline ../baselines/demo-agent-replay.json \
  --config ../fixtures/regression_config.yaml
```

Exits 0 when the agent still matches its pinned baseline, 1 when a CI-blocking
metric has regressed.

### One project in the dashboard is generated, not measured

`synthetic-showcase` is a fabricated corpus of 300 traces over 180 days with a
deliberate slow quality drift, seeded so it regenerates identically. It exists to
exercise the dashboard at a data volume the real corpus does not reach.

```bash
docker compose exec server python -m agentproof_server.scripts_pkg.synthetic_showcase
```

It lives under its own project name, is badged **generated data** wherever it
appears, is never baselined, and is never fed to the regression gate. **No
generated row ever enters `demo-research-agent`** — that corpus stays a
byte-for-byte recording, which is the only reason the numbers above are worth
anything.

## Instrument your own agent

```python
from agentproof import AgentProof, SpanType

ap = AgentProof(server_url="http://localhost:8000", project="my-agent")

with ap.trace("research-task") as t:
    with t.span("retrieve", span_type=SpanType.RETRIEVAL) as s:
        results = retriever.search(query)
        s.record_retrieval(query=query, sources=results, top_k=5)

    with t.span("generate", span_type=SpanType.LLM_CALL) as s:
        resp = llm.generate(prompt)
        s.record_llm_call(
            model="gpt-4o-mini", user_prompt=prompt, completion=resp.content,
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
        )
```

For LangGraph, wrap the compiled graph — no changes to your graph definition:

```python
from agentproof.adapters.langgraph import instrument_langgraph

instrumented = instrument_langgraph(graph, ap)
result = instrumented.invoke({"question": "What are multi-agent systems?"})
```

## Gate it in your CI

The gate ships as a composite action at the root of this repository. Point it at
a trace corpus, a pinned baseline, and a config:

```yaml
- uses: yash2484/AgentProof@main
  with:
    traces: corpus.json
    baseline: baselines/my-agent.json
    config: agentproof.yaml
```

The step fails when a metric regresses beyond noise. It needs no database and no
API key, and the engine is installed from the same commit as the action, so the
gate you run is the gate you pinned.

If your corpus is produced by running your agent rather than committed, hand the
action the command and let it capture first:

```yaml
- uses: yash2484/AgentProof@main
  with:
    extra-install: -e ./sdk -e ./my_agent
    capture-command: python -m my_agent capture --out "${RUNNER_TEMP}/corpus.json"
    traces: ${{ runner.temp }}/corpus.json
    baseline: baselines/my-agent.json
    config: agentproof-ci.yaml
```

### Judged metrics are opt-in, and refuse to run half-configured

Add `anthropic-api-key` and a `judged-config` to gate on `faithfulness` and
`relevance` as well:

```yaml
    config: fixtures/regression_config.yaml            # no key -> this one
    judged-config: fixtures/regression_config_judged.yaml
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Without the secret the action selects `config` and reports only measured
metrics. It will not run a judged config unkeyed. That is a deliberate refusal
rather than a convenience: an unkeyed judge does not raise, it scores every span
`0.0`, so the report would read `faithfulness 0.908 -> 0.000` and blame your pull
request for a missing secret. A gate that invents a regression is worse than no
gate. Forks, which never receive secrets, skip the judged job instead of failing
it.

## Status

Phases 0–8 complete and merged, tags `phase-1` … `phase-8`, plus a hardening
pass and the Ledger dashboard rework on top.

| Phase | Feature |
|---|---|
| 0–1 | Monorepo, Docker, CI, trace schema, collector SDK, storage API |
| 2 | Eval engine — deterministic, LLM-as-judge, composite |
| 3 | Security evals — prompt injection, tool misuse, data exfiltration |
| 4 | Regression detector (Welch's t-test) + CI gate |
| 5 | Dashboard — trace waterfall, eval timeseries, security reports |
| 6 | Demo research-assistant agent (LangGraph) |
| 7 | Agent-gated CI |
| 8 | Dashboard redesign |
| — | Hardening: live judge, fault injection, measured sensitivity and overhead |
| — | Ledger — light document theme, grouped metrics, provenance on every figure |
| — | Composite action — the gate packaged as `uses:`, and consumed by this repo's own CI |
| — | Paired detection — scenario identity, measured noise floors, calibrated sensitivity |

### What works today

- **Trace data model** — a DAG of typed spans (`llm_call`, `tool_use`,
  `retrieval`, `agent_handoff`, `human_decision`) with multi-parent support for
  parallel and merge topologies.
- **Collector SDK** (`agentproof`) — context-manager and decorator
  instrumentation, a fire-and-forget async exporter (buffering, batching, retry,
  bounded buffer with an observable drop counter), token-cost computation, and a
  LangGraph auto-instrumentation adapter.
- **Storage API** (FastAPI + Postgres) — batch and single trace ingestion,
  filtered listing, full-trace detail, span-DAG tree view, delete. SQLAlchemy 2.0
  async with GIN and composite indexes.
- **Eval engine** — eight metrics driven by `agentproof.yaml`: three
  deterministic (`latency_budget`, `cost_budget`, `tool_allowlist`), three
  security (`injection_resistance`, `data_exfiltration`, `tool_misuse`), two
  LLM-judge (`faithfulness`, `relevance`). Metrics can be scoped to named spans,
  because a groundedness rubric is meaningless against a planner's list of search
  queries.
- **Security evals** — a built-in, overridable rule library of 40 patterns across
  3 attack categories, with per-metric `detection_mode` (`heuristic | llm |
  dual`). Heuristic mode is free and key-free; `llm` and `dual` build a judge
  client when a key is available and degrade to heuristic with a warning when it
  is not.
- **Regression detector** — pinned-baseline comparison, scenario against
  scenario, with a paired t-test and Cohen's *d_z*, a practical-significance
  floor that can be set per metric, and the small-sample floor described above.
  Falls back to the two-sample Welch path when a corpus carries no stable
  scenario identity, or when the candidate does not cover every pinned
  scenario — deliberately, because pairing on whatever happens to intersect
  would let a renamed or dropped scenario shrink the population under test
  between runs without saying so, and the run that quietly stops comparing the
  hard scenario is exactly the run that looks fine. File-based and DB-free.
- **CI gates** — three jobs on every pull request, all DB-free, and all of them
  consuming the same composite action a stranger would add via `uses:`. There is
  no hand-rolled copy of the gate in this repository's own workflow; if the
  action breaks, this repository's pull requests break with it.
  `fixture-gate` runs a committed corpus that carries no scenario identity, so
  it exercises the unpaired Welch fallback — kept that way on purpose, so both
  comparison paths have CI coverage. `agent-gate` runs the demo agent *on that
  commit*, captures the traces it produces, and gates them paired against a
  pinned baseline, key-free. `judge-gate` adds `faithfulness` and `relevance`,
  the only two metrics on this corpus with enough variance to produce a
  statistic rather than a threshold check, and it skips cleanly when no key is
  present — so forks, which never receive secrets, are not failed by it.
- **Dashboard** — Vite + React + MUI across four top-level routes plus trace and
  metric detail views: overview with a gate verdict and run-to-run variance,
  traces with a span waterfall and a run-eval action, evals grouped by metric
  type, and a security report. Every figure carries its denominator and its
  provenance.
- **Visual gates** — `scripts/ui_audit.py` reports overflow with the responsible
  element named, console errors, the font families actually resolved, and a WCAG
  AA sweep per text node, across six routes at 1440px and 390px.
  `scripts/demo_check.py` fails if the app lands anywhere but the measured
  corpus, or if a generated-data marker could reach a screenshot.
- **Tests** — 416 server passing with 36 skipped (the skips are DB-backed and
  run in CI against a Postgres service), 43 SDK, 38 demo-agent, 418 dashboard
  (Vitest). `ruff` clean across `server/`, `sdk/`, `demo_agent/`, `scripts/`;
  dashboard `eslint` and `tsc` clean; `ui_audit` 12/12 clean. One DB test is a
  known intermittent — see limitations.

## Repository layout

```
sdk/         # pip-installable collector SDK (agentproof) + benchmarks
server/      # FastAPI backend: trace storage, API, eval engine
dashboard/   # React dashboard
demo_agent/  # Demo research-assistant agent (LangGraph)
fixtures/    # Pinned eval corpora and configs
baselines/   # Pinned score distributions the CI gate compares against
scripts/     # Seeding and the visual gates (ui_audit, demo_check)
docs/        # Detector sensitivity, walkthrough, design specs, screenshots
```

## Development

```bash
cd sdk        && python -m pytest -q
cd server     && python -m pytest -q
cd demo_agent && python -m pytest -q
cd dashboard  && npm install && npm test

ruff check server/ sdk/ demo_agent/ scripts/     # run from the repo root
```

`sdk/tests` and `demo_agent/tests` cannot be collected in one pytest run — both
name their test package `tests`.

## Honest limitations

Kept here deliberately, because a harness that overstates itself is the thing it
exists to prevent. These five change how you should read every number above. The
complete list — scope, measurement caveats, and the open defects — is in
[docs/limitations.md](docs/limitations.md).

- **The demo agent is the only agent it has run against.** Every number on this
  page comes from one 13-scenario LangGraph agent written by the same author.
  LangGraph is also the only auto-instrumentation adapter, though the core is
  framework-neutral and manual instrumentation works anywhere. Instrumenting a
  second, unrelated project is the next real validation.
- **The LLM judge is not calibrated against human labels.** It discriminates
  fabrication from grounded text by a wide margin, but no agreement statistic
  (Cohen's kappa or otherwise) has been computed against a hand-labelled gold
  set. Until that exists, treat judge scores as a soft signal.
- **Five of eight metrics have never moved** on the demo corpus. No scenario
  stresses the deterministic and security checks hard enough. The dashboard
  reports them as unexercised rather than passing, which is the honest reading
  but not a substitute for exercising them.
- **A single security breach does not block the build.** The effect-size guard
  is designed for graded quality metrics, where one bad answer should not
  convict a whole suite. Applied to security it reads oddly: one scenario in
  thirteen successfully prompt-injected produces `d_z=0.277` and passes, and it
  takes three before the gate fires. Reproduction and the full table are in
  [docs/walkthrough.md](docs/walkthrough.md). Open, and the likeliest fix is to
  route zero-noise metrics to an absolute-drop rule rather than a statistical
  one.
- **The batch eval endpoint can return 200 without persisting.**
  `server/tests/integration/test_eval_pipeline.py` reproduces it intermittently
  (measured at 2 failures in 4 consecutive runs): POST a batch, get 200, then
  404 on the trace, with no rows written. An endpoint that reports success
  without writing is the same class of defect as a metric that reports a pass
  without measuring, and it is open.

## License

MIT
