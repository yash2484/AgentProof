"""
SQLAlchemy 2.0 declarative models for AgentProof.

Design notes:

- ``parent_span_ids`` on a span is a JSONB *list* of strings (not a single
  FK) so the span graph can be a DAG: a merge/join span may have multiple
  parents, which a strict tree cannot represent.
- The spans table has a JSONB ``metadata`` column. SQLAlchemy reserves the
  attribute name ``metadata`` on declarative classes (``Base.metadata`` is
  the MetaData registry), so the Python attribute is ``span_metadata`` while
  the underlying DB column is literally named ``"metadata"``.
- GIN indexes are added on the JSONB ``metadata``/``tags`` columns so they
  can be queried efficiently by key/value downstream.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all AgentProof ORM models."""

    pass


class Trace(Base):
    """One end-to-end agent run, aggregating a DAG of spans."""

    __tablename__ = "traces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    trace_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    project: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(256))
    start_time: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_time: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    spans: Mapped[list[Span]] = relationship(
        back_populates="trace",
        cascade="all, delete-orphan",
    )


class Span(Base):
    """A single unit of work within a trace; may have multiple parents."""

    __tablename__ = "spans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    span_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    trace_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("traces.trace_id", ondelete="CASCADE"),
        index=True,
    )
    parent_span_ids: Mapped[list] = mapped_column(JSONB, default=list)
    span_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(256))
    start_time: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NOTE: attribute is span_metadata; DB column is literally "metadata".
    span_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)

    trace: Mapped[Trace] = relationship(back_populates="spans")


class EvalResult(Base):
    """The outcome of a single evaluation metric on a trace or span."""

    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    trace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("traces.trace_id"), index=True
    )
    span_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metric_name: Mapped[str] = mapped_column(String(128), index=True)
    metric_type: Mapped[str] = mapped_column(String(32))
    score: Mapped[float] = mapped_column(Float)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_judge_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    baseline_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evaluated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Baseline(Base):
    """A pinned/recorded distribution of scores for regression detection."""

    __tablename__ = "baselines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    project: Mapped[str] = mapped_column(String(128), index=True)
    metric_name: Mapped[str] = mapped_column(String(128))
    scores: Mapped[dict] = mapped_column(JSONB)
    mean: Mapped[float] = mapped_column(Float)
    std: Mapped[float] = mapped_column(Float)
    sample_size: Mapped[int] = mapped_column(Integer)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Dataset(Base):
    """A versioned collection of test cases for offline evaluation."""

    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    name: Mapped[str] = mapped_column(String(256), unique=True)
    project: Mapped[str] = mapped_column(String(128))
    version: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_cases: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------------------------------------------------------------------------
# Supplementary indexes
# ---------------------------------------------------------------------------

# GIN indexes for efficient JSONB key/value queries.
Index("ix_spans_metadata_gin", Span.span_metadata, postgresql_using="gin")
Index("ix_spans_tags_gin", Span.tags, postgresql_using="gin")
Index("ix_traces_tags_gin", Trace.tags, postgresql_using="gin")

# Composite indexes for the most common listing queries.
Index("ix_traces_project_created", Trace.project, Trace.created_at.desc())
Index(
    "ix_eval_metric_evaluated",
    EvalResult.metric_name,
    EvalResult.evaluated_at.desc(),
)
