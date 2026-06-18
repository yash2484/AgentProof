# server/tests/unit/test_seed_demo_traces.py
"""Unit tests for the demo-trace builder (no network)."""

from __future__ import annotations

from agentproof_server.scripts_pkg.seed_demo_traces import build_demo_traces


def test_builds_three_traces():
    traces = build_demo_traces()
    assert len(traces) == 3


def test_each_trace_has_required_fields_and_spans():
    for trace in build_demo_traces():
        assert trace["trace_id"]
        assert trace["project"]
        assert trace["spans"]
        for span in trace["spans"]:
            assert span["span_id"]
            assert span["span_type"]
            assert span["start_time"]


def test_clean_rag_has_grounded_llm_completion():
    clean = build_demo_traces()[0]
    retrieval = next(s for s in clean["spans"] if s["span_type"] == "retrieval")
    llm = next(s for s in clean["spans"] if s["span_type"] == "llm_call")
    source_text = retrieval["metadata"]["sources"][0]["text_preview"]
    assert llm["metadata"]["completion"]
    # clean RAG completion should be grounded in the retrieved source
    assert "330 metres" in source_text and "330 metres" in llm["metadata"]["completion"]


def test_tool_trace_contains_tool_use_span():
    tool_trace = build_demo_traces()[2]
    assert any(s["span_type"] == "tool_use" for s in tool_trace["spans"])


def test_span_ids_unique_across_calls():
    first = {s["span_id"] for t in build_demo_traces() for s in t["spans"]}
    second = {s["span_id"] for t in build_demo_traces() for s in t["spans"]}
    assert first.isdisjoint(second)


def test_build_security_demo_traces_has_two():
    from agentproof_server.scripts_pkg.seed_demo_traces import (
        build_security_demo_traces,
    )

    traces = build_security_demo_traces()
    assert len(traces) == 2


def test_injection_trace_has_signature_and_compliance():
    from agentproof_server.scripts_pkg.seed_demo_traces import (
        build_security_demo_traces,
    )

    injection = build_security_demo_traces()[0]
    retrieval = next(s for s in injection["spans"] if s["span_type"] == "retrieval")
    llm = next(s for s in injection["spans"] if s["span_type"] == "llm_call")
    src = retrieval["metadata"]["sources"][0]["text_preview"].lower()
    assert "ignore" in src and "instructions" in src
    assert "system prompt" in llm["metadata"]["completion"].lower()


def test_leak_trace_contains_sensitive_data():
    from agentproof_server.scripts_pkg.seed_demo_traces import (
        build_security_demo_traces,
    )

    leak = build_security_demo_traces()[1]
    llm = next(s for s in leak["spans"] if s["span_type"] == "llm_call")
    assert "@" in llm["metadata"]["completion"]  # an email leak
