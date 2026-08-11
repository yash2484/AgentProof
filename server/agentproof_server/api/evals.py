# server/agentproof_server/api/evals.py
"""
Eval-execution and results API.

Run endpoints fetch the trace dict from Postgres (async), run the synchronous
``EvalRunner`` off the event loop via ``asyncio.to_thread``, persist each
result as a new ``eval_results`` row (append-only history), and return them.
Query endpoints read results back with the usual filters.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.api.analytics import _ci_block_by_metric
from agentproof_server.api.serialization import _span_to_dict, _trace_to_dict
from agentproof_server.config import settings
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Span as SpanModel
from agentproof_server.db.models import Trace as TraceModel
from agentproof_server.db.session import get_db
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.models import EvalResult
from agentproof_server.eval_engine.runner import EvalRunner

router = APIRouter()


def _resolve_config_path(config_path: str | None) -> str:
    """Use the explicit path if given, else the configured default."""
    return config_path or settings.eval_config_path


def _result_to_row(result: EvalResult) -> EvalResultModel:
    """Map an engine ``EvalResult`` onto an ``eval_results`` ORM row."""
    return EvalResultModel(
        trace_id=result.trace_id,
        span_id=result.span_id,
        metric_name=result.metric_name,
        metric_type=result.metric_type.value,
        score=result.score,
        explanation=result.explanation,
        threshold=result.threshold,
        passed=result.passed,
        details=result.details,
        raw_judge_output=result.raw_judge_output,
        baseline_id=result.baseline_id,
        evaluated_at=result.evaluated_at,
    )


async def _fetch_trace_dict(db: AsyncSession, trace_id: str) -> dict:
    """Load a trace and its spans into the standard trace dict, or 404."""
    trace = (
        await db.execute(
            select(TraceModel).where(TraceModel.trace_id == trace_id)
        )
    ).scalar_one_or_none()
    if trace is None:
        raise HTTPException(
            status_code=404, detail=f"Trace '{trace_id}' not found"
        )
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


async def _persist_results(
    db: AsyncSession, results: list[EvalResult]
) -> None:
    """Stage engine results as eval_results rows and flush them."""
    for result in results:
        db.add(_result_to_row(result))
    await db.flush()


def _row_to_dict(
    row: EvalResultModel, ci_block_by_metric: dict[str, bool] | None = None
) -> dict:
    """Serialize an eval row, decorating it with the metric's CI weight.

    ``ci_block`` is not a column -- it lives on ``MetricConfig`` and has never
    reached the client, so nothing downstream could tell a blocking metric
    from an advisory one. It falls back to ``True`` (``MetricConfig``'s own
    default) so a metric the config no longer names does not quietly stop
    blocking.
    """
    ci_block_by_metric = ci_block_by_metric or {}
    return {
        "trace_id": row.trace_id,
        "span_id": row.span_id,
        "metric_name": row.metric_name,
        "metric_type": row.metric_type,
        "ci_block": ci_block_by_metric.get(row.metric_name, True),
        "score": row.score,
        "explanation": row.explanation,
        "threshold": row.threshold,
        "passed": row.passed,
        "details": row.details,
        "raw_judge_output": row.raw_judge_output,
        "baseline_id": row.baseline_id,
        "evaluated_at": (
            row.evaluated_at.isoformat() if row.evaluated_at else None
        ),
    }


async def _run_and_persist(
    db: AsyncSession,
    trace_dicts: list[dict],
    config_path: str | None,
) -> list[EvalResult]:
    config = load_config(_resolve_config_path(config_path))
    runner = EvalRunner(config)
    results: list[EvalResult] = []
    for trace_dict in trace_dicts:
        trace_results = await asyncio.to_thread(
            runner.evaluate_trace, trace_dict
        )
        results.extend(trace_results)
    await _persist_results(db, results)
    return results


@router.post("/evals/run")
async def run_eval(
    payload: dict, db: AsyncSession = Depends(get_db)
) -> dict:
    """Evaluate a single trace and persist + return its results."""
    trace_id = payload.get("trace_id")
    if not trace_id:
        raise HTTPException(status_code=400, detail="'trace_id' is required.")
    trace_dict = await _fetch_trace_dict(db, trace_id)
    results = await _run_and_persist(
        db, [trace_dict], payload.get("config_path")
    )
    return {
        "trace_id": trace_id,
        "results": [r.model_dump(mode="json") for r in results],
    }


@router.post("/evals/run-batch")
async def run_eval_batch(
    payload: dict, db: AsyncSession = Depends(get_db)
) -> dict:
    """Evaluate several traces and persist + return a batch report."""
    trace_ids = payload.get("trace_ids") or []
    if not trace_ids:
        raise HTTPException(
            status_code=400, detail="'trace_ids' is required."
        )
    config = load_config(_resolve_config_path(payload.get("config_path")))
    runner = EvalRunner(config)
    trace_dicts = [await _fetch_trace_dict(db, tid) for tid in trace_ids]
    report = await asyncio.to_thread(runner.evaluate_batch, trace_dicts)
    await _persist_results(db, report.results)
    return report.model_dump(mode="json")


@router.get("/evals/results")
async def list_results(
    db: AsyncSession = Depends(get_db),
    trace_id: str | None = None,
    metric_name: str | None = None,
    passed: bool | None = None,
    project: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """List eval results, newest first, with optional filters."""
    stmt = select(EvalResultModel)
    if project is not None:
        # Eval rows carry no project; scope via the owning trace.
        stmt = stmt.join(
            TraceModel, EvalResultModel.trace_id == TraceModel.trace_id
        ).where(TraceModel.project == project)
    if trace_id is not None:
        stmt = stmt.where(EvalResultModel.trace_id == trace_id)
    if metric_name is not None:
        stmt = stmt.where(EvalResultModel.metric_name == metric_name)
    if passed is not None:
        stmt = stmt.where(EvalResultModel.passed == passed)
    stmt = (
        stmt.order_by(EvalResultModel.evaluated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()
    ci_block = _ci_block_by_metric()
    return {
        "results": [_row_to_dict(r, ci_block) for r in rows],
        "limit": limit,
        "offset": offset,
    }


@router.get("/evals/results/{trace_id}")
async def get_results_for_trace(
    trace_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """All eval results for one trace, newest first."""
    rows = (
        await db.execute(
            select(EvalResultModel)
            .where(EvalResultModel.trace_id == trace_id)
            .order_by(EvalResultModel.evaluated_at.desc())
        )
    ).scalars().all()
    return {
        "trace_id": trace_id,
        "results": [_row_to_dict(r, _ci_block_by_metric()) for r in rows],
    }


@router.get("/evals/metrics")
async def list_metrics() -> dict:
    """Return the metric names + types defined in the active config."""
    config = load_config(_resolve_config_path(None))
    return {
        "project": config.project,
        "judge_model": config.judge_model,
        "metrics": [
            {
                "name": m.name,
                "type": m.type.value,
                "applies_to": m.applies_to,
                "threshold": m.threshold,
                "ci_block": m.ci_block,
            }
            for m in config.metrics
        ],
    }


# ---------------------------------------------------------------------------
# Aggregate summary (read-only)
# ---------------------------------------------------------------------------
#
# The dashboard overview needs project-wide numbers. Aggregating client-side
# over the 200-row result cap would show a sample while implying full history,
# so every figure below is computed in SQL.
#
# ``project`` is optional: the dashboard's project switcher has an "All
# projects" state, and the overview must not 422 on first render. When it is
# omitted the statements neither join nor filter, and the response's
# ``project`` is null.


def _summary_metrics_stmt(project: str | None):
    """Per-metric aggregates, one row per metric name.

    ``passed`` is boolean, so a bare ``avg()`` over it is invalid in
    Postgres — the pass rate goes through an explicit CASE.
    """
    stmt = select(
        EvalResultModel.metric_name,
        func.avg(EvalResultModel.score).label("mean_score"),
        func.avg(
            case((EvalResultModel.passed, 1.0), else_=0.0)
        ).label("pass_rate"),
        func.count().label("count"),
        func.max(EvalResultModel.evaluated_at).label("last_evaluated_at"),
    )
    if project is not None:
        stmt = stmt.join(
            TraceModel, EvalResultModel.trace_id == TraceModel.trace_id
        ).where(TraceModel.project == project)
    return stmt.group_by(EvalResultModel.metric_name).order_by(
        EvalResultModel.metric_name
    )


def _summary_trace_count_stmt(project: str | None):
    """How many traces the project holds (not how many were evaluated)."""
    stmt = select(func.count()).select_from(TraceModel)
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    return stmt


def _summary_p99_stmt(project: str | None):
    """p99 total latency across the project's traces.

    ``percentile_cont`` is an ordered-set aggregate: it ignores NULL inputs
    and returns NULL when every input is NULL.
    """
    stmt = select(
        func.percentile_cont(0.99).within_group(
            TraceModel.total_latency_ms.asc()
        )
    ).select_from(TraceModel)
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    return stmt


def _summary_payload(
    project: str | None,
    trace_count: int,
    p99_latency_ms: float | None,
    metric_rows: Sequence[tuple],
) -> dict:
    """Assemble the summary response from already-fetched aggregates.

    ``overall_pass_rate`` is the count-weighted mean of the per-metric pass
    rates, which is exactly the average over every eval row — so it needs no
    second query. It is ``None`` (not 0.0) when there is nothing to average,
    because "no data" and "everything failed" are different facts.
    """
    metrics = [
        {
            "metric_name": name,
            "mean_score": float(mean_score) if mean_score is not None else None,
            "pass_rate": float(pass_rate) if pass_rate is not None else None,
            "count": int(count),
            "last_evaluated_at": (
                last_evaluated_at.isoformat() if last_evaluated_at else None
            ),
        }
        for name, mean_score, pass_rate, count, last_evaluated_at in metric_rows
    ]

    total = sum(m["count"] for m in metrics)
    if total:
        weighted = sum(
            (m["pass_rate"] or 0.0) * m["count"] for m in metrics
        )
        overall_pass_rate: float | None = round(weighted / total, 6)
    else:
        overall_pass_rate = None

    return {
        "project": project,
        "trace_count": trace_count,
        "overall_pass_rate": overall_pass_rate,
        "p99_latency_ms": (
            float(p99_latency_ms) if p99_latency_ms is not None else None
        ),
        "metrics": metrics,
    }


@router.get("/evals/summary")
async def get_evals_summary(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
) -> dict:
    """Project-wide eval aggregates for the dashboard overview.

    An empty or unknown project returns ``trace_count: 0`` with a null pass
    rate and no metrics — not a 404 — so a fresh install renders guidance
    rather than an error.
    """
    metric_rows = (await db.execute(_summary_metrics_stmt(project))).all()
    trace_count = (
        await db.execute(_summary_trace_count_stmt(project))
    ).scalar_one()
    p99 = (await db.execute(_summary_p99_stmt(project))).scalar_one_or_none()
    return _summary_payload(project, trace_count, p99, metric_rows)


