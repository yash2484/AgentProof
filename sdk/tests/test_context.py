"""Tests for the trace/span context managers."""

import time
from unittest.mock import patch

import pytest
from agentproof.client import AgentProof
from agentproof.context import SpanContext, TraceContext
from agentproof.spans import SpanStatus, SpanType


class MockExporter:
    """Captures traces instead of sending them."""

    def __init__(self):
        self.traces = []

    def enqueue(self, trace):
        self.traces.append(trace)


class TestSpanContext:
    def test_span_records_timing(self):
        ctx = SpanContext(
            name="test",
            span_type=SpanType.LLM_CALL,
            trace_id="t1",
            parent_span_ids=[],
        )
        with ctx:
            time.sleep(0.05)
            ctx.record_llm_call(
                model="gpt-4o-mini",
                user_prompt="hello",
                completion="hi",
                input_tokens=10,
                output_tokens=5,
            )

        span = ctx.to_span()
        assert span.start_time is not None
        assert span.end_time is not None
        assert span.latency_ms >= 40

    def test_cost_auto_computed(self):
        ctx = SpanContext("c", SpanType.LLM_CALL, "t1", [])
        with ctx:
            ctx.record_llm_call(
                model="gpt-4o-mini",
                user_prompt="q",
                completion="a",
                input_tokens=1_000_000,
                output_tokens=0,
            )
        assert ctx.to_span().metadata.cost_usd == 0.15

    def test_span_captures_exception(self):
        ctx = SpanContext(
            name="failing",
            span_type=SpanType.TOOL_USE,
            trace_id="t1",
            parent_span_ids=[],
        )
        with pytest.raises(ValueError), ctx:
            ctx.record_tool_use(
                tool_name="test",
                tool_input={},
                success=False,
                error_message="boom",
            )
            raise ValueError("tool failed")

        span = ctx.to_span()
        assert span.status == SpanStatus.ERROR
        assert "tool failed" in (span.error_message or "")

    def test_span_without_metadata_raises(self):
        ctx = SpanContext(
            name="empty",
            span_type=SpanType.LLM_CALL,
            trace_id="t1",
            parent_span_ids=[],
        )
        with ctx:
            pass  # No record_* call.
        with pytest.raises(ValueError, match="no metadata"):
            ctx.to_span()


class TestTraceContext:
    def test_trace_exports_on_exit(self):
        exporter = MockExporter()
        with TraceContext("test-run", "test-project", exporter) as t:
            with t.span("step1", SpanType.LLM_CALL) as s:
                s.record_llm_call(
                    model="gpt-4o-mini",
                    user_prompt="q",
                    completion="a",
                    input_tokens=10,
                    output_tokens=5,
                )

        assert len(exporter.traces) == 1
        trace = exporter.traces[0]
        assert trace.project == "test-project"
        assert len(trace.spans) == 1

    def test_auto_parenting(self):
        exporter = MockExporter()
        with TraceContext("test", "proj", exporter) as t:
            with t.span("parent", SpanType.AGENT_HANDOFF) as outer:
                outer.record_handoff(from_agent="a", to_agent="b")
                with t.span("child", SpanType.LLM_CALL) as inner:
                    inner.record_llm_call(
                        model="gpt-4o-mini",
                        user_prompt="q",
                        completion="a",
                        input_tokens=1,
                        output_tokens=1,
                    )

        trace = exporter.traces[0]
        child_span = next(s for s in trace.spans if s.name == "child")
        parent_span = next(s for s in trace.spans if s.name == "parent")
        assert parent_span.span_id in child_span.parent_span_ids

    def test_explicit_parent_override(self):
        exporter = MockExporter()
        with TraceContext("test", "proj", exporter) as t:
            with t.span("parent", SpanType.AGENT_HANDOFF) as outer:
                outer.record_handoff(from_agent="a", to_agent="b")
                with t.span(
                    "child", SpanType.LLM_CALL, parent_span_ids=["explicit-id"]
                ) as inner:
                    inner.record_llm_call(
                        model="gpt-4o-mini",
                        user_prompt="q",
                        completion="a",
                        input_tokens=1,
                        output_tokens=1,
                    )

        trace = exporter.traces[0]
        child_span = next(s for s in trace.spans if s.name == "child")
        assert child_span.parent_span_ids == ["explicit-id"]

    def test_error_span_collected(self):
        exporter = MockExporter()
        with pytest.raises(RuntimeError), TraceContext("test", "proj", exporter) as t:
            with t.span("boom", SpanType.TOOL_USE) as s:
                s.record_tool_use(tool_name="x", tool_input={}, success=False)
                raise RuntimeError("kaboom")

        trace = exporter.traces[0]
        assert len(trace.spans) == 1
        assert trace.spans[0].status == SpanStatus.ERROR


class _DummyExporter:
    """No-op exporter so AgentProof can be built without network/threads."""

    def __init__(self, *args, **kwargs):
        self.traces = []

    def enqueue(self, trace):
        self.traces.append(trace)

    def shutdown(self, *args, **kwargs):
        pass

    @property
    def stats(self):
        return {}


class TestTraceFunction:
    def _make_ap(self) -> AgentProof:
        with patch("agentproof.client.AsyncExporter", _DummyExporter):
            return AgentProof(server_url="http://unused", project="t")

    def test_decorator_without_span_param(self):
        ap = self._make_ap()

        @ap.trace_function(SpanType.TOOL_USE, name="adder")
        def add(a, b):
            return a + b

        assert add(2, 3) == 5  # Must not raise — no _span injected.
        assert ap._exporter.traces, "decorator should emit a trace"

    def test_decorator_with_span_param(self):
        ap = self._make_ap()

        @ap.trace_function(SpanType.TOOL_USE, name="search")
        def search(q, _span=None):
            if _span:
                _span.record_tool_use(
                    tool_name="search", tool_input={"q": q}, tool_output="r"
                )
            return "r"

        assert search("hi") == "r"
        trace = ap._exporter.traces[-1]
        assert trace.spans[0].metadata.tool_name == "search"

    def test_local_var_named_span_not_injected(self):
        # Regression: a function with a LOCAL variable named _span (not a
        # parameter) must NOT have _span injected as a kwarg.
        ap = self._make_ap()

        @ap.trace_function(SpanType.TOOL_USE, name="loc")
        def f(x):
            _span = x * 2  # local, not a parameter
            return _span

        assert f(21) == 42  # Would TypeError if _span were wrongly injected.
