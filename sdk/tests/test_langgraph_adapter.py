from agentproof import AgentProof
from agentproof.adapters.langgraph import instrument_langgraph
from agentproof.spans import SpanStatus, SpanType


class FakeGraph:
    """Minimal stand-in for a compiled LangGraph: yields (mode, chunk) pairs."""

    def __init__(self, updates):
        # updates: list of {node_name: update_dict}
        self._updates = updates

    def stream(self, input, config=None, stream_mode=None, **kwargs):
        for upd in self._updates:
            yield "updates", upd
        # final "values" frame = merged state (not asserted here)
        yield "values", {"done": True}


def _run(updates):
    ap = AgentProof(server_url="http://localhost:8000", project="t")
    captured = {}
    # Capture the Trace object the adapter builds by wrapping enqueue.
    orig = ap._exporter.enqueue
    ap._exporter.enqueue = lambda tr: captured.setdefault("trace", tr) or orig(tr)
    inst = instrument_langgraph(FakeGraph(updates), ap, trace_name="run")
    inst.invoke({"input": "x"})
    return inst, captured["trace"]


def test_agentproof_meta_llm_call_builds_clean_llm_span():
    updates = [{"writer": {"draft": "ans", "agentproof_meta": {
        "span_type": "llm_call", "model": "claude-sonnet-4-6",
        "system_prompt": "sys", "user_prompt": "q", "completion": "ans",
        "input_tokens": 10, "output_tokens": 20,
    }}}]
    _, trace = _run(updates)
    span = trace.spans[-1]
    assert span.span_type == SpanType.LLM_CALL
    assert span.metadata.user_prompt == "q"
    assert span.metadata.completion == "ans"
    assert span.metadata.model == "claude-sonnet-4-6"
    assert span.metadata.total_tokens == 30


def test_agentproof_meta_retrieval_builds_retrieval_span():
    sources = [{"doc_id": "d1", "text_preview": "abc", "score": 0.9}]
    updates = [{"retriever": {"documents": sources, "agentproof_meta": {
        "span_type": "retrieval", "query": "q", "sources": sources, "top_k": 3,
    }}}]
    _, trace = _run(updates)
    span = trace.spans[-1]
    assert span.span_type == SpanType.RETRIEVAL
    assert span.metadata.query == "q"
    assert span.metadata.sources == sources


def test_agentproof_meta_error_marks_span_and_trace_error():
    updates = [{"retriever": {"error": True, "agentproof_meta": {
        "span_type": "tool_use", "tool_name": "web_search",
        "tool_input": {"q": "x"}, "status": "error",
        "error_message": "HTTP 503 from search provider",
    }}}]
    _, trace = _run(updates)
    span = trace.spans[-1]
    assert span.span_type == SpanType.TOOL_USE
    assert span.status == SpanStatus.ERROR
    assert span.error_message == "HTTP 503 from search provider"
    assert trace.status == SpanStatus.ERROR


def test_trace_ids_captured():
    updates = [{"writer": {"agentproof_meta": {
        "span_type": "llm_call", "model": "m", "user_prompt": "q",
        "completion": "a", "input_tokens": 1, "output_tokens": 1,
    }}}]
    inst, trace = _run(updates)
    assert inst.last_trace_id == trace.trace_id
    assert inst.trace_ids == [trace.trace_id]


def test_node_without_meta_falls_back_to_autodetect():
    # No agentproof_meta -> existing behavior: a plain dict -> agent_handoff.
    updates = [{"planner": {"plan": "do x"}}]
    _, trace = _run(updates)
    span = trace.spans[-1]
    assert span.span_type == SpanType.AGENT_HANDOFF
