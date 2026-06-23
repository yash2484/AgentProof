"""
Trace and Span context managers — the user-facing instrumentation API.

Usage:
    ap = AgentProof(server_url="http://localhost:8000", project="my-agent")

    with ap.trace("research-task") as t:
        with t.span("retrieve", span_type=SpanType.RETRIEVAL) as s:
            results = retriever.search(query)
            s.record_retrieval(query=query, sources=results, top_k=5)

        with t.span("generate", span_type=SpanType.LLM_CALL) as s:
            response = llm.generate(prompt)
            s.record_llm_call(
                model="gpt-4o-mini",
                user_prompt=prompt,
                completion=response.content,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )

Design choices:
- Context managers are Pythonic, explicit, and composable.
- Nested spans auto-parent to the enclosing span (DAG topology) unless an
  explicit ``parent_span_ids`` is provided.
- Exceptions are NOT suppressed; the span records error status and re-raises.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from agentproof.pricing import compute_cost
from agentproof.spans import (
    AgentHandoffMetadata,
    HumanDecisionMetadata,
    LLMCallMetadata,
    RetrievalMetadata,
    Span,
    SpanMetadata,
    SpanStatus,
    SpanType,
    ToolUseMetadata,
    Trace,
)

if TYPE_CHECKING:  # pragma: no cover
    from agentproof.exporters import AsyncExporter


def _now() -> datetime:
    return datetime.now(UTC)


class SpanContext:
    """Context manager for a single span.

    Automatically records start/end time and latency. Provides convenience
    ``record_*`` methods for attaching type-specific metadata.
    """

    def __init__(
        self,
        name: str,
        span_type: SpanType,
        trace_id: str,
        parent_span_ids: list[str] | None = None,
        tags: dict[str, str] | None = None,
        _trace: TraceContext | None = None,
    ) -> None:
        self.span_id = str(uuid.uuid4())
        self._name = name
        self._span_type = span_type
        self._trace_id = trace_id
        self._parent_span_ids = list(parent_span_ids or [])
        self._tags = tags or {}
        self._trace = _trace

        self._metadata: SpanMetadata | None = None
        self._status = SpanStatus.OK
        self._error_message: str | None = None
        self._start_time: datetime | None = None
        self._start_perf: float | None = None
        self._end_time: datetime | None = None
        self._latency_ms: int | None = None

    def __enter__(self) -> SpanContext:
        self._start_time = _now()
        self._start_perf = time.perf_counter()
        if self._trace is not None:
            # Auto-parent to the enclosing span unless overridden explicitly.
            if not self._parent_span_ids and self._trace._span_stack:
                self._parent_span_ids = [self._trace._span_stack[-1]]
            self._trace._span_stack.append(self.span_id)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        self._end_time = _now()
        if self._start_perf is not None:
            self._latency_ms = int((time.perf_counter() - self._start_perf) * 1000)

        if exc_type is not None:
            self._status = SpanStatus.ERROR
            if self._error_message is None:
                self._error_message = str(exc_val)

        if self._trace is not None:
            # Pop our id off the stack (LIFO) so siblings parent correctly.
            # Guarded against the (single-threaded) impossible case where the
            # top isn't us; runs whether or not metadata was recorded.
            if self._trace._span_stack and self._trace._span_stack[-1] == self.span_id:
                self._trace._span_stack.pop()
            # Collect the span into the trace if metadata was recorded.
            if self._metadata is not None:
                self._trace._add_span(self.to_span())

        # Never suppress exceptions — let them propagate to the caller.
        return False

    # -- metadata recorders -------------------------------------------------

    def record_llm_call(
        self,
        model: str,
        user_prompt: str,
        completion: str,
        input_tokens: int,
        output_tokens: int,
        system_prompt: str | None = None,
        temperature: float | None = None,
        stop_reason: str | None = None,
        tool_calls: list[dict] | None = None,
        cost_usd: float | None = None,
    ) -> None:
        """Record metadata for an LLM call span. Cost is auto-computed."""
        if cost_usd is None:
            cost_usd = compute_cost(model, input_tokens, output_tokens)
        self._metadata = LLMCallMetadata(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            completion=completion,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            temperature=temperature,
            cost_usd=cost_usd,
            stop_reason=stop_reason,
            tool_calls=tool_calls,
        )

    def record_tool_use(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        tool_output: Any | None = None,
        success: bool = True,
        error_message: str | None = None,
        error_type: str | None = None,
    ) -> None:
        """Record metadata for a tool invocation span."""
        self._metadata = ToolUseMetadata(
            tool_name=tool_name,
            tool_input=tool_input,
            tool_output=tool_output,
            success=success,
            error_message=error_message,
            error_type=error_type,
        )

    def record_retrieval(
        self,
        query: str,
        sources: list[dict],
        top_k: int,
        num_results: int | None = None,
        retriever_name: str | None = None,
    ) -> None:
        """Record metadata for a retrieval/search span."""
        self._metadata = RetrievalMetadata(
            query=query,
            num_results=num_results if num_results is not None else len(sources),
            top_k=top_k,
            sources=sources,
            retriever_name=retriever_name,
        )

    def record_handoff(
        self,
        from_agent: str,
        to_agent: str,
        handoff_reason: str | None = None,
        payload_summary: str | None = None,
    ) -> None:
        """Record metadata for an agent handoff span."""
        self._metadata = AgentHandoffMetadata(
            from_agent=from_agent,
            to_agent=to_agent,
            handoff_reason=handoff_reason,
            payload_summary=payload_summary,
        )

    def record_human_decision(
        self,
        prompt_shown: str,
        decision_made: str,
        options_available: list[str] | None = None,
        decision_latency_ms: int | None = None,
    ) -> None:
        """Record metadata for a human-in-the-loop decision span."""
        self._metadata = HumanDecisionMetadata(
            prompt_shown=prompt_shown,
            decision_made=decision_made,
            options_available=options_available,
            decision_latency_ms=decision_latency_ms,
        )

    def set_tags(self, **tags: str) -> None:
        self._tags.update({k: str(v) for k, v in tags.items()})

    def set_error(self, message: str) -> None:
        """Mark this span as errored without raising an exception.

        Used by adapters that observe a node-level failure but must let the
        surrounding run complete (so the trace is still exported with an
        error span). ``__exit__`` only flips status to ERROR on a raised
        exception; this provides the non-raising path.
        """
        self._status = SpanStatus.ERROR
        self._error_message = message

    # -- conversion ---------------------------------------------------------

    def to_span(self) -> Span:
        """Build the immutable :class:`Span` for this context."""
        if self._metadata is None:
            raise ValueError(
                f"Span '{self._name}' has no metadata — call a record_* method "
                "before the span context exits."
            )
        return Span(
            span_id=self.span_id,
            trace_id=self._trace_id,
            parent_span_ids=self._parent_span_ids,
            span_type=self._span_type,
            name=self._name,
            start_time=self._start_time or _now(),
            end_time=self._end_time,
            latency_ms=self._latency_ms,
            status=self._status,
            error_message=self._error_message,
            metadata=self._metadata,
            tags=self._tags,
        )


class TraceContext:
    """Context manager that creates a new trace and exports it on exit."""

    def __init__(
        self,
        name: str,
        project: str,
        exporter: AsyncExporter,
        tags: dict[str, str] | None = None,
        trace_id: str | None = None,
    ) -> None:
        self.name = name
        self.project = project
        self.trace_id = trace_id or str(uuid.uuid4())
        self._exporter = exporter
        self._tags = tags or {}
        self._span_stack: list[str] = []
        self._spans: list[Span] = []

    def __enter__(self) -> TraceContext:
        return self

    def span(
        self,
        name: str,
        span_type: SpanType,
        parent_span_ids: list[str] | None = None,
        tags: dict[str, str] | None = None,
    ) -> SpanContext:
        """Create a child span context bound to this trace."""
        return SpanContext(
            name=name,
            span_type=span_type,
            trace_id=self.trace_id,
            parent_span_ids=parent_span_ids,
            tags=tags,
            _trace=self,
        )

    def _add_span(self, span: Span) -> None:
        self._spans.append(span)

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        trace = Trace(
            trace_id=self.trace_id,
            project=self.project,
            name=self.name,
            tags=self._tags,
        )
        if exc_type is not None:
            trace.tags = {**trace.tags, "error": str(exc_val)}
        for span in self._spans:
            trace.add_span(span)
        self._exporter.enqueue(trace)
        # Don't suppress exceptions raised inside the trace body.
        return False
