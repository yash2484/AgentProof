# AgentProof

[![CI](https://github.com/yash2484/AgentProof/actions/workflows/ci.yml/badge.svg)](https://github.com/yash2484/AgentProof/actions/workflows/ci.yml)
[![Regression](https://github.com/yash2484/AgentProof/actions/workflows/regression.yml/badge.svg)](https://github.com/yash2484/AgentProof/actions/workflows/regression.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

**An eval, observability, and security harness for LLM agents — with a CI gate
that has been proven to fire.**

AgentProof traces every LLM call, tool invocation, and agent handoff as a typed
span DAG, scores each trace against configurable metrics (deterministic,
LLM-as-judge, and security), and blocks a pull request when a pinned metric drops
by an amount that is both statistically significant and large enough to matter.

The core is framework-neutral — instrument anything with a context manager or a
decorator. LangGraph gets a one-line auto-instrumentation adapter.

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

## Status

Phases 0–8 complete and merged; tags `phase-1` … `phase-8`.

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
- **Dashboard** — Vite + React + MUI: trace list with filters and delete, span
  waterfall with a detail panel and a run-eval action, eval-score timeseries, and
  a security report.
- **Tests** — 169 server, 43 SDK, 37 demo-agent, 140 dashboard (Vitest). `ruff`
  clean across `server/`, `sdk/`, `demo_agent/`, `scripts/`; dashboard `eslint`
  and `tsc` clean.

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

### The `synthetic-showcase` project is generated, not measured

Everything above is measured. One thing in the dashboard is not, and it is
labelled everywhere it appears.

The recorded corpus is 25 traces across 4 runs — enough to prove the harness
works, too thin to evaluate a dashboard against, since most metrics never move
and every trend is two points. `synthetic-showcase` is a fabricated corpus of
300 traces over 180 days with a deliberate slow quality drift, seeded so it
regenerates identically:

```bash
docker compose exec server python -m agentproof_server.scripts_pkg.synthetic_showcase
```

It lives under its own project name, is badged **generated data** in the
project switcher and the scope bar, and is never baselined or fed to the
regression gate. **No generated row ever enters `demo-research-agent`** — that
corpus stays a byte-for-byte recording, which is the only reason the claim
above is worth anything.

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

## Repository layout

```
sdk/         # pip-installable collector SDK (agentproof) + benchmarks
server/      # FastAPI backend: trace storage, API, eval engine
dashboard/   # React dashboard
demo_agent/  # Demo research-assistant agent (LangGraph)
fixtures/    # Pinned eval corpora and configs
baselines/   # Pinned score distributions the CI gate compares against
docs/        # Detector sensitivity, walkthrough, design specs
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

- **The LLM judge is not calibrated against human labels.** It discriminates
  fabrication from grounded text by a wide margin, but no agreement statistic
  (Cohen's kappa or otherwise) has been computed against a hand-labelled gold
  set. Until that exists, treat judge scores as a soft signal.
- **Six of eight metrics sit flat at 1.000** on the demo corpus. Only
  `faithfulness` and `relevance` currently have variance; no scenario stresses
  the deterministic and security checks hard enough to move them.
- **One adapter ships.** The core is framework-neutral and manual instrumentation
  works anywhere, but LangGraph is the only auto-instrumentation adapter today.
- **The demo agent is the only agent it has run against.** Instrumenting a second,
  unrelated project is the next real validation.
- **Alembic migrations are scaffolded, not written.** `versions/` is empty, so a
  declared `ondelete="CASCADE"` is not in the deployed schema.

## License

MIT
