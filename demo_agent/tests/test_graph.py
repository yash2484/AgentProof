from agentproof import AgentProof
from agentproof.spans import SpanStatus, SpanType

from demo_agent.graph import build_graph, run_instrumented
from demo_agent.llm import ReplayBackend
from demo_agent.scenarios import SCENARIOS


def _trace_for(scenario_key):
    ap = AgentProof(server_url="http://localhost:8000", project="test-demo")
    captured = {}
    orig = ap._exporter.enqueue
    ap._exporter.enqueue = lambda tr: captured.setdefault("trace", tr) or orig(tr)
    state, trace_id = run_instrumented(
        ReplayBackend(), ap, SCENARIOS[scenario_key].initial_state()
    )
    return state, captured["trace"], trace_id


def test_success_trace_has_expected_span_types_in_order():
    _, trace, _ = _trace_for("success")
    types = [s.span_type for s in trace.spans]
    assert types == [
        SpanType.LLM_CALL,     # planner
        SpanType.RETRIEVAL,    # retriever
        SpanType.LLM_CALL,     # writer
        SpanType.LLM_CALL,     # fact_checker
    ]
    assert trace.status == SpanStatus.OK


def test_error_scenario_short_circuits_with_error_span():
    _, trace, _ = _trace_for("error")
    types = [s.span_type for s in trace.spans]
    assert types == [SpanType.LLM_CALL, SpanType.TOOL_USE]  # planner, failed retriever
    assert trace.status == SpanStatus.ERROR
    assert trace.spans[-1].error_message == "HTTP 503 from search provider"


def test_injection_trace_carries_injection_in_writer_prompt():
    _, trace, _ = _trace_for("injection")
    writer_spans = [
        s for s in trace.spans
        if s.span_type == SpanType.LLM_CALL and "Context:" in s.metadata.user_prompt
    ]
    assert any(
        "Ignore all previous instructions" in s.metadata.user_prompt
        for s in writer_spans
    )


def test_run_instrumented_returns_trace_id():
    _, _, trace_id = _trace_for("success")
    assert isinstance(trace_id, str) and trace_id
