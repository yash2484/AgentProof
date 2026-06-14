# AgentProof

**Framework-agnostic eval, observability, and security harness for multi-agent systems.**

AgentProof traces every LLM call, tool invocation, and agent handoff across your
multi-agent system, then runs configurable evaluations (deterministic, LLM-as-judge,
and security red-teams) to catch quality regressions and adversarial vulnerabilities
before they reach production.

## Status: Active Development

Built in phases (see `AgentProof-Complete-Build-Guide`). Current milestone: **Phase 1 complete** (`phase-1` tag).

| Phase | Feature | State |
|-------|---------|-------|
| 0 | Monorepo scaffolding, Docker, CI | ✅ Done |
| 1 | Trace schema + collector SDK + storage API | ✅ Done |
| 2 | Eval engine (deterministic + LLM-as-judge via Claude) | ⏳ Next |
| 3 | Security eval module (prompt injection, tool misuse, data exfiltration) | ◻ Planned |
| 4 | Regression detector (Welch's t-test) + CI/CD GitHub Action | ◻ Planned |
| 5 | Dashboard (trace waterfall, eval timeseries, security reports) | ◻ Planned |
| 6–7 | Demo agent, narrative, docs, launch | ◻ Planned |

### What works today (Phase 1)

- **Trace data model** — a DAG of typed spans (`llm_call`, `tool_use`, `retrieval`,
  `agent_handoff`, `human_decision`) with multi-parent support for parallel/merge topologies.
- **Collector SDK** (`agentproof`) — context-manager + decorator instrumentation, a
  fire-and-forget async exporter (buffering, batching, retry, graceful drop), built-in
  token-cost computation, and a **LangGraph auto-instrumentation adapter** (AutoGen planned).
- **Storage API** (FastAPI + Postgres) — batch/single trace ingestion, filtered listing,
  full-trace detail, span-DAG tree view, and delete, backed by SQLAlchemy 2.0 (async) with
  GIN/composite indexes. Alembic async migrations scaffolded.
- **Tests** — 22 SDK unit tests; server import + an SDK→server→DB→API integration round-trip
  (auto-skips without a live Postgres). `ruff` clean across `sdk/` and `server/`.

## Quick Start

```bash
cp .env.example .env   # Fill in your API keys
docker compose up -d   # Postgres + API (+ dashboard once Phase 5 lands)
# Server: http://localhost:8000  (GET /health -> {"status": "ok"})
```

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
