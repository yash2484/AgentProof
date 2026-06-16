"""
Trace-storage API.

Endpoints for ingesting traces (single + batch) from the SDK exporter and
querying them back, including the full span DAG rendered as a nested tree.

The incoming JSON uses the key ``metadata`` for a span's type-specific
payload; this maps to the ``span_metadata`` ORM attribute / the literal
``"metadata"`` DB column.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.api.serialization import (
    _insert_trace,
    _span_to_dict,
    _trace_to_dict,
)
from agentproof_server.db.models import Span as SpanModel
from agentproof_server.db.models import Trace as TraceModel
from agentproof_server.db.session import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/traces/batch")
async def ingest_traces_batch(
    traces: list[dict],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ingest a batch of traces.

    Traces whose ``trace_id`` already exists are skipped (idempotent).
    Returns counts of accepted (newly inserted) and skipped traces.
    """
    accepted = 0
    skipped = 0
    for trace_dict in traces:
        trace_id = trace_dict.get("trace_id")
        existing = await db.execute(
            select(TraceModel.id).where(TraceModel.trace_id == trace_id)
        )
        if existing.scalar_one_or_none() is not None:
            skipped += 1
            continue
        # SAVEPOINT so a concurrent insert that wins the unique-constraint
        # race rolls back just this trace (not the whole batch) and is
        # counted as skipped — keeps batch ingestion idempotent under retries.
        try:
            async with db.begin_nested():
                _insert_trace(db, trace_dict)
                await db.flush()
            accepted += 1
        except IntegrityError:
            skipped += 1
    return {"accepted": accepted, "skipped": skipped}


@router.post("/traces")
async def ingest_trace(
    trace_dict: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ingest a single trace and return the created trace (without spans)."""
    trace = _insert_trace(db, trace_dict)
    await db.flush()
    await db.refresh(trace)
    return _trace_to_dict(trace)


@router.get("/traces")
async def list_traces(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    status: str | None = None,
    start_after: datetime | None = None,
    start_before: datetime | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """List traces (without spans), newest first, with optional filters."""
    filters = []
    if project is not None:
        filters.append(TraceModel.project == project)
    if status is not None:
        filters.append(TraceModel.status == status)
    if start_after is not None:
        filters.append(TraceModel.start_time >= start_after)
    if start_before is not None:
        filters.append(TraceModel.start_time <= start_before)

    count_stmt = select(func.count()).select_from(TraceModel)
    for f in filters:
        count_stmt = count_stmt.where(f)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = select(TraceModel)
    for f in filters:
        stmt = stmt.where(f)
    stmt = stmt.order_by(TraceModel.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "traces": [_trace_to_dict(t) for t in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Fetch a single trace with its spans (ordered by start_time ASC)."""
    trace = (
        await db.execute(
            select(TraceModel).where(TraceModel.trace_id == trace_id)
        )
    ).scalar_one_or_none()
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    spans = (
        await db.execute(
            select(SpanModel)
            .where(SpanModel.trace_id == trace_id)
            .order_by(SpanModel.start_time.asc())
        )
    ).scalars().all()

    result = _trace_to_dict(trace)
    result["spans"] = [_span_to_dict(s) for s in spans]
    return result


@router.get("/traces/{trace_id}/tree")
async def get_trace_tree(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return the span DAG as a nested tree of root nodes with children.

    Root nodes are spans with no parents. Each node is the span dict plus a
    ``children`` list. Because the graph is a DAG, a span reachable from
    multiple parents appears under each of them.
    """
    trace = (
        await db.execute(
            select(TraceModel.id).where(TraceModel.trace_id == trace_id)
        )
    ).scalar_one_or_none()
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    spans = (
        await db.execute(
            select(SpanModel)
            .where(SpanModel.trace_id == trace_id)
            .order_by(SpanModel.start_time.asc())
        )
    ).scalars().all()

    # Build child lists keyed by parent span_id.
    children_by_parent: dict[str, list[SpanModel]] = {}
    roots: list[SpanModel] = []
    for span in spans:
        parents = span.parent_span_ids or []
        if not parents:
            roots.append(span)
        for parent_id in parents:
            children_by_parent.setdefault(parent_id, []).append(span)

    def build(span: SpanModel, visited: frozenset[str]) -> dict[str, Any]:
        # Guard against malformed cyclic parent_span_ids (JSONB is unconstrained)
        # so a bad payload can't trigger unbounded recursion.
        if span.span_id in visited:
            return {**_span_to_dict(span), "children": [], "cycle": True}
        visited = visited | {span.span_id}
        node = _span_to_dict(span)
        node["children"] = [
            build(child, visited)
            for child in children_by_parent.get(span.span_id, [])
        ]
        return node

    return [build(root, frozenset()) for root in roots]


@router.delete("/traces/{trace_id}", status_code=204)
async def delete_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a trace and its spans (cascade). 404 if it does not exist."""
    existing = (
        await db.execute(
            select(TraceModel.id).where(TraceModel.trace_id == trace_id)
        )
    ).scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    await db.execute(
        delete(TraceModel).where(TraceModel.trace_id == trace_id)
    )
