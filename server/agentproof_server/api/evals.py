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

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


def _row_to_dict(row: EvalResultModel) -> dict:
    return {
        "trace_id": row.trace_id,
        "span_id": row.span_id,
        "metric_name": row.metric_name,
        "metric_type": row.metric_type,
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
    return {
        "results": [_row_to_dict(r) for r in rows],
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
        "results": [_row_to_dict(r) for r in rows],
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
            }
            for m in config.metrics
        ],
    }


