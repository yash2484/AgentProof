# server/agentproof_server/api/analytics.py
"""
Overview analytics: one read-only endpoint behind the dashboard's Overview.

Every figure is computed in SQL. The precedent is ``/evals/summary``: the
results endpoint caps at 200 rows, so aggregating client-side would show a
sample while implying full history.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.config import settings
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Trace as TraceModel
from agentproof_server.db.session import get_db
from agentproof_server.eval_engine.baseline import baselines_from_json
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression

logger = logging.getLogger("agentproof_server")

router = APIRouter()

# Rows evaluated less than this far apart belong to the same run.
# ``runner.py:137`` takes ``now`` once per trace, so a 13-trace batch lands as
# 13 distinct timestamps a few seconds apart. Grouping by equality reported 13
# runs where there were 2.
RUN_GAP_SECONDS = 120


def is_degraded(details: dict | None) -> bool:
    """True when a judge call behind this row errored or refused.

    A degraded row is a failed *measurement*, not a finding. The judge fails
    closed to 0.0, so without this a timed-out API call renders as a security
    verdict. There is no column for it -- the markers live in the per-span
    records inside ``details``, written by ``run_structured_judge``.
    """
    if not details:
        return False
    for record in details.get("per_span") or []:
        if isinstance(record, dict) and (
            record.get("error") or record.get("refusal")
        ):
            return True
    return False


def cluster_eval_runs(
    rows: Sequence[tuple[datetime, Sequence[str], float, int, int]],
    gap_seconds: int = RUN_GAP_SECONDS,
) -> list[dict]:
    """Fold per-timestamp eval aggregates into runs, splitting on time gaps.

    ``rows`` are ``(evaluated_at, trace_ids, score_sum, score_count,
    degraded)`` ordered oldest-first -- SQL has already reduced every eval row
    down to one row per evaluation instant, so this fold sees at most one row
    per evaluated trace.

    ``trace_count`` is *distinct* traces within the run, which is why the ids
    travel rather than a count: re-evaluating the same batch inside one window
    reported 26 traces for a project holding 25. Across runs the ids are not
    deduped -- re-evaluating a trace next week is a real data point for that
    run.

    ``mean_score`` is the row-weighted mean (``score_sum / score_count``), not
    the mean of per-trace means: a trace evaluated on 8 metrics must not carry
    the same weight as one evaluated on 2.
    """
    runs: list[dict] = []
    current: dict | None = None
    previous_at: datetime | None = None

    for evaluated_at, trace_ids, score_sum, score_count, degraded in rows:
        starts_new_run = (
            current is None
            or previous_at is None
            or (evaluated_at - previous_at).total_seconds() > gap_seconds
        )
        if starts_new_run:
            current = {
                "run_at": evaluated_at,
                "_trace_ids": set(),
                "_score_sum": 0.0,
                "_score_count": 0,
                "degraded": 0,
            }
            runs.append(current)
        assert current is not None  # narrowed by the branch above
        current["_trace_ids"].update(trace_ids or ())
        current["_score_sum"] += float(score_sum or 0.0)
        current["_score_count"] += int(score_count or 0)
        current["degraded"] += int(degraded or 0)
        previous_at = evaluated_at

    for run in runs:
        count = run.pop("_score_count")
        total = run.pop("_score_sum")
        run["trace_count"] = len(run.pop("_trace_ids"))
        run["mean_score"] = (total / count) if count else None
    return runs


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------


def _degraded_expr():
    """SQL predicate mirroring :func:`is_degraded`.

    ``run_structured_judge`` writes ``error`` only on an exception and
    ``refusal`` only on a refusal, so key presence and Python truthiness agree
    -- a contract pinned by ``test_the_judge_only_writes_these_keys_on_failure``.
    ``details`` is nullable, hence the coalesce: a NULL here would poison every
    CASE it feeds.
    """
    from sqlalchemy import false, literal_column

    return func.coalesce(
        or_(
            func.jsonb_path_exists(
                EvalResultModel.details, literal_column("'$.per_span[*].error'")
            ),
            func.jsonb_path_exists(
                EvalResultModel.details,
                literal_column("'$.per_span[*].refusal'"),
            ),
        ),
        false(),
    )


def _scope_traces(stmt, project: str | None, since: datetime | None):
    """Filter a traces-rooted statement by project and time window."""
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    if since is not None:
        stmt = stmt.where(TraceModel.created_at >= since)
    return stmt


def _scope_evals(stmt, project: str | None, since: datetime | None):
    """Filter an eval-rooted statement by project and time window.

    Eval rows carry no project, so scoping one means joining the owning trace.
    The window applies to ``evaluated_at``: an old trace evaluated today
    belongs in today's numbers.
    """
    if project is not None:
        stmt = stmt.join(
            TraceModel, EvalResultModel.trace_id == TraceModel.trace_id
        ).where(TraceModel.project == project)
    if since is not None:
        stmt = stmt.where(EvalResultModel.evaluated_at >= since)
    return stmt


def _trace_totals_stmt(project: str | None, since: datetime | None):
    """Trace count plus the cost of producing them."""
    stmt = select(
        func.count().label("traces"),
        func.sum(TraceModel.total_tokens).label("tokens"),
        func.sum(TraceModel.total_cost_usd).label("cost_usd"),
    ).select_from(TraceModel)
    return _scope_traces(stmt, project, since)


def _trace_volume_stmt(project: str | None, since: datetime | None):
    """Traces per day, split ok vs error."""
    day = func.date_trunc("day", TraceModel.created_at).label("day")
    stmt = select(
        day,
        func.count().label("total"),
        func.sum(case((TraceModel.status == "error", 0), else_=1)).label("ok"),
        func.sum(case((TraceModel.status == "error", 1), else_=0)).label("error"),
    ).select_from(TraceModel)
    stmt = _scope_traces(stmt, project, since)
    return stmt.group_by(day).order_by(day.asc())


def _eval_timeline_stmt(project: str | None, since: datetime | None):
    """One row per evaluation instant, ready for :func:`cluster_eval_runs`.

    This is the reduction that keeps the fold cheap: 248 eval rows become 31
    rows, one per evaluated trace, before any Python touches them.
    """
    degraded = _degraded_expr()
    stmt = select(
        EvalResultModel.evaluated_at.label("evaluated_at"),
        # The ids travel, not a count: only the fold can tell whether the same
        # trace turns up again later inside the same run.
        func.array_agg(EvalResultModel.trace_id.distinct()).label("trace_ids"),
        func.sum(EvalResultModel.score).label("score_sum"),
        func.count().label("score_count"),
        func.sum(case((degraded, 1), else_=0)).label("degraded"),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since)
    return stmt.group_by(EvalResultModel.evaluated_at).order_by(
        EvalResultModel.evaluated_at.asc()
    )


def _metric_health_stmt(project: str | None, since: datetime | None):
    """Per-metric distribution stats.

    Degraded rows are excluded from ``mean``/``std``/``pass_rate`` and counted
    separately. The judge fails closed to 0.0, so folding a timed-out API call
    into the mean is what turned one bad call into a regression headline.
    """
    degraded = _degraded_expr()
    scored = ~degraded
    stmt = select(
        EvalResultModel.metric_name,
        EvalResultModel.metric_type,
        func.avg(case((scored, EvalResultModel.score))).label("mean_score"),
        func.stddev_samp(case((scored, EvalResultModel.score))).label("std"),
        func.avg(
            case(
                (scored & EvalResultModel.passed, 1.0),
                (scored, 0.0),
            )
        ).label("pass_rate"),
        func.max(EvalResultModel.threshold).label("threshold"),
        func.sum(case((scored, 1), else_=0)).label("count"),
        func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
            "failed"
        ),
        func.sum(case((degraded, 1), else_=0)).label("degraded"),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since)
    return stmt.group_by(
        EvalResultModel.metric_name, EvalResultModel.metric_type
    ).order_by(EvalResultModel.metric_name.asc())


def _score_buckets_stmt(project: str | None, since: datetime | None):
    """Score histogram at 0.1 width, per metric, excluding degraded rows."""
    bucket = (func.floor(EvalResultModel.score * 10.0) / 10.0).label("bucket")
    stmt = select(
        EvalResultModel.metric_name,
        bucket,
        func.count().label("count"),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since).where(~_degraded_expr())
    return stmt.group_by(EvalResultModel.metric_name, bucket).order_by(
        EvalResultModel.metric_name.asc(), bucket.asc()
    )


def _evaluated_traces_stmt(project: str | None, since: datetime | None):
    """How many traces were measured, and how many of those measurements broke.

    Counts *traces*, not eval rows: 31 traces across 8 metrics is 248 rows,
    and measurement health is a statement about traces.
    """
    degraded = _degraded_expr()
    stmt = select(
        func.count(EvalResultModel.trace_id.distinct()).label("evaluated"),
        func.count(
            case((degraded, EvalResultModel.trace_id)).distinct()
        ).label("degraded"),
    ).select_from(EvalResultModel)
    return _scope_evals(stmt, project, since)


# ---------------------------------------------------------------------------
# Gate verdict, computed on the fly
# ---------------------------------------------------------------------------
#
# Regression results are never persisted. There is no ``RegressionResult`` in
# ``db/models.py``, and the ORM ``Baseline`` has no readers anywhere in the
# application -- the CLI computes verdicts against JSON files, prints them and
# throws them away. So the largest card on the Overview has to recompute the
# verdict per request from ``baselines/*.json`` plus candidate scores out of
# Postgres. That is cheap (a t-test over a few dozen floats) and it avoids a
# table and a migration, which matters because ``versions/`` is empty and
# there is no working migration path.


def _candidate_scores_stmt(project: str | None, since: datetime | None):
    """Per-metric candidate scores for the gate.

    Degraded rows are excluded: the judge fails closed to 0.0, and feeding a
    timed-out API call into a t-test is how a broken measurement becomes a
    regression headline.
    """
    stmt = select(
        EvalResultModel.metric_name, EvalResultModel.score
    ).select_from(EvalResultModel)
    return _scope_evals(stmt, project, since).where(~_degraded_expr())


def _load_baselines(project: str | None, directory: Path) -> dict[str, Baseline]:
    """Load the newest pinned baselines for ``project`` from a directory.

    Several baseline files can name the same project -- they are successive
    pinning sessions. The newest ``created_at`` wins, so the gate compares
    against whatever was pinned last rather than an arbitrary filename order.
    A file that will not parse is skipped with a warning: a corrupt baseline
    must cost you the verdict card, not the whole page.
    """
    directory = Path(directory)
    if project is None or not directory.is_dir():
        return {}

    newest: dict[str, Baseline] = {}
    for path in sorted(directory.glob("*.json")):
        try:
            parsed = baselines_from_json(path.read_text())
        except Exception as exc:  # unreadable/corrupt/foreign schema
            logger.warning("Skipping baseline file %s: %s", path, exc)
            continue
        for name, baseline in parsed.items():
            if baseline.project != project:
                continue
            current = newest.get(name)
            if current is None or baseline.created_at > current.created_at:
                newest[name] = baseline
    return newest


def _gate_payload(
    baselines: dict[str, Baseline],
    scores_by_metric: dict[str, list[float]],
    cfg: RegressionConfig | None = None,
) -> list[dict]:
    """Run the pure detector over each baselined metric.

    Metrics with a baseline but no candidate scores are reported with
    ``comparable: false`` rather than dropped, so the card can say "not
    assessed this run" instead of silently omitting a metric. Treating a
    missing sample as a 0.0 drop would invent a regression.
    """
    cfg = cfg or RegressionConfig()
    rows: list[dict] = []
    for name in sorted(baselines):
        baseline = baselines[name]
        scores = scores_by_metric.get(name) or []
        if not scores:
            rows.append(
                {
                    "metric_name": name,
                    "is_regression": False,
                    "comparable": False,
                    "baseline_mean": baseline.mean,
                    "candidate_mean": None,
                    "delta": None,
                    "p_value": None,
                    "cohens_d": None,
                    "t_statistic": None,
                    "baseline_n": baseline.sample_size,
                    "candidate_n": 0,
                    "reason": (
                        f"No candidate scores for '{name}' in this window — "
                        f"not assessed."
                    ),
                }
            )
            continue
        result = detect_regression(baseline, scores, cfg)
        rows.append(
            {
                "metric_name": name,
                "is_regression": result.is_regression,
                "comparable": True,
                "baseline_mean": result.baseline_mean,
                "candidate_mean": result.candidate_mean,
                "delta": result.delta,
                "p_value": result.p_value,
                "cohens_d": result.cohens_d,
                "t_statistic": result.t_statistic,
                "baseline_n": baseline.sample_size,
                "candidate_n": len(scores),
                "reason": result.reason,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Payload assembly
# ---------------------------------------------------------------------------


def _optional_float(value) -> float | None:
    return float(value) if value is not None else None


def _metric_health_payload(
    metric_rows: Sequence[tuple], ci_block_by_metric: dict[str, bool]
) -> list[dict]:
    """Shape per-metric rows, marking which ones actually moved.

    ``has_variance`` is what routes a metric to the distribution register
    versus the ceiling strip. A NULL std means one observation -- "cannot
    tell", which is not the same as "perfectly stable", and both are a long
    way from healthy. ``ci_block`` falls back to ``True`` because that is
    ``MetricConfig``'s default: a metric the config no longer names must not
    quietly stop blocking.
    """
    rows = []
    for (
        name,
        metric_type,
        mean_score,
        std,
        pass_rate,
        threshold,
        count,
        failed,
        degraded,
    ) in metric_rows:
        std_value = _optional_float(std)
        rows.append(
            {
                "metric_name": name,
                "metric_type": metric_type,
                "ci_block": ci_block_by_metric.get(name, True),
                "mean_score": _optional_float(mean_score),
                "std": std_value,
                "pass_rate": _optional_float(pass_rate),
                "threshold": _optional_float(threshold),
                "count": int(count or 0),
                "failed": int(failed or 0),
                "degraded": int(degraded or 0),
                "has_variance": std_value is not None and std_value > 0.0,
            }
        )
    return rows


def _analytics_payload(
    project: str | None,
    days: int | None,
    generated_at: datetime,
    trace_totals: tuple,
    volume_rows: Sequence[tuple],
    timeline_rows: Sequence[tuple],
    metric_rows: Sequence[tuple],
    bucket_rows: Sequence[tuple],
    evaluated_row: tuple,
    ci_block_by_metric: dict[str, bool],
    gate: list[dict] | None = None,
) -> dict:
    """Assemble the analytics response from already-fetched aggregates.

    Split out from the endpoint so every derivation below is testable without
    a database.
    """
    traces, tokens, cost_usd = trace_totals
    evaluated, degraded_traces = evaluated_row
    traces = int(traces or 0)
    evaluated = int(evaluated or 0)
    degraded_traces = int(degraded_traces or 0)

    runs = cluster_eval_runs(timeline_rows)
    metrics = _metric_health_payload(metric_rows, ci_block_by_metric)

    # Outcome counts are mutually exclusive: a degraded row is a failed
    # measurement and is deliberately kept out of ``failed``.
    total_rows = sum(m["count"] for m in metrics)
    failed_rows = sum(m["failed"] for m in metrics)
    degraded_rows = sum(m["degraded"] for m in metrics)

    volume = [
        {
            "day": day.date().isoformat() if day is not None else None,
            "total": int(total or 0),
            "ok": int(ok or 0),
            "error": int(error or 0),
        }
        for day, total, ok, error in volume_rows
    ]

    return {
        "project": project,
        "days": days,
        "generated_at": generated_at.isoformat(),
        "totals": {
            "traces": traces,
            "eval_runs": len(runs),
            # A trace whose only measurement broke is not "scored", and a
            # trace nobody evaluated is not "passing" -- it is pending.
            "scored": evaluated - degraded_traces,
            "degraded": degraded_traces,
            "pending": traces - evaluated,
            "tokens": int(tokens) if tokens is not None else None,
            "cost_usd": _optional_float(cost_usd),
        },
        "trace_volume": volume,
        "eval_runs": [
            {
                "run_at": run["run_at"].isoformat(),
                "trace_count": run["trace_count"],
                "mean_score": run["mean_score"],
                "degraded": run["degraded"],
            }
            for run in runs
        ],
        "metric_health": metrics,
        "score_buckets": [
            {
                "metric_name": name,
                "bucket": float(bucket),
                "count": int(count),
            }
            for name, bucket, count in bucket_rows
        ],
        "outcome_split": {
            "passed": total_rows - failed_rows,
            "failed": failed_rows,
            "degraded": degraded_rows,
        },
        "status_split": {
            "ok": sum(v["ok"] for v in volume),
            "error": sum(v["error"] for v in volume),
        },
        "gate": gate or [],
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


def _window_start(days: int, now: datetime) -> datetime | None:
    """Resolve the ``days`` parameter to a cutoff, or ``None`` for all history."""
    return None if days <= 0 else now - timedelta(days=days)


def _ci_block_by_metric() -> dict[str, bool]:
    """Map metric name -> whether it blocks CI, read from the active config.

    ``ci_block`` lives on ``MetricConfig`` and has never been serialised, so
    the dashboard has no way to tell a blocking metric from an advisory one.
    An unreadable config returns empty rather than raising: this decorates the
    page, and losing it must not blank the screen.
    """
    try:
        config = load_config(settings.eval_config_path)
    except Exception as exc:  # missing/invalid config -- degrade, don't 500
        logger.warning("Could not read eval config for ci_block: %s", exc)
        return {}
    return {m.name: m.ci_block for m in config.metrics}


@router.get("/evals/analytics")
async def get_evals_analytics(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    days: int = Query(default=30, ge=0, le=3650),
) -> dict:
    """Everything the Overview page needs, aggregated in SQL, in one call.

    ``days=0`` means all history. ``project`` is optional because the
    dashboard's project switcher has an "All projects" state and the overview
    must not 422 on first render; an unknown project returns zeroes, not a 404.
    """
    now = datetime.now(UTC)
    since = _window_start(days, now)

    trace_totals = (
        await db.execute(_trace_totals_stmt(project, since))
    ).one()
    volume_rows = (await db.execute(_trace_volume_stmt(project, since))).all()
    timeline_rows = (await db.execute(_eval_timeline_stmt(project, since))).all()
    metric_rows = (await db.execute(_metric_health_stmt(project, since))).all()
    bucket_rows = (await db.execute(_score_buckets_stmt(project, since))).all()
    evaluated_row = (
        await db.execute(_evaluated_traces_stmt(project, since))
    ).one()

    # The candidate sample is the *latest run*, not the whole window: the gate
    # asks "did this run regress against the pinned baseline", and pooling
    # several runs would blur exactly the change it is looking for.
    runs = cluster_eval_runs(timeline_rows)
    gate: list[dict] = []
    baselines = _load_baselines(project, Path(settings.baselines_path))
    if baselines:
        candidate_since = runs[-1]["run_at"] if runs else None
        scores_by_metric: dict[str, list[float]] = {}
        if runs:
            candidate_rows = (
                await db.execute(
                    _candidate_scores_stmt(project, candidate_since)
                )
            ).all()
            for metric_name, score in candidate_rows:
                scores_by_metric.setdefault(metric_name, []).append(float(score))
        gate = _gate_payload(baselines, scores_by_metric)

    return _analytics_payload(
        project=project,
        days=days,
        generated_at=now,
        trace_totals=tuple(trace_totals),
        volume_rows=volume_rows,
        timeline_rows=timeline_rows,
        metric_rows=metric_rows,
        bucket_rows=bucket_rows,
        evaluated_row=tuple(evaluated_row),
        ci_block_by_metric=_ci_block_by_metric(),
        gate=gate,
    )
