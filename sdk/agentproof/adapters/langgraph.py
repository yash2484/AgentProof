"""
LangGraph auto-instrumentation adapter.

Wraps a compiled LangGraph so that each node execution becomes an AgentProof
span — without the user modifying their graph definition.

Usage:
    from agentproof import AgentProof
    from agentproof.adapters.langgraph import instrument_langgraph

    ap = AgentProof(server_url="http://localhost:8000", project="my-agent")
    graph = my_graph.compile()
    instrumented = instrument_langgraph(graph, ap)
    result = instrumented.invoke({"input": "hello"})

Design decisions:
- We wrap the compiled graph (not individual node functions), so the user's
  graph definition is untouched and conditional routing is preserved.
- We drive execution via ``stream(stream_mode=["updates", "values"])`` so we
  observe every node's output AND recover the true final state in ONE run
  (no double execution that would re-bill LLM calls).
- Span type is detected by inspecting each node's output: an AIMessage with
  usage metadata -> llm_call; a ToolMessage -> tool_use; LangChain Documents
  -> retrieval; otherwise agent_handoff.
- Nodes are chained parent->child in execution order, yielding a DAG that is
  exact for sequential graphs and a sensible approximation for parallel ones.
"""

from __future__ import annotations

import logging
from typing import Any

from agentproof.client import AgentProof
from agentproof.context import SpanContext
from agentproof.spans import SpanType

logger = logging.getLogger("agentproof.adapters.langgraph")


def _is_message_list(value: Any) -> bool:
    """Check whether a value looks like a list of LangChain messages."""
    if not isinstance(value, list) or len(value) == 0:
        return False
    first = value[0]
    return hasattr(first, "type") or hasattr(first, "content")


def _detect_span_type(output: Any) -> SpanType:
    """Inspect a LangGraph node's output to determine the span type."""
    if isinstance(output, dict):
        for value in output.values():
            if _is_message_list(value):
                for msg in value:
                    msg_type = getattr(msg, "type", None) or type(msg).__name__
                    if msg_type in ("ai", "AIMessage", "AIMessageChunk") and getattr(
                        msg, "usage_metadata", None
                    ):
                        return SpanType.LLM_CALL
                    if msg_type in ("tool", "ToolMessage"):
                        return SpanType.TOOL_USE
            # Retrieval pattern: a list of LangChain Documents.
            if isinstance(value, list) and value and hasattr(value[0], "page_content"):
                return SpanType.RETRIEVAL
    return SpanType.AGENT_HANDOFF


def _extract_llm_metadata(output: dict) -> dict | None:
    """Extract LLM-call metadata from a node output containing an AIMessage."""
    for value in output.values():
        if not _is_message_list(value):
            continue
        for msg in value:
            msg_type = getattr(msg, "type", None) or type(msg).__name__
            if msg_type in ("ai", "AIMessage", "AIMessageChunk"):
                usage = getattr(msg, "usage_metadata", None)
                if usage:
                    response_meta = getattr(msg, "response_metadata", {}) or {}
                    return {
                        "model": response_meta.get("model_name", "unknown"),
                        "completion": getattr(msg, "content", "") or "",
                        "input_tokens": _usage_get(usage, "input_tokens"),
                        "output_tokens": _usage_get(usage, "output_tokens"),
                    }
    return None


def _extract_tool_metadata(output: dict) -> dict | None:
    """Extract tool-use metadata from a node output containing a ToolMessage."""
    for value in output.values():
        if not _is_message_list(value):
            continue
        for msg in value:
            msg_type = getattr(msg, "type", None) or type(msg).__name__
            if msg_type in ("tool", "ToolMessage"):
                return {
                    "tool_name": getattr(msg, "name", "unknown") or "unknown",
                    "tool_output": getattr(msg, "content", "") or "",
                }
    return None


def _usage_get(usage: Any, key: str) -> int:
    """usage_metadata may be a dict or an object with attributes."""
    if isinstance(usage, dict):
        return int(usage.get(key, 0) or 0)
    return int(getattr(usage, key, 0) or 0)


