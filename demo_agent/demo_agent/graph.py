"""Build and instrument the research-assistant LangGraph graph.

Note: StateGraph(dict) in langgraph >=1.2 does NOT accumulate state across
nodes — each node receives only the prior node's update dict. ResearchState
(a TypedDict) is used instead so that the full state is merged (last-writer-
wins) and every node has access to all prior fields (question, scenario, etc.).
This is the minimal deviation described in the task-7 risk note.
"""

from __future__ import annotations

from functools import partial
from typing import Any

from typing_extensions import TypedDict

from agentproof import AgentProof
from agentproof.adapters.langgraph import instrument_langgraph
from langgraph.graph import END, START, StateGraph

from demo_agent.llm import LLMBackend
from demo_agent.nodes import (
    fact_checker_node,
    planner_node,
    retriever_node,
    writer_node,
)


class ResearchState(TypedDict, total=False):
    question: str
    scenario: str
    subqueries: list
    documents: list
    draft: str
    verdict: str
    error: bool
    agentproof_meta: dict


def route_after_retriever(state: dict) -> str:
    """Skip writing/fact-checking if retrieval failed."""
    return "END" if state.get("error") else "writer"


def build_graph(backend: LLMBackend):
    """Compile the planner -> retriever -> (writer -> fact_checker | END) graph."""
    g: StateGraph = StateGraph(ResearchState)
    g.add_node("planner", partial(planner_node, backend=backend))
    g.add_node("retriever", partial(retriever_node, backend=backend))
    g.add_node("writer", partial(writer_node, backend=backend))
    g.add_node("fact_checker", partial(fact_checker_node, backend=backend))

    g.add_edge(START, "planner")
    g.add_edge("planner", "retriever")
    g.add_conditional_edges(
        "retriever", route_after_retriever, {"writer": "writer", "END": END}
    )
    g.add_edge("writer", "fact_checker")
    g.add_edge("fact_checker", END)
    return g.compile()


def run_instrumented(
    backend: LLMBackend,
    ap: AgentProof,
    initial_state: dict,
    trace_name: str = "research-assistant",
) -> tuple[Any, str]:
    """Run one scenario through the instrumented graph; return (state, trace_id)."""
    graph = build_graph(backend)
    instrumented = instrument_langgraph(graph, ap, trace_name=trace_name)
    final_state = instrumented.invoke(initial_state)
    return final_state, instrumented.last_trace_id
