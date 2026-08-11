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

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.api.serialization import (
    _insert_trace,
    _span_to_dict,
    _trace_to_dict,
)
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Span as SpanModel
from agentproof_server.db.models import Trace as TraceModel
from agentproof_server.db.session import get_db
from agentproof_server.provenance import exclude_generated_filter, is_generated

router = APIRouter()


# ---------------------------------------------------------------------------
# Eval outcome per trace
# ---------------------------------------------------------------------------
#
# The grid's job is to make a list of traces scannable, and "did anything fail
# here" is the question it exists to answer. Fetching that per row would be an
# N+1 over a 200-row page, so it arrives as one aggregate keyed by trace_id.
#
# Filtering is a separate concern: it has to happen in the database or paging
# returns short pages and a wrong total, so the filter uses a subquery joined
# into the main query rather than trimming the page after the fact.


def _degraded():
    """Mirrors ``analytics._degraded_expr``: a broken judge call, at any depth."""
    from sqlalchemy import false, literal_column, or_

    return func.coalesce(
        or_(
            func.jsonb_path_exists(
                EvalResultModel.details, literal_column("'$.**.per_span[*].error'")
            ),
            func.jsonb_path_exists(
                EvalResultModel.details, literal_column("'$.**.per_span[*].refusal'")
            ),
        ),
        false(),
    )


def _outcome_subquery():
    """Per-trace counts, for filtering and joining."""
    from sqlalchemy import case

    degraded = _degraded()
    scored = ~degraded
    return (
        select(
            EvalResultModel.trace_id.label("trace_id"),
            func.sum(case((scored, 1), else_=0)).label("total"),
            func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
                "failed"
            ),
            func.sum(case((degraded, 1), else_=0)).label("degraded"),
        )
        .group_by(EvalResultModel.trace_id)
        .subquery()
    )


def _trace_outcomes_stmt(trace_ids: list[str]):
    """Outcome detail for one page of traces. ``None`` when the page is empty.

    ``array_agg`` ordered by score carries the worst metric's *name* out of
    SQL alongside the counts — naming the lowest-scoring metric is what makes
    the grid scannable, and a second query per row to find it would be the
    N+1 this avoids.
    """
    if not trace_ids:
        return None

    from sqlalchemy import case
    from sqlalchemy.dialects.postgresql import aggregate_order_by

    degraded = _degraded()
    scored = ~degraded
    return (
        select(
            EvalResultModel.trace_id,
            func.sum(case((scored, 1), else_=0)).label("total"),
            func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
                "failed"
            ),
            func.sum(case((degraded, 1), else_=0)).label("degraded"),
            func.min(case((scored, EvalResultModel.score))).label("worst_score"),
            func.array_agg(
                aggregate_order_by(
                    EvalResultModel.metric_name, EvalResultModel.score.asc()
                )
            ).label("by_score"),
        )
        .where(EvalResultModel.trace_id.in_(trace_ids))
        .group_by(EvalResultModel.trace_id)
    )


def _outcome_payload(row: tuple | None) -> dict:
    """Shape one trace's outcome.

    ``outcome`` is the single word the grid sorts and filters on, and its
    order is the Overview's severity rule: a failure outranks a broken
    measurement, because a degraded row must never mask a real finding. A
    trace with only broken measurements is *degraded*, not *not_evaluated* —
    something ran and it broke, which is a different fact from nobody trying.
    """
    if row is None:
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "degraded": 0,
            "worst_metric": None,
            "worst_score": None,
            "outcome": "not_evaluated",
        }

    total, failed, degraded, worst_score, by_score = row
    total = int(total or 0)
    failed = int(failed or 0)
    degraded = int(degraded or 0)

    if failed > 0:
        outcome = "failed"
    elif degraded > 0:
        outcome = "degraded"
    elif total > 0:
        outcome = "passed"
    else:
        outcome = "not_evaluated"

    return {
        "total": total,
        "passed": total - failed,
        "failed": failed,
        "degraded": degraded,
        "worst_metric": (by_score or [None])[0],
        "worst_score": float(worst_score) if worst_score is not None else None,
        "outcome": outcome,
    }


def _outcome_filters_for(sub) -> dict:
    """Predicate per filter name, bound to the subquery actually joined.

    Takes the subquery rather than building its own: a predicate referencing a
    different instance of the same subquery would leave it unjoined and
    silently produce a cross product.
    """
    return {
        "failed": sub.c.failed > 0,
        "passed": (sub.c.failed == 0) & (sub.c.degraded == 0) & (sub.c.total > 0),
        "degraded": (sub.c.degraded > 0) & (sub.c.failed == 0),
        "not_evaluated": sub.c.trace_id.is_(None),
    }


