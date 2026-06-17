# server/agentproof_server/scripts_pkg/seed_demo_traces.py
"""
Seed three demo traces into a running AgentProof server so the eval CLI and the
live smoke test have targets before the Phase-6 demo agent exists.

Traces:
  (a) clean RAG          — completion fully grounded in retrieved sources
  (b) unfaithful RAG     — completion adds an unsupported claim
  (c) tool-use trace     — exercises the tool allowlist

Run against a live server:
    python -m agentproof_server.scripts_pkg.seed_demo_traces
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

BASE_URL = os.environ.get("AGENTPROOF_SERVER_URL", "http://localhost:8000")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _trace(name: str, project: str, spans: list[dict], **totals) -> dict:
    return {
        "trace_id": f"seed-{name}-{uuid.uuid4()}",
        "project": project,
        "name": name,
        "start_time": _now_iso(),
        "end_time": _now_iso(),
        "status": "ok",
        "spans": spans,
        **totals,
    }


def _retrieval_span(prefix: str, query: str, sources: list[dict]) -> dict:
    return {
        "span_id": f"{prefix}-retrieval",
        "span_type": "retrieval",
        "name": "retrieval",
        "start_time": _now_iso(),
        "end_time": _now_iso(),
        "latency_ms": 120,
        "metadata": {
            "query": query,
            "num_results": len(sources),
            "top_k": 5,
            "sources": sources,
        },
    }


def _llm_span(prefix: str, query: str, completion: str) -> dict:
    return {
        "span_id": f"{prefix}-llm",
        "span_type": "llm_call",
        "name": "synthesis",
        "start_time": _now_iso(),
        "end_time": _now_iso(),
        "latency_ms": 800,
        "metadata": {
            "model": "gpt-4o-mini",
            "user_prompt": query,
            "completion": completion,
            "input_tokens": 450,
            "output_tokens": 120,
            "total_tokens": 570,
            "cost_usd": 0.00014,
        },
    }


def build_demo_traces() -> list[dict]:
    run_id = uuid.uuid4().hex[:8]

    sources = [
        {
            "doc_id": "d1",
            "chunk_id": "c1",
            "score": 0.92,
            "text_preview": "The Eiffel Tower is 330 metres tall.",
        },
    ]
    query = "How tall is the Eiffel Tower?"

    clean_prefix = f"clean-rag-{run_id}"
    clean = _trace(
        "clean-rag",
        "demo-research-agent",
        [
            _retrieval_span(clean_prefix, query, sources),
            _llm_span(
                clean_prefix, query, "The Eiffel Tower is 330 metres tall."
            ),
        ],
        total_latency_ms=920,
        total_tokens=570,
        total_cost_usd=0.00014,
    )

    unfaithful_prefix = f"unfaithful-rag-{run_id}"
    unfaithful = _trace(
        "unfaithful-rag",
        "demo-research-agent",
        [
            _retrieval_span(unfaithful_prefix, query, sources),
            _llm_span(
                unfaithful_prefix,
                query,
                (
                    "The Eiffel Tower is 330 metres tall and was built by "
                    "NASA in 1950."
                ),
            ),
        ],
        total_latency_ms=950,
        total_tokens=580,
        total_cost_usd=0.00015,
    )

    tool_prefix = f"tool-use-{run_id}"
    tool_trace = _trace(
        "tool-use",
        "demo-research-agent",
        [
            {
                "span_id": f"{tool_prefix}-tool-search",
                "span_type": "tool_use",
                "name": "web_search",
                "start_time": _now_iso(),
                "end_time": _now_iso(),
                "latency_ms": 200,
                "metadata": {
                    "tool_name": "web_search",
                    "tool_input": {"q": "Eiffel Tower height"},
                    "tool_output": "330 metres",
                    "success": True,
                },
            },
            _llm_span(tool_prefix, query, "It is 330 metres tall."),
        ],
        total_latency_ms=1000,
        total_tokens=300,
        total_cost_usd=0.00008,
    )

    return [clean, unfaithful, tool_trace]


def main() -> None:
    import httpx

    traces = build_demo_traces()
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        resp = client.post("/api/v1/traces/batch", json=traces)
        resp.raise_for_status()
        print(f"Seeded {len(traces)} traces -> {resp.json()}")
        for t in traces:
            print(f"  {t['name']}: {t['trace_id']}")


if __name__ == "__main__":
    main()
