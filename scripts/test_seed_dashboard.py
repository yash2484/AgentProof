from scripts.seed_dashboard import build_sample_traces


def test_builds_multiple_traces_with_spans():
    traces = build_sample_traces()
    assert len(traces) >= 2
    for tr in traces:
        assert tr["trace_id"]
        assert tr["spans"], "each trace has spans"


def test_includes_an_error_span():
    traces = build_sample_traces()
    statuses = [s["status"] for tr in traces for s in tr["spans"]]
    assert "error" in statuses


def test_includes_varied_span_types():
    traces = build_sample_traces()
    span_types = {s["span_type"] for tr in traces for s in tr["spans"]}
    assert {"llm_call", "tool_use"} <= span_types
