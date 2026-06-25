# AgentProof

**Framework-agnostic eval, observability, and security harness for multi-agent systems.**

AgentProof traces every LLM call, tool invocation, and agent handoff across your
multi-agent system, then runs configurable evaluations (deterministic, LLM-as-judge,
and security red-teams) to catch quality regressions and adversarial vulnerabilities
before they reach production.

## Status: Active Development

Built in phases (see `AgentProof-Complete-Build-Guide`). Current milestone: **Phase 5 complete** (`phase-5-dashboard` branch).

| Phase | Feature | State |
|-------|---------|-------|
| 0 | Monorepo scaffolding, Docker, CI | ✅ Done |
| 1 | Trace schema + collector SDK + storage API | ✅ Done |
| 2 | Eval engine (deterministic + LLM-as-judge via Claude) | ✅ Done |
| 3 | Security eval module (prompt injection, tool misuse, data exfiltration) | ✅ Done |
| 4 | Regression detector (Welch's t-test) + CI/CD GitHub Action | ✅ Done |
| 5 | Dashboard (trace waterfall, eval timeseries, security reports) | ✅ Done |
| 6 | Demo research-assistant agent (LangGraph) + narrative/docs | ✅ Done |

### What works today (Phase 5)

- **Trace data model** — a DAG of typed spans (`llm_call`, `tool_use`, `retrieval`,
  `agent_handoff`, `human_decision`) with multi-parent support for parallel/merge topologies.
- **Collector SDK** (`agentproof`) — context-manager + decorator instrumentation, a
  fire-and-forget async exporter (buffering, batching, retry, graceful drop), built-in
  token-cost computation, and a **LangGraph auto-instrumentation adapter** (AutoGen planned).
- **Storage API** (FastAPI + Postgres) — batch/single trace ingestion, filtered listing,
  full-trace detail, span-DAG tree view, and delete, backed by SQLAlchemy 2.0 (async) with
  GIN/composite indexes. Alembic async migrations scaffolded.
- **Eval Engine** — deterministic + LLM-as-judge + composite evaluators driven by
  `agentproof.yaml`, runnable via `python -m agentproof_server.eval_engine.cli evaluate
  --trace-id <id>` and the `/api/v1/evals/*` endpoints. Results persist to `eval_results`
  and are readable via `GET /api/v1/evals/results/{trace_id}`.
- **Security Eval Module** — `injection_resistance`, `data_exfiltration`, and
  `tool_misuse` evaluators with per-metric `detection_mode` (`heuristic | llm |
  dual`), a built-in overridable rule library, driven by `agentproof.yaml` and
  run through the same CLI/API as the other metrics. Heuristic mode runs free in
  CI; `llm`/`dual` use the Claude judge and degrade to heuristic without a key.
- **Regression Detector** — a pinned-baseline Welch's t-test (one-sided, with a
  Cohen's d effect-size guard) flags statistically significant *drops* in eval
  scores. File-based, DB-free CLI subcommands
  (`python -m agentproof_server.eval_engine.cli baseline ...` /
  `regression ...`) build a baseline and gate a run against it; a separate
  `regression.yml` GitHub Action runs the check on a committed fixture corpus
  with no database or API key.
- **Dashboard** — a Vite + React + MUI single-page app (`dashboard/`) that reads
  the existing API: trace list with filters/delete, a span **waterfall** with a
  per-span detail panel and a **Run eval** action, an **eval-score timeseries**,
  and a **security report**. A `scripts/seed_dashboard.py` loads demo data.
- **Tests** — 123 server/SDK unit tests + integration tests (auto-skips without a
  live server/key); 37 dashboard unit tests (Vitest). `ruff` clean across `sdk/`
  and `server/`; dashboard `eslint` + `tsc` clean.

## Quick Start

```bash
cp .env.example .env   # Fill in your API keys
docker compose up -d   # Postgres + API (+ dashboard once Phase 5 lands)
# Server: http://localhost:8000  (GET /health -> {"status": "ok"})
```

### Dashboard (Phase 5)

```bash
docker compose up -d                 # postgres + server + dashboard
python scripts/seed_dashboard.py     # load demo traces + evals (server must be up)
# open http://localhost:5173
```

The dashboard (Vite + React + MUI) reads the existing API and provides a trace
list, a span **waterfall** with a per-span detail panel, an **eval-score
timeseries**, and a **security report** — plus run-eval, filtering, and delete.

Run the dashboard tests:

```bash
cd dashboard && npm install && npm test
```

### Demo agent (Phase 6)

A real LangGraph research assistant (planner → retriever → writer → fact_checker),
instrumented only via the `agentproof` SDK. Runs key-free (recorded replay) or
live (`ANTHROPIC_API_KEY`).

```bash
docker compose up -d                 # postgres + server + dashboard
pip install -e ./sdk -e ./demo_agent
python -m demo_agent run --scenario all --mode replay --export
# open the dashboard — three traces appear: success, error, injection
```

- `--mode replay` (default) needs no API key; `--mode live` calls Claude.
- Without `--export` the agent runs locally and prints a summary (no server).

See `docs/walkthrough.md` for the full end-to-end story.

### Instrument an agent (SDK)

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
            input_tokens=resp.usage.prompt_tokens, output_tokens=resp.usage.completion_tokens,
        )
```

For LangGraph, wrap the compiled graph instead — no changes to your graph definition:

```python
from agentproof.adapters.langgraph import instrument_langgraph

instrumented = instrument_langgraph(graph, ap)
result = instrumented.invoke({"question": "What are multi-agent systems?"})
```

## Repository layout

```
sdk/       # The pip-installable collector SDK (agentproof)
server/    # FastAPI backend: trace storage + API (eval engine lands in Phase 2)
dashboard/ # React dashboard (Phase 5)
demo_agent/# Demo research-assistant agent (Phase 6)
```

## Development

```bash
cd sdk    && python -m pytest tests/      # SDK unit tests
cd server && python -m pytest tests/      # server tests (integration needs live Postgres)
ruff check sdk/ server/                    # lint
```

## License

MIT
