# server/tests/integration/test_trace_delete_cascade.py
"""
DB-backed regression tests for DELETE /traces/{trace_id}.

Regression: deleting a trace that had been evaluated returned HTTP 500.
``eval_results.trace_id`` was declared as a bare ``ForeignKey`` with no
``ondelete`` rule, while ``spans`` carried ``ondelete="CASCADE"``. The
handler issues a Core-level bulk ``delete()``, which bypasses the ORM's
``cascade="all, delete-orphan"`` entirely and relies purely on the database
rule -- so spans were removed and eval rows raised a FK violation:

    ForeignKeyViolationError: update or delete on table "traces" violates
    foreign key constraint "eval_results_trace_id_fkey" on table "eval_results"

That made the dashboard's Delete button fail for any evaluated trace, and
made the cleanup in ``test_trace_pipeline.py`` silently leak rows.

Calls the route handler directly with a test session, so no HTTP server is
needed -- only a reachable Postgres. Skipped when the database is
unreachable so local runs stay green. Each test writes under a unique
project name and removes its own rows, so it is safe against a database
that already holds demo data.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest
from agentproof_server.api.traces import delete_trace
from agentproof_server.config import settings
from agentproof_server.db.models import Base
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Span as SpanModel
from agentproof_server.db.models import Trace as TraceModel
from fastapi import HTTPException
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool


def _db_up() -> bool:
    async def _ping() -> None:
        eng = create_async_engine(settings.database_url, poolclass=NullPool)
        try:
            async with eng.connect() as conn:
                await conn.execute(text("SELECT 1"))
        finally:
            await eng.dispose()

    try:
        asyncio.run(_ping())
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _db_up(), reason="requires a reachable Postgres (docker compose up)"
)


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    # NullPool: pytest-asyncio gives each test its own event loop, and a
    # pooled connection bound to a closed loop fails on reuse.
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await eng.dispose()


async def _seed_trace(
    session: AsyncSession,
    trace_id: str,
    project: str,
    *,
    with_eval: bool,
) -> None:
    """Insert a trace with one span, optionally with an eval result."""
    now = datetime.now(UTC)
    session.add(
        TraceModel(
            trace_id=trace_id,
            project=project,
            name="delete-cascade-test",
            total_latency_ms=1000,
            status="ok",
            tags={},
        )
    )
    session.add(
        SpanModel(
            span_id=f"{trace_id}-span",
            trace_id=trace_id,
            parent_span_ids=[],
            span_type="llm_call",
            name="gen",
            start_time=now,
            status="ok",
            span_metadata={},
            tags={},
        )
    )
    if with_eval:
        # Flush first: Trace and EvalResult have no ORM relationship(), only
        # a raw FK column, so the unit of work has no dependency edge to
        # order the INSERTs by.
        await session.flush()
        session.add(
            EvalResultModel(
                trace_id=trace_id,
                span_id=None,
                metric_name="faithfulness",
                metric_type="llm_judge",
                score=0.9,
                threshold=0.7,
                passed=True,
                evaluated_at=now,
            )
        )
    await session.commit()


async def _count(session: AsyncSession, model, trace_id: str) -> int:
    return (
        await session.execute(
            select(func.count()).select_from(model).where(model.trace_id == trace_id)
        )
    ).scalar_one()


async def _cleanup(session: AsyncSession, trace_id: str) -> None:
    await session.execute(
        delete(EvalResultModel).where(EvalResultModel.trace_id == trace_id)
    )
    await session.execute(delete(SpanModel).where(SpanModel.trace_id == trace_id))
    await session.execute(delete(TraceModel).where(TraceModel.trace_id == trace_id))
    await session.commit()


async def test_deleting_an_evaluated_trace_succeeds(session: AsyncSession):
    """The regression: this raised IntegrityError -> HTTP 500."""
    project = f"del-eval-{uuid.uuid4().hex[:8]}"
    trace_id = f"{project}-tr"
    try:
        await _seed_trace(session, trace_id, project, with_eval=True)
        assert await _count(session, EvalResultModel, trace_id) == 1

        response = await delete_trace(trace_id, db=session)
        await session.commit()

        assert response.status_code == 204
        assert await _count(session, TraceModel, trace_id) == 0
        assert await _count(session, SpanModel, trace_id) == 0
        assert await _count(session, EvalResultModel, trace_id) == 0
    finally:
        await session.rollback()
        await _cleanup(session, trace_id)


async def test_deleting_an_unevaluated_trace_still_works(session: AsyncSession):
    """Guard the path that already worked, so the fix does not regress it."""
    project = f"del-plain-{uuid.uuid4().hex[:8]}"
    trace_id = f"{project}-tr"
    try:
        await _seed_trace(session, trace_id, project, with_eval=False)

        response = await delete_trace(trace_id, db=session)
        await session.commit()

        assert response.status_code == 204
        assert await _count(session, TraceModel, trace_id) == 0
        assert await _count(session, SpanModel, trace_id) == 0
    finally:
        await session.rollback()
        await _cleanup(session, trace_id)


async def test_deleting_a_missing_trace_still_404s(session: AsyncSession):
    """The fix must not turn an unknown trace into a silent success."""
    with pytest.raises(HTTPException) as excinfo:
        await delete_trace(f"nope-{uuid.uuid4().hex[:8]}", db=session)
    assert excinfo.value.status_code == 404


async def test_deleting_one_trace_leaves_another_traces_evals_alone(
    session: AsyncSession,
):
    """Scoping guard: the cascade must not widen into a table-wide delete."""
    project = f"del-scope-{uuid.uuid4().hex[:8]}"
    doomed, survivor = f"{project}-doomed", f"{project}-survivor"
    try:
        await _seed_trace(session, doomed, project, with_eval=True)
        await _seed_trace(session, survivor, project, with_eval=True)

        await delete_trace(doomed, db=session)
        await session.commit()

        assert await _count(session, EvalResultModel, doomed) == 0
        assert await _count(session, EvalResultModel, survivor) == 1
        assert await _count(session, TraceModel, survivor) == 1
    finally:
        await session.rollback()
        await _cleanup(session, doomed)
        await _cleanup(session, survivor)
