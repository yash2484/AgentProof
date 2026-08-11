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
the middle: *38 of 45 traces measured*, *7 never evaluated — not passing,
unmeasured*, *5 of 8 metrics never moved — unexercised, not proven*. Those
sentences are the product.

## What it refuses to say

The most useful thing this gate does is decline.

```
relevance   base=0.931  cand=0.908   p=0.3877 >= alpha=0.05,  d=0.113 < 0.5
```

Relevance fell by 0.023 between the pinned baseline and the latest run. An
effect exists. Neither guard clears, so the gate reports **no regression** and
says why in the same line. It does not round the drop away, and it does not
promote it to a finding.

A tool that only ever reports movement will report noise, and a team that gets
paged for noise turns the gate off within a month.

## It caught a real hallucination

The demo agent was asked about retry logic and rate limits, which its document
set does not cover. It answered:

> *"Based on the provided context, retry logic and rate limiting interact with
> coordination patterns in the following ways..."*

and then produced a detailed, confidently formatted answer that appears nowhere
in the retrieved sources. A fabrication wearing a citation phrase.

**Faithfulness: 0.20.** No fault was injected — the agent did that on its own,
and the harness caught it.

On a question with genuinely no answer in the corpus, the same agent scored
faithfulness **1.00** and relevance **0.40**: it correctly refused, so nothing was
fabricated, but nothing was answered either. Two metrics measuring different
things and diverging when they should.

## Evidence, not adjectives

Every number below is produced by committed code you can re-run.

### The gate has been proven to fire

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

### How small a regression it catches

| metric kind | example | fires at |
|---|---|---|
| heuristic (noise-free) | `data_exfiltration` | **4 of 12 traces (33%)**, p=0.033, d=0.80 |
| LLM judge (noisy) | `faithfulness` | **6 of 13 traces (46%)** |

It also stays quiet at 1–2 broken traces, which is inside normal agent
variation. A gate that cries wolf gets switched off.

The judge-backed gate is deafer on purpose-of-metric grounds: a leaking trace
scores 0.0 on a regex check (a full 1.0 drop), while a fabricating trace scores
0.35–0.55 from a judge because the rest of the answer is still grounded. Half the
signal per trace, so it takes proportionally more of them. Full sweeps and
reasoning in [docs/detector-sensitivity.md](docs/detector-sensitivity.md).

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

Judge scores drift. The same trace, the same frozen fixture and the same model
produced 0.20 on one run and 0.40 on another — a ±0.2 per-trace swing. A gate
that simply compared means would fire on that noise.

Three rules keep it honest:

1. **One-sided Welch's t-test** at alpha=0.05 — the drop has to be statistically
   distinguishable from variance.
2. **A Cohen's *d* ≥ 0.5 effect-size guard** — it also has to be large enough to
   care about. Both must agree. In the sweep at k=3, the effect size had cleared
   (d=0.619) while significance had not (p=0.073), and the gate correctly held
   back.
3. **An absolute-drop floor below `min_sample_size` (9)** — under nine samples per
   group the t-test is underpowered, so a blunt rule decides instead rather than a
   confident-looking wrong one.

Deterministic and heuristic metrics gate **every pull request**, free and
key-free. Judge metrics are run against a key on demand, because they cost money
and cannot be made deterministic.

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

**5 of 38 traces attacked (13.2%). 33 were never probed.** A breach count means
little without knowing how much of the surface was tested, so the coverage sits
beside the count. Failures are enumerated; passing rows are counted and never
listed, because a wall of green invites the reading that everything was checked.

## The corpus, stated plainly

The dashboard lands on `demo-research-agent`, a real LangGraph agent, and every
figure above comes from it. `scripts/demo_check.py` fails the build if the app
ever lands anywhere else.

| | |
|---|---:|
| traces | 45 |
| evaluation runs | 10 |
| measurements | 520 |
| computed from recorded spans by code | 389 |
| returned by a live judge call | 112 |
| judge calls that errored or refused | 19 |
| total cost of the live runs | **$0.128** across 37,800 tokens |

The 19 broken judge calls are **kept and shown as broken**. Twelve of them are
historical `401`s from a run against a dead key. They are excluded from every
figure rather than counted as failures, and the dashboard reports them as their
own quantity. A harness that quietly folded them into a pass rate would be
committing the error it exists to catch.

Two caveats a reader should have before trusting any chart here:

- **The runs are not all the same size.** Four of the ten evaluated a single
  adversarial trace while others averaged thirteen mixed scenarios. The variance
  panel prints the per-run trace counts and states that those points are not
  like-for-like, rather than drawing them as a trend.
- **45 traces is small.** It is enough to prove the harness works end to end. It
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
- **Regression detector** — pinned-baseline Welch's t-test with the effect-size
  guard and small-sample floor described above. File-based and DB-free.
- **CI gates** — two jobs on every pull request, both key-free and DB-free.
  `fixture-gate` exercises the t-test path against a corpus with known variance.
  `agent-gate` runs the demo agent *on that commit*, captures the traces it
  produces, and gates them against a pinned baseline. Because CI runs the agent
  in deterministic replay, this catches structural and harness regressions;
  behavioural changes to the model itself are covered by the judge tests, which
  need a key.
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
- **Tests** — 355 server unit, 39 server DB, 43 SDK, 38 demo-agent, 409 dashboard
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
exists to prevent.

- **This is not an observability product.** Evaluation is after-the-fact and
  batch; there is no live ingest, no alerting, and no streaming view. It stores
  traces because it needs them to grade, not to compete on tracing.
- **It is the wrong shape for ad-hoc use.** The gate compares a fixed input set
  against a pinned baseline. A developer using an LLM CLI runs a different task
  every session, so there is nothing stable to pin a baseline against.
- **The LLM judge is not calibrated against human labels.** It discriminates
  fabrication from grounded text by a wide margin, but no agreement statistic
  (Cohen's kappa or otherwise) has been computed against a hand-labelled gold
  set. Until that exists, treat judge scores as a soft signal.
- **Five of eight metrics have never moved** on the demo corpus. No scenario
  stresses the deterministic and security checks hard enough. The dashboard
  reports them as unexercised rather than passing, which is the honest reading
  but not a substitute for exercising them.
- **One adapter ships.** The core is framework-neutral and manual instrumentation
  works anywhere, but LangGraph is the only auto-instrumentation adapter today.
- **The demo agent is the only agent it has run against.** Instrumenting a second,
  unrelated project is the next real validation.
- **Alembic migrations are scaffolded, not written.** `versions/` is empty, so a
  declared `ondelete="CASCADE"` is not in the deployed schema.
- **The batch eval endpoint can return 200 without persisting.**
  `test_eval_pipeline_end_to_end` reproduces it intermittently (roughly 2 runs in
  4): POST a batch, get 200, then 404 on the trace, with no rows written. An
  endpoint that reports success without writing is the same class of defect as a
  metric that reports a pass without measuring, and it is open.
- **Triggering evals from the demo agent can time out.** `trigger_evals` in
  `demo_agent/demo_agent/export.py` uses a short HTTP timeout, while a 13-trace
  batch genuinely takes around seven minutes. The client gives up, the disconnect
  cancels the server handler, and nothing is written. Evaluate from the dashboard
  or the CLI until this is fixed.
- **The positioning above is a judgement, not a validated finding.** It is
  inferred from what the code does well. It has not been checked against a team
  that ships an agent in production.

## License

MIT
