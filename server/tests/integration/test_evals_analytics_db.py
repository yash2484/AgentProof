# server/tests/integration/test_evals_analytics_db.py
"""
DB-backed tests for GET /evals/analytics.

Calls the route handler directly with a test session, so no HTTP server is
needed — only a reachable Postgres. These cover what SQLite and statement-
string assertions cannot: ``jsonb_path_exists`` over the details blob,
``stddev_samp``'s NULL-at-n=1 behaviour, and ``date_trunc`` bucketing.

Each test writes under a unique project name and deletes its own rows, so it
is safe against a database that already holds demo data.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from agentproof_server.api.analytics import get_evals_analytics
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

JUDGE_OK = {"per_span": [{"span_id": "s1", "score": 0.9, "reasoning": "..."}]}
JUDGE_ERROR = {"per_span": [{"span_id": "s1", "error": "APIError: timeout"}]}
JUDGE_REFUSAL = {"per_span": [{"span_id": "s1", "refusal": True}]}
DETERMINISTIC = {"latency_ms": 1820, "limit": 2000}


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
    project: str,
    index: int,
    evals: list[tuple[str, float, bool, dict | None]],
    evaluated_at: datetime,
    status: str = "ok",
    tokens: int = 100,
    cost_usd: float = 0.01,
) -> str:
    """Insert one trace plus its eval rows, all stamped ``evaluated_at``."""
    trace_id = f"{project}-tr-{index}"
    session.add(
        TraceModel(
            trace_id=trace_id,
            project=project,
            name=f"run-{index}",
            total_latency_ms=1000 + index,
            total_tokens=tokens,
            total_cost_usd=cost_usd,
            status=status,
            tags={},
        )
    )
    # Trace and EvalResult have no ORM relationship (only a raw FK column), so
    # the unit of work has no edge to order their INSERTs by -- flush first or
    # the eval insert can land before its trace and trip the FK.
    await session.flush()
    for metric_name, score, passed, details in evals:
        session.add(
            EvalResultModel(
                trace_id=trace_id,
                span_id=None,
                metric_name=metric_name,
                metric_type="llm_judge",
                score=score,
                threshold=0.7,
                passed=passed,
                details=details,
                evaluated_at=evaluated_at,
            )
        )
    await session.commit()
    return trace_id


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


def _metric(payload: dict, name: str) -> dict:
    return next(m for m in payload["metric_health"] if m["metric_name"] == name)


async def test_a_judge_error_is_degraded_not_a_failing_score(session: AsyncSession):
    """The bug this rework exists to fix, proven against real jsonb.

    One judge call timed out and failed closed to 0.0. That must not move the
    metric's mean, must not count as a failure, and must be visible as a
    broken measurement.
    """
    project = f"an-deg-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0,
            [("faithfulness", 1.0, True, JUDGE_OK)], now,
        )
        await _seed_trace(
            session, project, 1,
            [("faithfulness", 0.0, False, JUDGE_ERROR)], now + timedelta(seconds=4),
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        row = _metric(payload, "faithfulness")
        assert row["mean_score"] == 1.0  # not 0.5
        assert row["failed"] == 0
        assert row["degraded"] == 1
        assert row["count"] == 1
        assert payload["outcome_split"] == {
            "passed": 1, "failed": 0, "degraded": 1
        }
    finally:
        await _cleanup(session, project)


async def test_a_judge_refusal_is_degraded_too(session: AsyncSession):
    project = f"an-ref-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0,
            [("faithfulness", 0.0, False, JUDGE_REFUSAL)], now,
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert _metric(payload, "faithfulness")["degraded"] == 1
    finally:
        await _cleanup(session, project)


async def test_a_deterministic_zero_is_a_real_failure(session: AsyncSession):
    """Flat details carry no judge record, so a 0.0 there is a finding."""
    project = f"an-det-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0,
            [("latency_budget", 0.0, False, DETERMINISTIC)], now,
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        row = _metric(payload, "latency_budget")
        assert row["degraded"] == 0
        assert row["failed"] == 1
    finally:
        await _cleanup(session, project)


async def test_a_null_details_row_is_not_degraded(session: AsyncSession):
    """``jsonb_path_exists(NULL, ...)`` is NULL; the coalesce must absorb it."""
    project = f"an-null-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0, [("faithfulness", 1.0, True, None)], now
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert _metric(payload, "faithfulness")["degraded"] == 0
        assert _metric(payload, "faithfulness")["count"] == 1
    finally:
        await _cleanup(session, project)


async def test_thirteen_traces_in_one_batch_report_one_run(session: AsyncSession):
    """``evaluated_at`` is stamped per trace, so equality grouping said 13."""
    project = f"an-run-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        for i in range(13):
            await _seed_trace(
                session, project, i,
                [("faithfulness", 1.0, True, JUDGE_OK)],
                now + timedelta(seconds=i * 4),
            )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert payload["totals"]["eval_runs"] == 1
        assert payload["eval_runs"][0]["trace_count"] == 13
        assert payload["totals"]["traces"] == 13
    finally:
        await _cleanup(session, project)


async def test_two_batches_an_hour_apart_report_two_runs(session: AsyncSession):
    project = f"an-2run-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        for i in range(3):
            await _seed_trace(
                session, project, i,
                [("faithfulness", 1.0, True, JUDGE_OK)],
                now + timedelta(seconds=i * 4),
            )
        for i in range(3, 6):
            await _seed_trace(
                session, project, i,
                [("faithfulness", 1.0, True, JUDGE_OK)],
                now + timedelta(hours=1, seconds=i * 4),
            )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert payload["totals"]["eval_runs"] == 2
        assert [r["trace_count"] for r in payload["eval_runs"]] == [3, 3]
    finally:
        await _cleanup(session, project)


async def test_a_metric_that_never_varied_is_not_reported_as_healthy(
    session: AsyncSession,
):
    """Six of eight metrics sit at 1.000 because nothing stresses them."""
    project = f"an-var-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        for i in range(4):
            await _seed_trace(
                session, project, i,
                [
                    ("pii_leakage", 1.0, True, JUDGE_OK),
                    ("faithfulness", 0.2 * (i + 1), i > 1, JUDGE_OK),
                ],
                now + timedelta(seconds=i * 4),
            )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert _metric(payload, "pii_leakage")["std"] == 0.0
        assert _metric(payload, "pii_leakage")["has_variance"] is False
        assert _metric(payload, "faithfulness")["has_variance"] is True
    finally:
        await _cleanup(session, project)


async def test_one_observation_reports_a_null_std_not_zero(session: AsyncSession):
    """stddev_samp is NULL at n=1: "cannot tell", not "perfectly stable"."""
    project = f"an-n1-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0, [("faithfulness", 1.0, True, JUDGE_OK)], now
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        row = _metric(payload, "faithfulness")
        assert row["std"] is None
        assert row["has_variance"] is False
    finally:
        await _cleanup(session, project)


async def test_score_buckets_exclude_degraded_rows(session: AsyncSession):
    """A failed judge call must not draw a bar at 0.0 in the histogram."""
    project = f"an-buck-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0, [("faithfulness", 0.95, True, JUDGE_OK)], now
        )
        await _seed_trace(
            session, project, 1,
            [("faithfulness", 0.0, False, JUDGE_ERROR)],
            now + timedelta(seconds=4),
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        buckets = [b for b in payload["score_buckets"]]
        assert buckets == [
            {"metric_name": "faithfulness", "bucket": 0.9, "count": 1}
        ]
    finally:
        await _cleanup(session, project)


async def test_a_perfect_score_lands_in_the_top_bin_not_its_own(
    session: AsyncSession,
):
    """``floor(1.0 * 10) / 10`` is 1.0, which is a bin with no width.

    Rendered on a 0->1 track that bar starts at the right edge and is clipped
    away entirely — 34 of 35 observations became invisible on the real demo
    data. Scores of exactly 1.0 belong in the 0.9-1.0 bin.
    """
    project = f"an-top-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        for i, score in enumerate([1.0, 1.0, 0.95, 0.5]):
            await _seed_trace(
                session, project, i,
                [("faithfulness", score, score >= 0.7, JUDGE_OK)],
                now + timedelta(seconds=i * 4),
            )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        buckets = {b["bucket"]: b["count"] for b in payload["score_buckets"]}
        assert 1.0 not in buckets
        assert buckets[0.9] == 3  # two 1.0s plus the 0.95
        assert buckets[0.5] == 1
    finally:
        await _cleanup(session, project)


async def test_trace_volume_buckets_by_day_and_splits_status(
    session: AsyncSession,
):
    project = f"an-vol-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0, [("faithfulness", 1.0, True, JUDGE_OK)], now
        )
        await _seed_trace(
            session, project, 1,
            [("faithfulness", 1.0, True, JUDGE_OK)],
            now + timedelta(seconds=4),
            status="error",
        )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        # created_at is server-defaulted to now(), so both land on one day.
        assert len(payload["trace_volume"]) == 1
        assert payload["trace_volume"][0] == {
            "day": now.date().isoformat(), "total": 2, "ok": 1, "error": 1
        }
        assert payload["status_split"] == {"ok": 1, "error": 1}
    finally:
        await _cleanup(session, project)


async def test_totals_sum_tokens_and_cost(session: AsyncSession):
    project = f"an-tot-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        for i in range(3):
            await _seed_trace(
                session, project, i,
                [("faithfulness", 1.0, True, JUDGE_OK)],
                now + timedelta(seconds=i * 4),
                tokens=100,
                cost_usd=0.01,
            )

        payload = await get_evals_analytics(db=session, project=project, days=30)

        assert payload["totals"]["tokens"] == 300
        assert payload["totals"]["cost_usd"] == pytest.approx(0.03)
    finally:
        await _cleanup(session, project)


async def test_an_unevaluated_trace_is_pending_not_passing(session: AsyncSession):
    project = f"an-pend-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0, [("faithfulness", 1.0, True, JUDGE_OK)], now
        )
        await _seed_trace(session, project, 1, [], now + timedelta(seconds=4))

        payload = await get_evals_analytics(db=session, project=project, days=30)

        totals = payload["totals"]
        assert totals["traces"] == 2
        assert totals["scored"] == 1
        assert totals["pending"] == 1
    finally:
        await _cleanup(session, project)


async def test_the_time_window_excludes_older_evaluations(session: AsyncSession):
    project = f"an-win-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    try:
        await _seed_trace(
            session, project, 0,
            [("faithfulness", 1.0, True, JUDGE_OK)],
            now - timedelta(days=90),
        )

        windowed = await get_evals_analytics(db=session, project=project, days=30)
        everything = await get_evals_analytics(db=session, project=project, days=0)

        assert windowed["metric_health"] == []
        assert windowed["totals"]["eval_runs"] == 0
        assert everything["totals"]["eval_runs"] == 1
    finally:
        await _cleanup(session, project)


async def test_an_unknown_project_returns_zeroes_not_a_404(session: AsyncSession):
    payload = await get_evals_analytics(
        db=session, project=f"nope-{uuid.uuid4().hex[:8]}", days=30
    )

    assert payload["totals"]["traces"] == 0
    assert payload["totals"]["tokens"] is None
    assert payload["metric_health"] == []
    assert payload["eval_runs"] == []