# The questions this page exists to answer. Used to validate the query
# parameter; the endpoint rebuilds the predicates against its own subquery.
OUTCOME_FILTERS = _outcome_filters_for(_outcome_subquery())


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


def _projects_stmt():
    """Every project that has traces, with its size.

    Deliberately *not* filtered by provenance. The switcher is a navigation
    surface: hiding a corpus there would make it unreachable, which is the
    opposite of the goal — the rule is that a generated corpus must never be
    *pooled* into an unlabelled figure, not that it must be hidden. Excluding
    it here was a real regression: deriving the project list from an unscoped
    trace query made the generated corpus disappear from the switcher the
    moment aggregates started excluding it.
    """
    return (
        select(
            TraceModel.project.label("project"),
            func.count().label("traces"),
        )
        .group_by(TraceModel.project)
        .order_by(TraceModel.project.asc())
    )


@router.get("/projects")
async def list_projects(db: AsyncSession = Depends(get_db)) -> dict:
    """Projects available in the switcher, each declaring its provenance."""
    rows = (await db.execute(_projects_stmt())).all()
    return {
        "projects": [
            {
                "name": project,
                "traces": int(traces or 0),
                "generated": is_generated(project),
            }
            for project, traces in rows
        ]
    }


@router.get("/traces")
async def list_traces(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    status: str | None = None,
    start_after: datetime | None = None,
    start_before: datetime | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    eval_outcome: str | None = Query(default=None),
) -> dict:
    """List traces (without spans), newest first, with optional filters.

    Each trace carries its ``eval_outcome``: how many measurements passed,
    failed or broke, and which metric scored lowest. That is one aggregate for
    the whole page, not one query per row.
    """
    filters = []
    if project is not None:
        filters.append(TraceModel.project == project)
    # "All projects" means all *measured* projects, matching every aggregate
    # surface. Browsing 300 fabricated traces interleaved with 36 measured ones
    # under an unlabelled heading is the same defect as pooling their means.
    filters.append(exclude_generated_filter(project))
    if status is not None:
        filters.append(TraceModel.status == status)
    if start_after is not None:
        filters.append(TraceModel.start_time >= start_after)
    if start_before is not None:
        filters.append(TraceModel.start_time <= start_before)

    if eval_outcome is not None and eval_outcome not in OUTCOME_FILTERS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unknown eval_outcome '{eval_outcome}'. "
                f"Expected one of: {', '.join(sorted(OUTCOME_FILTERS))}."
            ),
        )

    # The outcome filter joins in the database so paging stays correct:
    # trimming the page afterwards would return short pages and a wrong total.
    outcome_sub = _outcome_subquery() if eval_outcome else None

    def _scoped(stmt):
        if outcome_sub is not None:
            stmt = stmt.outerjoin(
                outcome_sub, TraceModel.trace_id == outcome_sub.c.trace_id
            ).where(_outcome_filters_for(outcome_sub)[eval_outcome])
        for f in filters:
            stmt = stmt.where(f)
        return stmt

    count_stmt = _scoped(select(func.count()).select_from(TraceModel))
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = _scoped(select(TraceModel))
    stmt = stmt.order_by(TraceModel.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()

    # One aggregate for the whole page, keyed by trace_id.
    outcome_stmt = _trace_outcomes_stmt([t.trace_id for t in rows])
    outcomes: dict[str, tuple] = {}
    if outcome_stmt is not None:
        for trace_id, *rest in (await db.execute(outcome_stmt)).all():
            outcomes[trace_id] = tuple(rest)

    return {
        "traces": [
            {
                **_trace_to_dict(t),
                "eval_outcome": _outcome_payload(outcomes.get(t.trace_id)),
            }
            for t in rows
        ],
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


@router.delete("/traces/{trace_id}", status_code=204, response_class=Response)
async def delete_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete a trace with its spans and eval results. 404 if absent."""
    existing = (
        await db.execute(
            select(TraceModel.id).where(TraceModel.trace_id == trace_id)
        )
    ).scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    # Eval rows must go first. This is a Core-level bulk delete, which
    # bypasses the ORM's delete-orphan cascade entirely and leans on the
    # database rule instead -- and databases created before eval_results
    # gained ``ondelete="CASCADE"`` still carry the constraint as NO ACTION,
    # so Postgres rejects the parent delete. Deleting explicitly here fixes
    # those existing databases without a migration, and is a no-op on new
    # ones where the constraint cascades.
    await db.execute(
        delete(EvalResultModel).where(EvalResultModel.trace_id == trace_id)
    )
    await db.execute(
        delete(TraceModel).where(TraceModel.trace_id == trace_id)
    )
    return Response(status_code=204)
