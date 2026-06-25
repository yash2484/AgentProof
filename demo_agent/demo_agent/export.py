"""Run scenarios through the instrumented graph, ship traces, trigger evals."""

from __future__ import annotations

import httpx
from agentproof import AgentProof
from agentproof.adapters.langgraph import instrument_langgraph

from demo_agent.graph import build_graph
from demo_agent.llm import LLMBackend
from demo_agent.scenarios import SCENARIOS


def trigger_evals(server_url: str, trace_ids: list[str]) -> None:
    """Trigger a batch eval run for the given traces (no-op if empty)."""
    if not trace_ids:
        return
    base = server_url.rstrip("/") + "/api/v1"
    with httpx.Client(base_url=base, timeout=30.0) as client:
        resp = client.post("/evals/run-batch", json={"trace_ids": trace_ids})
        resp.raise_for_status()


def run_and_export(
    scenario_keys: list[str],
    *,
    backend: LLMBackend,
    server_url: str,
    project: str,
) -> list[str]:
    """Run scenarios through one instrumented graph; traces ship via the SDK
    exporter. Flush, then trigger evals. Returns the produced trace ids.
    """
    ap = AgentProof(server_url=server_url, project=project)
    graph = build_graph(backend)
    instrumented = instrument_langgraph(graph, ap, trace_name="research-assistant")
    for key in scenario_keys:
        instrumented.invoke(SCENARIOS[key].initial_state())
    ap.flush()
    trigger_evals(server_url, instrumented.trace_ids)
    return instrumented.trace_ids
