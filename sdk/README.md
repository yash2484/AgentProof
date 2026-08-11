# agentproof

The collector SDK for [AgentProof](https://github.com/yash2484/AgentProof) — a CI
regression gate for teams shipping an agent as a product.

This package is the instrumentation half. It records what an agent did as a DAG
of typed spans and ships them to an AgentProof server, which grades them against
a pinned baseline and returns a verdict carrying a p-value and an effect size.

## Install

```bash
pip install agentproof
pip install "agentproof[langgraph]"   # with the LangGraph adapter
```

## Instrument anything

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

Span types are `llm_call`, `tool_use`, `retrieval`, `agent_handoff` and
`human_decision`. Spans support multiple parents, so parallel and merge
topologies record as the graph they actually were rather than a flattened list.

## LangGraph

Wrap the compiled graph. Your graph definition does not change.

```python
from agentproof.adapters.langgraph import instrument_langgraph

instrumented = instrument_langgraph(graph, ap)
result = instrumented.invoke({"question": "What are multi-agent systems?"})
```

## What it costs you

Measured with `python benchmarks/bench_instrumentation.py`:

| operation | p50 | p99 |
|---|---:|---:|
| `enqueue` (normal) | 1.4 µs | 4.8 µs |
| `enqueue` (buffer full, drops oldest) | 4.8 µs | 12.2 µs |
| span open + close | 6.9 µs | 23.5 µs |
| full 4-span trace, built and enqueued | 35.3 µs | 112.3 µs |

A fully instrumented run costs about **0.035 ms at p50** against LLM calls that
take hundreds of milliseconds. Export runs on a background daemon thread and
never blocks the caller, so network time is not on your critical path.

The buffer is bounded. When it fills it drops the oldest span and increments an
observable counter, rather than growing without limit or blocking the agent.
Losing telemetry is recoverable; stalling the thing being measured is not.

## Docs

Full documentation, the eval engine, the regression detector and the dashboard
live in the [main repository](https://github.com/yash2484/AgentProof).

## License

MIT
