"""Run scenarios through the instrumented graph, ship traces, trigger evals.

Two sinks share one run path:

- ``run_and_export`` ships traces to a live server, then triggers evals.
- ``run_and_capture`` writes them to a JSON file for the DB-free regression
  gate in CI.
"""

from __future__ import annotations

from pathlib import Path

import httpx
from agentproof import AgentProof, FileExporter
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


def _run_scenarios(
    scenario_keys: list[str], *, backend: LLMBackend, ap: AgentProof
) -> list[str]:
    """Invoke each scenario through one instrumented graph, then flush.

    The single instrument-and-invoke path shared by every sink, so the export
    and capture routes cannot drift apart.

    Every trace is tagged with the scenario that produced it. Without that the
    corpus has no stable identity across runs -- ``trace_id`` is a fresh UUID
    each time and every trace shares the name "research-assistant" -- so the
    regression gate can only compare two unordered bags of scores, which makes
    between-scenario difficulty look like measurement noise. The tag is what
    lets a run be compared to the previous one scenario by scenario.
    """
    graph = build_graph(backend)
    instrumented = instrument_langgraph(graph, ap, trace_name="research-assistant")
    for key in scenario_keys:
        instrumented.invoke(
            SCENARIOS[key].initial_state(), trace_tags={"scenario": key}
        )
    ap.flush()
    return instrumented.trace_ids


def run_and_export(
    scenario_keys: list[str],
    *,
    backend: LLMBackend,
    server_url: str,
    project: str,
) -> list[str]:
    """Run scenarios; traces ship via the SDK exporter to a live server.

    Flushes, then triggers evals. Returns the produced trace ids.
    """
    ap = AgentProof(server_url=server_url, project=project)
    trace_ids = _run_scenarios(scenario_keys, backend=backend, ap=ap)
    trigger_evals(server_url, trace_ids)
    return trace_ids


def run_and_capture(
    scenario_keys: list[str],
    *,
    backend: LLMBackend,
    out_path: str | Path,
    project: str,
) -> list[str]:
    """Run scenarios and write their traces to ``out_path`` as an eval corpus.

    No server and no database: this is what lets CI evaluate the *current*
    agent on every PR instead of a corpus committed months ago.
    """
    ap = AgentProof(project=project, exporter=FileExporter(out_path))
    return _run_scenarios(scenario_keys, backend=backend, ap=ap)