def _record_from_output(
    span: SpanContext,
    span_type: SpanType,
    node_name: str,
    output: Any,
) -> None:
    """Attach best-effort metadata to a span based on the node output."""
    out = output if isinstance(output, dict) else {"value": output}

    if span_type == SpanType.LLM_CALL:
        meta = _extract_llm_metadata(out) or {}
        span.record_llm_call(
            model=meta.get("model", "unknown"),
            user_prompt=str(out)[:2000],
            completion=str(meta.get("completion", ""))[:4000],
            input_tokens=meta.get("input_tokens", 0),
            output_tokens=meta.get("output_tokens", 0),
        )
    elif span_type == SpanType.TOOL_USE:
        meta = _extract_tool_metadata(out) or {}
        span.record_tool_use(
            tool_name=meta.get("tool_name", node_name),
            tool_input={},
            tool_output=str(meta.get("tool_output", ""))[:4000],
        )
    elif span_type == SpanType.RETRIEVAL:
        sources = []
        for value in out.values():
            if isinstance(value, list) and value and hasattr(value[0], "page_content"):
                for doc in value:
                    sources.append(
                        {
                            "text_preview": (getattr(doc, "page_content", "") or "")[
                                :200
                            ],
                            "metadata": getattr(doc, "metadata", {}) or {},
                        }
                    )
        span.record_retrieval(query="", sources=sources, top_k=len(sources))
    else:  # AGENT_HANDOFF
        span.record_handoff(
            from_agent=node_name,
            to_agent="next",
            payload_summary=str(out)[:300],
        )


class InstrumentedGraph:
    """Wrapper around a compiled LangGraph that auto-creates AgentProof traces.

    The original graph is NOT modified — only invoke/stream are intercepted.
    """

    def __init__(
        self,
        graph: Any,
        ap: AgentProof,
        trace_name: str | None = None,
    ) -> None:
        self._graph = graph
        self._ap = ap
        self._trace_name = trace_name or "langgraph-run"

    def __getattr__(self, item: str) -> Any:
        # Transparently delegate everything we don't override.
        return getattr(self._graph, item)

    def invoke(
        self,
        input: Any,
        config: dict | None = None,
        trace_tags: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> Any:
        with self._ap.trace(self._trace_name, tags=trace_tags) as trace:
            return self._invoke_with_spans(trace, input, config, **kwargs)

    def _invoke_with_spans(
        self,
        trace: Any,
        input: Any,
        config: dict | None,
        **kwargs: Any,
    ) -> Any:
        final_state: Any = None
        prev_span_id: str | None = None

        # The graph executes exactly ONCE via this stream. We never re-invoke
        # on failure — that would re-run (and re-bill) every LLM call. Errors
        # in span *recording* are isolated per-node so instrumentation can
        # never crash the user's agent; errors from the graph itself propagate.
        stream = self._graph.stream(
            input,
            config=config,
            stream_mode=["updates", "values"],
            **kwargs,
        )
        for mode, chunk in stream:
            if mode == "values":
                final_state = chunk
                continue
            # mode == "updates": {node_name: state_update}
            if not isinstance(chunk, dict):
                continue
            for node_name, update in chunk.items():
                try:
                    span_type = _detect_span_type(update)
                    span = trace.span(
                        node_name,
                        span_type,
                        parent_span_ids=[prev_span_id] if prev_span_id else None,
                    )
                    with span:
                        _record_from_output(span, span_type, node_name, update)
                    prev_span_id = span.span_id
                except Exception:  # noqa: BLE001 - tracing must never break the agent
                    logger.exception(
                        "Failed to record span for node '%s'; skipping.", node_name
                    )

        return final_state


def instrument_langgraph(
    graph: Any,
    ap: AgentProof,
    trace_name: str | None = None,
) -> InstrumentedGraph:
    """Return an instrumented wrapper around a compiled LangGraph.

    The original ``graph`` is left untouched.
    """
    return InstrumentedGraph(graph, ap, trace_name=trace_name)
