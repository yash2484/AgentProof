# server/agentproof_server/api/security_analytics.py
"""
Security posture: one read-only endpoint behind the dashboard's Security page.

The page it feeds answers a prevalence question, not a score question. A
security metric is 0/1 per span taken to the trace by ``min``, so a mean is
close to meaningless and a percentage is worse -- "97% safe" is not a sentence
anyone should be comfortable saying about a control.

What matters instead is: how many runs were breached, and how many were even
*attacked*. ``0 of 0 attempted``, ``0 of 34 attempted`` and "nobody checked"
are three different facts, and only one of them is reassuring.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.api.analytics import (
    _degraded_expr,
    _eval_timeline_stmt,
    _optional_float,
    _scope_evals,
    _window_start,
    cluster_eval_runs,
)
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.session import get_db
from agentproof_server.eval_engine.details import attack_attempted, reasoning_records

router = APIRouter()


def _attempted_expr():
    """SQL predicate for "an attack was attempted against this trace".

    ``$.**`` because the flag nests: a ``dual``-mode metric writes it under
    the heuristic leg. Measured on the demo corpus, the top-level-only path
    matched 0 of 37 rows while 5 real attempts sat inside them.
    """
    return func.jsonb_path_exists(
        EvalResultModel.details,
        literal_column("'$.**.injection_attempted ? (@ == true)'"),
    )


def _attempt_signal_expr():
    """True when the row records an attempt decision either way.

    Distinguishes "checked, not attacked" from "never checked". Only
    ``injection_resistance`` writes this; reporting ``0 attempted`` for the
    metrics that never do would claim a check that never ran.
    """
    return func.jsonb_path_exists(
        EvalResultModel.details, literal_column("'$.**.injection_attempted'")
    )


def _scope_security(stmt, project: str | None, since: datetime | None):
    return _scope_evals(stmt, project, since).where(
        EvalResultModel.metric_type == "security"
    )


def _posture_stmt(project: str | None, since: datetime | None):
    """Per security metric: measured, breached, degraded, attempted."""
    degraded = _degraded_expr()
    scored = ~degraded
    stmt = select(
        EvalResultModel.metric_name,
        func.sum(case((scored, 1), else_=0)).label("measured"),
        func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
            "breached"
        ),
        func.sum(case((degraded, 1), else_=0)).label("degraded"),
        func.sum(case((_attempted_expr(), 1), else_=0)).label("attempted"),
        func.sum(case((_attempt_signal_expr(), 1), else_=0)).label("signal"),
        func.stddev_samp(case((scored, EvalResultModel.score))).label("std"),
    ).select_from(EvalResultModel)
    stmt = _scope_security(stmt, project, since)
    return stmt.group_by(EvalResultModel.metric_name).order_by(
        EvalResultModel.metric_name.asc()
    )


def _attack_surface_stmt(project: str | None, since: datetime | None):
    """Traces measured by any security metric, and how many were attacked.

    Counts *traces*, not rows: three security metrics per trace would treble
    a row count and the question is how much of the surface was probed.
    """
    stmt = select(
        func.count(EvalResultModel.trace_id.distinct()).label("traces"),
        func.count(
            case((_attempted_expr(), EvalResultModel.trace_id)).distinct()
        ).label("attacked"),
    ).select_from(EvalResultModel)
    return _scope_security(stmt, project, since)


def _breach_runs_stmt(
    project: str | None, since: datetime | None, boundaries: Sequence[datetime]
):
    """Measured / breached / attempted per run, bucketed by the run boundaries."""
    if not boundaries:
        return None
    branches = [
        (EvalResultModel.evaluated_at < boundaries[i + 1], i)
        for i in range(len(boundaries) - 1)
    ]
    run_index = (
        case(*branches, else_=len(boundaries) - 1) if branches else literal_column("0")
    ).label("run_index")

    degraded = _degraded_expr()
    scored = ~degraded
    stmt = select(
        run_index,
        func.sum(case((scored, 1), else_=0)).label("measured"),
        func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
            "breached"
        ),
        func.sum(case((_attempted_expr(), 1), else_=0)).label("attempted"),
    ).select_from(EvalResultModel)
    stmt = _scope_security(stmt, project, since)
    return stmt.group_by(run_index).order_by(run_index.asc())


def _findings_stmt(
    project: str | None, since: datetime | None, limit: int
):
    """Only the rows that failed. Passing rows are counted, never enumerated."""
    stmt = select(
        EvalResultModel.trace_id,
        EvalResultModel.span_id,
        EvalResultModel.metric_name,
        EvalResultModel.score,
        EvalResultModel.evaluated_at,
        EvalResultModel.explanation,
        EvalResultModel.details,
    ).select_from(EvalResultModel)
    stmt = _scope_security(stmt, project, since).where(
        ~EvalResultModel.passed, ~_degraded_expr()
    )
    return stmt.order_by(EvalResultModel.evaluated_at.desc()).limit(limit)


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


def _security_payload(
    project: str | None,
    days: int | None,
    generated_at: datetime,
    posture_rows: Sequence[tuple],
    attack_surface_row: tuple,
    run_rows: Sequence[tuple],
    finding_rows: Sequence[tuple],
) -> dict:
    """Assemble the Security response from already-fetched aggregates."""
    metrics = []
    for name, measured, breached, degraded, attempted, signal, std in posture_rows:
        has_signal = int(signal or 0) > 0
        std_value = _optional_float(std)
        metrics.append(
            {
                "metric_name": name,
                "measured": int(measured or 0),
                "breached": int(breached or 0),
                "degraded": int(degraded or 0),
                # None, not 0: a metric that never records an attempt decision
                # has not been found clean, it has not been asked.
                "attempted": int(attempted or 0) if has_signal else None,
                "attempt_signal": has_signal,
                "has_variance": std_value is not None and std_value > 0.0,
            }
        )

    traces, attacked = (int(v or 0) for v in attack_surface_row)

    return {
        "project": project,
        "days": days,
        "generated_at": generated_at.isoformat(),
        "metrics": metrics,
        "totals": {
            "measured": sum(m["measured"] for m in metrics),
            "breached": sum(m["breached"] for m in metrics),
            "degraded": sum(m["degraded"] for m in metrics),
        },
        "attack_surface": {
            "traces": traces,
            "attacked": attacked,
            "unattacked": traces - attacked,
        },
        "runs": [
            {
                "run_at": run_at.isoformat(),
                "measured": int(measured or 0),
                "breached": int(breached or 0),
                "attempted": int(attempted or 0),
            }
            for run_at, measured, breached, attempted in run_rows
        ],
        "findings": [
            {
                "trace_id": trace_id,
                "span_id": span_id,
                "metric_name": metric_name,
                "score": _optional_float(score),
                "evaluated_at": evaluated_at.isoformat() if evaluated_at else None,
                "explanation": explanation,
                "attempted": attack_attempted(details),
                "reasoning": reasoning_records(details),
            }
            for (
                trace_id,
                span_id,
                metric_name,
                score,
                evaluated_at,
                explanation,
                details,
            ) in finding_rows
        ],
    }


@router.get("/security/analytics")
async def get_security_analytics(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    days: Annotated[int, Query(ge=0, le=3650)] = 30,
    findings: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    """Security posture: prevalence first, findings second."""
    now = datetime.now(UTC)
    since = _window_start(days, now)

    posture_rows = (await db.execute(_posture_stmt(project, since))).all()
    surface_row = (await db.execute(_attack_surface_stmt(project, since))).one()
    finding_rows = (
        await db.execute(_findings_stmt(project, since, findings))
    ).all()

    # Run boundaries come from the same fold the other pages use, so a run
    # means the same thing everywhere.
    timeline_rows = (await db.execute(_eval_timeline_stmt(project, since))).all()
    runs = cluster_eval_runs(timeline_rows)
    run_stmt = _breach_runs_stmt(project, since, [r["run_at"] for r in runs])
    run_rows: list[tuple] = []
    if run_stmt is not None:
        for index, measured, breached, attempted in (
            await db.execute(run_stmt)
        ).all():
            run_rows.append(
                (runs[int(index)]["run_at"], measured, breached, attempted)
            )

    return _security_payload(
        project=project,
        days=days,
        generated_at=now,
        posture_rows=posture_rows,
        attack_surface_row=tuple(surface_row),
        run_rows=run_rows,
        finding_rows=finding_rows,
    )
