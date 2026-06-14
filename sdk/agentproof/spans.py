"""
Span and Trace data models for AgentProof.

Design decisions (you must be able to justify every one of these):

- 5 span types (not 1 generic) because eval metrics are type-specific:
  faithfulness only applies to llm_call, tool-scope only to tool_use.
- parent_span_ids is a LIST (not singular) to support DAG topology:
  when parallel branches merge, the merge span has multiple parents.
  A strict tree (one parent per span) cannot represent that.
- Metadata is a discriminated union (not a generic dict) so the eval
  engine can safely access type-specific fields without runtime checks.
  Pydantic's smart-union mode disambiguates by required-field set.
- All timestamps are timezone-aware datetimes, serialized to ISO strings
  for JSON transport simplicity.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, computed_field


class SpanType(str, Enum):
    """The 5 span types in AgentProof's taxonomy."""

    LLM_CALL = "llm_call"
    TOOL_USE = "tool_use"
    RETRIEVAL = "retrieval"
    AGENT_HANDOFF = "agent_handoff"
    HUMAN_DECISION = "human_decision"


class SpanStatus(str, Enum):
    OK = "ok"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Type-specific metadata models
# ---------------------------------------------------------------------------


class LLMCallMetadata(BaseModel):
    """Metadata captured for every LLM call span."""

    model: str  # e.g. "gpt-4o-mini", "claude-sonnet-4-20250514"
    system_prompt: str | None = None  # The system message, if any
    user_prompt: str  # The user/human message sent
    completion: str  # The model's full response
    input_tokens: int  # Prompt tokens
    output_tokens: int  # Completion tokens
    total_tokens: int  # Sum (redundant, avoids recomputation downstream)
    temperature: float | None = None
    cost_usd: float | None = None  # Computed from the pricing table
    stop_reason: str | None = None  # "end_turn", "max_tokens", "tool_use", ...
    tool_calls: list[dict] | None = None  # If the LLM invoked tools in this call

    @computed_field  # type: ignore[prop-decorator]
    @property
    def metadata_type(self) -> str:
        return "llm_call"


class ToolUseMetadata(BaseModel):
    """Metadata captured for every tool invocation span."""

    tool_name: str  # The tool's identifier
    tool_input: dict[str, Any]  # Arguments passed to the tool
    tool_output: Any | None = None  # What the tool returned
    success: bool = True  # Did the tool call succeed?
    error_message: str | None = None  # Error details if success=False
    error_type: str | None = None  # Exception class name

    @computed_field  # type: ignore[prop-decorator]
    @property
    def metadata_type(self) -> str:
        return "tool_use"


class RetrievalMetadata(BaseModel):
    """Metadata captured for every retrieval/search span."""

    query: str  # The search query
    num_results: int  # How many results were returned
    top_k: int  # How many were requested
    sources: list[dict[str, Any]]  # [{doc_id, chunk_id, score, text_preview}]
    retriever_name: str | None = None  # e.g. "chromadb", "pinecone"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def metadata_type(self) -> str:
        return "retrieval"


class AgentHandoffMetadata(BaseModel):
    """Metadata captured when one agent hands off to another."""

    from_agent: str  # Source agent identifier
    to_agent: str  # Target agent identifier
    handoff_reason: str | None = None  # Why the handoff occurred
    payload_summary: str | None = None  # Summary of data passed

    @computed_field  # type: ignore[prop-decorator]
    @property
    def metadata_type(self) -> str:
        return "agent_handoff"


class HumanDecisionMetadata(BaseModel):
    """Metadata captured for human-in-the-loop decision points."""

    prompt_shown: str  # What was shown to the human
    decision_made: str  # What the human decided
    options_available: list[str] | None = None
    decision_latency_ms: int | None = None  # How long the human took

    @computed_field  # type: ignore[prop-decorator]
    @property
    def metadata_type(self) -> str:
        return "human_decision"


# The discriminated union of all metadata types. Pydantic v2 smart-union
# mode disambiguates these because each has a distinct required-field set.
SpanMetadata = (
    LLMCallMetadata
    | ToolUseMetadata
    | RetrievalMetadata
    | AgentHandoffMetadata
    | HumanDecisionMetadata
)


# ---------------------------------------------------------------------------
# Span and Trace
# ---------------------------------------------------------------------------


class Span(BaseModel):
    """A single unit of work in a trace.

    A span can have MULTIPLE parents (parent_span_ids) to represent DAG
    merge/join points that a strict tree cannot model.
    """

    span_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trace_id: str
    parent_span_ids: list[str] = Field(default_factory=list)
    span_type: SpanType
    name: str
    start_time: datetime
    end_time: datetime | None = None
    latency_ms: int | None = None
    status: SpanStatus = SpanStatus.OK
    error_message: str | None = None
    metadata: SpanMetadata
    tags: dict[str, str] = Field(default_factory=dict)


class Trace(BaseModel):
    """A DAG of spans representing one agent run.

    Totals (latency / tokens / cost / status) are recomputed from the
    contained spans whenever a span is added via :meth:`add_span`.
    """

    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project: str
    name: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    total_latency_ms: int | None = None
    total_tokens: int | None = None
    total_cost_usd: float | None = None
    status: SpanStatus = SpanStatus.OK
    spans: list[Span] = Field(default_factory=list)
    tags: dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC)
    )

    def add_span(self, span: Span) -> None:
        """Append a span and recompute trace-level aggregates."""
        self.spans.append(span)
        self._recompute()

    def _recompute(self) -> None:
        if not self.spans:
            return

        # Wall-clock latency = (max end_time) - (min start_time).
        starts = [s.start_time for s in self.spans if s.start_time]
        ends = [s.end_time for s in self.spans if s.end_time]
        if starts:
            self.start_time = min(starts)
        if starts and ends:
            self.end_time = max(ends)
            wall_ms = int((max(ends) - min(starts)).total_seconds() * 1000)
            self.total_latency_ms = max(wall_ms, 0)
        else:
            # Fallback: sum per-span latencies when timestamps are missing.
            self.total_latency_ms = sum(
                s.latency_ms for s in self.spans if s.latency_ms
            )

        # Tokens and cost aggregate only over LLM call spans.
        total_tokens = 0
        total_cost = 0.0
        saw_tokens = False
        saw_cost = False
        for s in self.spans:
            if isinstance(s.metadata, LLMCallMetadata):
                total_tokens += s.metadata.total_tokens
                saw_tokens = True
                if s.metadata.cost_usd is not None:
                    total_cost += s.metadata.cost_usd
                    saw_cost = True
        self.total_tokens = total_tokens if saw_tokens else None
        self.total_cost_usd = round(total_cost, 6) if saw_cost else None

        # A trace is in error if any span errored.
        self.status = (
            SpanStatus.ERROR
            if any(s.status == SpanStatus.ERROR for s in self.spans)
            else SpanStatus.OK
        )
