"""Unit tests for the SDK span/trace models."""

from datetime import UTC, datetime

from agentproof.pricing import compute_cost
from agentproof.spans import (
    LLMCallMetadata,
    RetrievalMetadata,
    Span,
    SpanStatus,
    SpanType,
    ToolUseMetadata,
    Trace,
)


def _now() -> str:
    return datetime.now(UTC).isoformat()


class TestSpanModels:
    def test_llm_call_span_roundtrip(self):
        span = Span(
            span_id="test-001",
            trace_id="trace-001",
            parent_span_ids=[],
            span_type=SpanType.LLM_CALL,
            name="test_llm",
            start_time=_now(),
            latency_ms=500,
            metadata=LLMCallMetadata(
                model="gpt-4o-mini",
                user_prompt="Hello",
                completion="Hi there!",
                input_tokens=10,
                output_tokens=5,
                total_tokens=15,
            ),
        )
        data = span.model_dump(mode="json")
        assert data["span_type"] == "llm_call"
        assert data["metadata"]["model"] == "gpt-4o-mini"
        assert data["metadata"]["total_tokens"] == 15
        # The type tag is serialized for downstream consumers.
        assert data["metadata"]["metadata_type"] == "llm_call"

        restored = Span.model_validate(data)
        assert restored.span_id == "test-001"
        assert isinstance(restored.metadata, LLMCallMetadata)

    def test_tool_use_span(self):
        span = Span(
            span_id="test-002",
            trace_id="trace-001",
            span_type=SpanType.TOOL_USE,
            name="web_search",
            start_time=_now(),
            metadata=ToolUseMetadata(
                tool_name="web_search",
                tool_input={"query": "test"},
                tool_output={"results": []},
                success=True,
            ),
        )
        data = span.model_dump(mode="json")
        assert data["metadata"]["tool_name"] == "web_search"
        assert isinstance(Span.model_validate(data).metadata, ToolUseMetadata)

    def test_retrieval_span(self):
        span = Span(
            span_id="test-003",
            trace_id="trace-001",
            span_type=SpanType.RETRIEVAL,
            name="chromadb_search",
            start_time=_now(),
            metadata=RetrievalMetadata(
                query="test query",
                num_results=3,
                top_k=5,
                sources=[{"doc_id": "d1", "score": 0.9, "text_preview": "sample"}],
            ),
        )
        assert span.metadata.num_results == 3
        assert isinstance(
            Span.model_validate(span.model_dump(mode="json")).metadata,
            RetrievalMetadata,
        )

    def test_dag_multi_parent(self):
        span = Span(
            span_id="merge-001",
            trace_id="trace-001",
            parent_span_ids=["branch-a", "branch-b"],
            span_type=SpanType.LLM_CALL,
            name="merge_results",
            start_time=_now(),
            metadata=LLMCallMetadata(
                model="gpt-4o-mini",
                user_prompt="Combine results",
                completion="Combined output",
                input_tokens=100,
                output_tokens=50,
                total_tokens=150,
            ),
        )
        assert len(span.parent_span_ids) == 2
        assert "branch-a" in span.parent_span_ids


class TestTrace:
    def test_trace_aggregate_recomputation(self):
        trace = Trace(trace_id="trace-001", project="test", name="test-run")
        trace.add_span(
            Span(
                span_id="s1",
                trace_id="trace-001",
                span_type=SpanType.LLM_CALL,
                name="call1",
                start_time="2026-01-01T00:00:00+00:00",
                end_time="2026-01-01T00:00:01+00:00",
                latency_ms=1000,
                metadata=LLMCallMetadata(
                    model="gpt-4o-mini",
                    user_prompt="q",
                    completion="a",
                    input_tokens=100,
                    output_tokens=50,
                    total_tokens=150,
                    cost_usd=0.0001,
                ),
            )
        )
        assert trace.total_latency_ms == 1000
        assert trace.total_tokens == 150
        assert trace.total_cost_usd == 0.0001
        assert trace.status == SpanStatus.OK

    def test_trace_status_error_when_any_span_errors(self):
        trace = Trace(trace_id="t2", project="test", name="run")
        trace.add_span(
            Span(
                span_id="s1",
                trace_id="t2",
                span_type=SpanType.TOOL_USE,
                name="boom",
                start_time="2026-01-01T00:00:00+00:00",
                end_time="2026-01-01T00:00:00+00:00",
                status=SpanStatus.ERROR,
                metadata=ToolUseMetadata(
                    tool_name="x", tool_input={}, success=False, error_message="boom"
                ),
            )
        )
        assert trace.status == SpanStatus.ERROR


class TestPricing:
    def test_known_model(self):
        # gpt-4o-mini: $0.15 in / $0.60 out per 1M tokens.
        cost = compute_cost("gpt-4o-mini", 1_000_000, 1_000_000)
        assert cost == round(0.15 + 0.60, 6)

    def test_prefix_match(self):
        assert compute_cost("gpt-4o-mini-2024-07-18", 1000, 0) is not None

    def test_longest_prefix_wins(self):
        # A novel gpt-4o-mini variant must price as gpt-4o-mini (0.15 in),
        # NOT as the shorter, pricier gpt-4o (2.50 in).
        cost = compute_cost("gpt-4o-mini-2099-future", 1_000_000, 0)
        assert cost == 0.15

    def test_unknown_model_returns_none(self):
        assert compute_cost("totally-made-up-model", 100, 100) is None
