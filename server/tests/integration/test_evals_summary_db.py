# server/tests/integration/test_evals_summary_db.py
"""
DB-backed tests for GET /evals/summary.

Calls the route handler directly with a test session, so no HTTP server is
needed — only a reachable Postgres. CI's test-server job provides one.
Skipped when the database is unreachable so local runs stay green.

Each test writes under a unique project name and deletes its own rows, so it
is safe against a database that already holds demo data.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from agentproof_server.api.evals import get_evals_summary
from agentproof_server.config import settings
from agentproof_server.db.models import Base
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Trace as TraceModel
from sqlalchemy import delete, select, text
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


async def _seed(
    session: AsyncSession,
    project: str,
    specs: list[tuple[str, float, bool]],
    latency_ms: int = 1000,
) -> list[str]:
    """Insert one trace per spec plus its eval row. Returns the trace ids."""
    now = datetime.now(UTC)
    trace_ids: list[str] = []
    for i, (metric_name, score, passed) in enumerate(specs):
        trace_id = f"{project}-tr-{i}"
        trace_ids.append(trace_id)
        session.add(
            TraceModel(
                trace_id=trace_id,
                project=project,
                name=f"run-{i}",
                total_latency_ms=latency_ms + i,
                status="ok",
                tags={},
            )
        )
        # Flush the trace before adding its eval result: Trace and
        # EvalResult have no ORM ``relationship()`` between them (only a
        # raw FK column), so the unit of work has no dependency edge to
        # order their INSERTs by — without this flush it can (and does,
        # on SQLAlchemy 2.0.51) emit the eval_results insert first and
        # trip the FK constraint.
        await session.flush()
        session.add(
            EvalResultModel(
                trace_id=trace_id,
                span_id=None,
                metric_name=metric_name,
                metric_type="security",
                score=score,
                threshold=0.8,
                passed=passed,
                evaluated_at=now + timedelta(seconds=i),
            )
        )
    await session.commit()
    return trace_ids


async def _cleanup(session: AsyncSession, project: str) -> None:
    """Remove everything this test wrote, leaving pre-existing data alone."""
    trace_ids = (
        await session.execute(
            select(TraceModel.trace_id).where(TraceModel.project == project)
        )
    ).scalars().all()
    if trace_ids:
        await session.execute(
            delete(EvalResultModel).where(EvalResultModel.trace_id.in_(trace_ids))
        )
        await session.execute(
            delete(TraceModel).where(TraceModel.trace_id.in_(trace_ids))
        )
    await session.commit()


async def test_summary_aggregates_a_populated_project(session: AsyncSession):
    project = f"sum-pop-{uuid.uuid4().hex[:8]}"
    try:
        await _seed(
            session,
            project,
            [
                ("injection_resistance", 1.0, True),
                ("injection_resistance", 0.0, False),
                ("data_exfiltration", 1.0, True),
            ],
        )
        payload = await get_evals_summary(db=session, project=project)

        assert payload["project"] == project
        assert payload["trace_count"] == 3
        # 2 passes out of 3 eval rows.
        assert payload["overall_pass_rate"] == pytest.approx(2 / 3, rel=1e-4)
        assert payload["p99_latency_ms"] is not None

        by_name = {m["metric_name"]: m for m in payload["metrics"]}
        assert by_name["injection_resistance"]["count"] == 2
        assert by_name["injection_resistance"]["pass_rate"] == pytest.approx(0.5)
        assert by_name["injection_resistance"]["mean_score"] == pytest.approx(0.5)
        assert by_name["data_exfiltration"]["pass_rate"] == pytest.approx(1.0)
        assert by_name["data_exfiltration"]["last_evaluated_at"] is not None
    finally:
        await _cleanup(session, project)


async def test_summary_of_an_empty_project_returns_zeroes_not_a_404(
    session: AsyncSession,
):
    payload = await get_evals_summary(
        db=session, project=f"sum-empty-{uuid.uuid4().hex[:8]}"
    )
    assert payload["trace_count"] == 0
    assert payload["overall_pass_rate"] is None
    assert payload["p99_latency_ms"] is None
    assert payload["metrics"] == []


async def test_summary_does_not_leak_results_from_another_project(
    session: AsyncSession,
):
    mine = f"sum-mine-{uuid.uuid4().hex[:8]}"
    theirs = f"sum-theirs-{uuid.uuid4().hex[:8]}"
    try:
        await _seed(session, mine, [("faithfulness", 1.0, True)])
        await _seed(
            session,
            theirs,
            [("leaked_metric", 0.0, False), ("leaked_metric", 0.0, False)],
        )

        payload = await get_evals_summary(db=session, project=mine)

        assert payload["trace_count"] == 1
        assert [m["metric_name"] for m in payload["metrics"]] == ["faithfulness"]
        assert payload["overall_pass_rate"] == pytest.approx(1.0)
    finally:
        await _cleanup(session, mine)
        await _cleanup(session, theirs)
