# server/agentproof_server/api/serialization.py
"""
Shared trace/span (de)serialization helpers.

Extracted from ``api/traces.py`` so the evals API can reuse the identical
trace-dict shape. ``_insert_trace`` maps the incoming span ``metadata`` key
onto the ``span_metadata`` ORM attribute (DB column ``"metadata"``).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.db.models import Span as SpanModel
from agentproof_server.db.models import Trace as TraceModel


def _parse_dt(value: str | None) -> datetime | None:
    """Parse an ISO 8601 timestamp string, tolerating ``None``."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


def _insert_trace(session: AsyncSession, trace_dict: dict) -> TraceModel:
    """Build and add a TraceModel (plus its SpanModel rows) to the session."""
    if not trace_dict.get("trace_id") or not trace_dict.get("project"):
        raise HTTPException(
            status_code=400, detail="Trace requires 'trace_id' and 'project'."
        )

    trace = TraceModel(
        trace_id=trace_dict["trace_id"],
        project=trace_dict["project"],
        name=trace_dict.get("name", ""),
        start_time=_parse_dt(trace_dict.get("start_time")),
        end_time=_parse_dt(trace_dict.get("end_time")),
        total_latency_ms=trace_dict.get("total_latency_ms"),
        total_tokens=trace_dict.get("total_tokens"),
        total_cost_usd=trace_dict.get("total_cost_usd"),
        status=trace_dict.get("status", "ok"),
        tags=trace_dict.get("tags") or {},
    )
    if trace_dict.get("created_at") is not None:
        trace.created_at = _parse_dt(trace_dict["created_at"])

    for span_dict in trace_dict.get("spans") or []:
        if not span_dict.get("span_id") or not span_dict.get("span_type"):
            raise HTTPException(
                status_code=400,
                detail="Each span requires 'span_id' and 'span_type'.",
            )
        if span_dict.get("start_time") is None:
            raise HTTPException(
                status_code=400, detail="Each span requires a 'start_time'."
            )
        trace.spans.append(
            SpanModel(
                span_id=span_dict["span_id"],
                trace_id=span_dict.get("trace_id", trace_dict["trace_id"]),
                parent_span_ids=span_dict.get("parent_span_ids") or [],
                span_type=span_dict.get("span_type", ""),
                name=span_dict.get("name", ""),
                start_time=_parse_dt(span_dict.get("start_time")),
                end_time=_parse_dt(span_dict.get("end_time")),
                latency_ms=span_dict.get("latency_ms"),
                status=span_dict.get("status", "ok"),
                error_message=span_dict.get("error_message"),
                span_metadata=span_dict.get("metadata") or {},
                tags=span_dict.get("tags") or {},
            )
        )

    session.add(trace)
    return trace


def _span_to_dict(span: SpanModel) -> dict[str, Any]:
    """Serialize a SpanModel ORM row to a JSON-friendly dict."""
    return {
        "span_id": span.span_id,
        "trace_id": span.trace_id,
        "parent_span_ids": span.parent_span_ids or [],
        "span_type": span.span_type,
        "name": span.name,
        "start_time": span.start_time.isoformat() if span.start_time else None,
        "end_time": span.end_time.isoformat() if span.end_time else None,
        "latency_ms": span.latency_ms,
        "status": span.status,
        "error_message": span.error_message,
        "metadata": span.span_metadata or {},
        "tags": span.tags or {},
    }


def _trace_to_dict(trace: TraceModel) -> dict[str, Any]:
    """Serialize a TraceModel ORM row to a JSON-friendly dict (no spans)."""
    return {
        "trace_id": trace.trace_id,
        "project": trace.project,
        "name": trace.name,
        "start_time": trace.start_time.isoformat() if trace.start_time else None,
        "end_time": trace.end_time.isoformat() if trace.end_time else None,
        "total_latency_ms": trace.total_latency_ms,
        "total_tokens": trace.total_tokens,
        "total_cost_usd": trace.total_cost_usd,
        "status": trace.status,
        "tags": trace.tags or {},
        "created_at": trace.created_at.isoformat() if trace.created_at else None,
    }
