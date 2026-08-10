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
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentproof_server.config import settings
from agentproof_server.db.models import EvalResult as EvalResultModel
from agentproof_server.db.models import Trace as TraceModel
from agentproof_server.db.session import get_db
from agentproof_server.eval_engine import details as details_shape
from agentproof_server.eval_engine.baseline import baselines_from_json
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.models import Baseline, RegressionConfig
from agentproof_server.eval_engine.regression import detect_regression
from agentproof_server.provenance import exclude_generated, is_generated

logger = logging.getLogger("agentproof_server")

router = APIRouter()

# Rows evaluated less than this far apart belong to the same run.
# ``runner.py:137`` takes ``now`` once per trace, so a 13-trace batch lands as
# 13 distinct timestamps a few seconds apart. Grouping by equality reported 13
# runs where there were 2.
RUN_GAP_SECONDS = 120


# ``is_degraded`` and the prose extraction live in ``eval_engine.details``,
# the one module that knows the shape of the blob. Re-exported here because
# this module's SQL predicate below must mirror it exactly, and the two want
# to be read together.
is_degraded = details_shape.is_degraded


# Metric type -> the group whose panel and units it shares.
#
# A judge score (graded 0-1, +/-0.2 noise), a security verdict (0/1 per span,
# min to the trace) and a budget check (binary compliance) are three different
# quantities. Averaging across them was measured on the synthetic corpus: a
# 0.15 drift in the judged metrics rendered as a flat line because six metrics
# pinned at 1.000 diluted it. The mapping lives server-side so the client is
# not re-deriving the taxonomy.
METRIC_GROUPS = {
    "llm_judge": "quality",
    "security": "safety",
    "deterministic": "budgets",
}

# ``composite`` exists in the type system with no members and no chart form of
# its own, so it lands here with anything else unrecognised rather than being
# quietly folded into a group whose units it does not share.
UNGROUPED = "other"


def metric_group(metric_type: str | None) -> str:
    """Which panel a metric belongs to, derived from its type."""
    return METRIC_GROUPS.get(metric_type or "", UNGROUPED)


def cluster_eval_runs(
    rows: Sequence[tuple[datetime, str, Sequence[str], float, int, int]],
    gap_seconds: int = RUN_GAP_SECONDS,
) -> list[dict]:
    """Fold per-timestamp eval aggregates into runs, splitting on time gaps.

    ``rows`` are ``(evaluated_at, metric_type, trace_ids, score_sum,
    score_count, degraded)`` ordered oldest-first -- SQL has already reduced
    every eval row down to one row per evaluation instant per metric type.

    ``trace_count`` is *distinct* traces within the run, which is why the ids
    travel rather than a count: re-evaluating the same batch inside one window
    reported 26 traces for a project holding 25, and one trace measured by two
    metric types now arrives as two rows. Across runs the ids are not deduped
    -- re-evaluating a trace next week is a real data point for that run.

    ``group_means`` is one row-weighted mean per group (``score_sum /
    score_count``), never a pooled figure across groups. Weighting is by eval
    row, not by trace: a trace evaluated on 8 metrics must not carry the same
    weight as one evaluated on 2. Every group seen anywhere in the input gets
    a key in every run so the client's series stay aligned; a group that run
    did not measure is ``None``, because a zero would draw a cliff that never
    happened.
    """
    runs: list[dict] = []
    current: dict | None = None
    previous_at: datetime | None = None
    groups_seen: set[str] = set()

    for evaluated_at, metric_type, trace_ids, score_sum, score_count, degraded in rows:
        starts_new_run = (
            current is None
            or previous_at is None
            or (evaluated_at - previous_at).total_seconds() > gap_seconds
        )
        if starts_new_run:
            current = {
                "run_at": evaluated_at,
                "_trace_ids": set(),
                "_by_group": {},
                "degraded": 0,
            }
            runs.append(current)
        assert current is not None  # narrowed by the branch above

        group = metric_group(metric_type)
        groups_seen.add(group)
        totals = current["_by_group"].setdefault(group, [0.0, 0])
        totals[0] += float(score_sum or 0.0)
        totals[1] += int(score_count or 0)

        current["_trace_ids"].update(trace_ids or ())
        current["degraded"] += int(degraded or 0)
        previous_at = evaluated_at

    for run in runs:
        by_group = run.pop("_by_group")
        run["trace_count"] = len(run.pop("_trace_ids"))
        run["group_means"] = {}
        for group in sorted(groups_seen):
            total, count = by_group.get(group, (0.0, 0))
            run["group_means"][group] = (total / count) if count else None
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

    ``$.**`` is the recursive member accessor: judged metrics put ``per_span``
    at the top level, ``dual``-mode security metrics nest it under ``llm``.
    Against the live corpus the top-level-only path matched 300 of
    ``injection_resistance``'s 336 rows -- the missing 36 were every real
    dual-mode row, exempt from degraded detection entirely. It stays scoped to
    ``per_span`` rather than matching ``error`` anywhere, so an unrelated key
    cannot erase a real finding from the mean.
    """
    from sqlalchemy import false, literal_column

    return func.coalesce(
        or_(
            func.jsonb_path_exists(
                EvalResultModel.details, literal_column("'$.**.per_span[*].error'")
            ),
            func.jsonb_path_exists(
                EvalResultModel.details,
                literal_column("'$.**.per_span[*].refusal'"),
            ),
        ),
        false(),
    )


def _scope_traces(stmt, project: str | None, since: datetime | None):
    """Filter a traces-rooted statement by project and time window.

    With no project named, "all" means all *measured* projects -- see
    ``provenance``. Pooling a generated corpus into an unlabelled total is the
    one thing no caption can undo.
    """
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    stmt = exclude_generated(stmt, project, TraceModel)
    if since is not None:
        stmt = stmt.where(TraceModel.created_at >= since)
    return stmt


def _scope_evals(stmt, project: str | None, since: datetime | None):
    """Filter an eval-rooted statement by project and time window.

    Eval rows carry no project, so scoping one means joining the owning trace.
    The join is now unconditional: excluding generated corpora from the
    unscoped case needs the project column too, and the previous version
    skipped the join precisely when no project was named -- which is the case
    that pooled fabricated rows into the default view.

    The window applies to ``evaluated_at``: an old trace evaluated today
    belongs in today's numbers.
    """
    stmt = stmt.join(TraceModel, EvalResultModel.trace_id == TraceModel.trace_id)
    if project is not None:
        stmt = stmt.where(TraceModel.project == project)
    stmt = exclude_generated(stmt, project, TraceModel)
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
    """One row per evaluation instant per metric type, for :func:`cluster_eval_runs`.

    This is the reduction that keeps the fold cheap: 248 eval rows become a
    few dozen before any Python touches them. The metric type is a group-by
    key because run means are per group -- a judge score and a breach flag do
    not share a unit.

    Degraded rows are excluded from the score sums exactly as
    ``_metric_health_stmt`` excludes them. The judge fails closed to 0.0, so
    without this a run of six broken API calls reads as a 0.750 quality score.
    They stay in ``degraded`` where they can be reported as what they are.
    """
    degraded = _degraded_expr()
    scored = ~degraded
    stmt = select(
        EvalResultModel.evaluated_at.label("evaluated_at"),
        EvalResultModel.metric_type.label("metric_type"),
        # The ids travel, not a count: only the fold can tell whether the same
        # trace turns up again later inside the same run.
        func.array_agg(EvalResultModel.trace_id.distinct()).label("trace_ids"),
        func.sum(case((scored, EvalResultModel.score), else_=0.0)).label(
            "score_sum"
        ),
        func.sum(case((scored, 1), else_=0)).label("score_count"),
        func.sum(case((degraded, 1), else_=0)).label("degraded"),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since)
    return stmt.group_by(
        EvalResultModel.evaluated_at, EvalResultModel.metric_type
    ).order_by(EvalResultModel.evaluated_at.asc())


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


def _metric_runs_stmt(
    project: str | None,
    since: datetime | None,
    boundaries: Sequence[datetime],
):
    """Per-metric mean per run, bucketed in SQL by the run boundaries.

    Runs are gap-clusters of per-trace timestamps, so only the Python fold
    knows where they start. Rather than pull one row per eval row back and
    reduce it client-side -- the thing this module exists to avoid -- the
    boundaries are pushed back into SQL as a CASE, and the aggregate returns
    ``runs x metrics`` rows. On the 300-trace corpus that is 72 rows instead
    of 2400.

    Returns ``None`` when nothing ran: a CASE with no branches is not valid
    SQL, and the caller should skip the round trip rather than build one.
    """
    if not boundaries:
        return None

    # Row belongs to run i when it falls before run i+1 starts. The first
    # boundary is the earliest timestamp in scope, so nothing precedes it.
    branches = [
        (EvalResultModel.evaluated_at < boundaries[i + 1], i)
        for i in range(len(boundaries) - 1)
    ]
    run_index = (
        case(*branches, else_=len(boundaries) - 1)
        if branches
        else literal(0)
    ).label("run_index")

    scored = ~_degraded_expr()
    stmt = select(
        run_index,
        EvalResultModel.metric_name,
        func.avg(case((scored, EvalResultModel.score))).label("mean_score"),
        func.sum(case((scored, 1), else_=0)).label("count"),
        func.sum(case((scored & ~EvalResultModel.passed, 1), else_=0)).label(
            "failed"
        ),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since)
    return stmt.group_by(run_index, EvalResultModel.metric_name).order_by(
        run_index.asc(), EvalResultModel.metric_name.asc()
    )


def _score_buckets_stmt(project: str | None, since: datetime | None):
    """Score histogram at 0.1 width, per metric, excluding degraded rows.

    ``bucket`` is the lower edge of a 0.1-wide bin, so the last bin is
    0.9-1.0 and a perfect 1.0 belongs in it. Without the clamp,
    ``floor(1.0 * 10) / 10`` opens a zero-width bin at 1.0 whose bar renders
    off the end of a 0->1 track -- on the demo data that hid 34 of 35
    observations behind the clip.
    """
    bucket = func.least(
        func.floor(EvalResultModel.score * 10.0) / 10.0, 0.9
    ).label("bucket")
    stmt = select(
        EvalResultModel.metric_name,
        bucket,
        func.count().label("count"),
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since).where(~_degraded_expr())
    return stmt.group_by(EvalResultModel.metric_name, bucket).order_by(
        EvalResultModel.metric_name.asc(), bucket.asc()
    )


def _trace_health_stmt(project: str | None, since: datetime | None):
    """Partition the traces in this window by whether they were measured.

    Counts *traces*, not eval rows: 31 traces across 8 metrics is 248 rows,
    and measurement health is a statement about traces.

    Rooted at ``traces`` and scoped by the trace window, deliberately. The
    previous version counted evaluated traces from the eval side and derived
    ``pending`` by subtraction, which mixed two windows -- traces filtered on
    ``created_at``, eval rows on ``evaluated_at``. Measured on the live corpus:
    19 traces were evaluated inside the window but created before it, so
    ``evaluated`` (90) exceeded ``traces`` (84) and the card rendered
    "-6 pending". Windowing the trace and taking all of its measurements makes
    the three states a genuine partition at every input.

    The join is an outer join because ``pending`` is otherwise unrepresentable:
    a trace with no eval row would drop out of an inner join entirely.
    """
    degraded = _degraded_expr()
    per_trace = (
        select(
            TraceModel.id.label("trace_pk"),
            func.bool_or(EvalResultModel.id.isnot(None)).label("has_any"),
            # ``case`` rather than a bare boolean AND: with no eval row the
            # degraded predicate is NULL, and NULL is not false -- it would
            # poison ``bool_or`` instead of contributing nothing.
            func.bool_or(
                case((EvalResultModel.id.isnot(None) & ~degraded, True), else_=False)
            ).label("has_usable"),
            func.bool_or(
                case((EvalResultModel.id.isnot(None) & degraded, True), else_=False)
            ).label("has_broken"),
        )
        .select_from(TraceModel)
        .outerjoin(EvalResultModel, EvalResultModel.trace_id == TraceModel.trace_id)
    )
    per_trace = (
        _scope_traces(per_trace, project, since).group_by(TraceModel.id).subquery()
    )

    return select(
        func.count().filter(per_trace.c.has_usable).label("scored"),
        func.count()
        .filter(~per_trace.c.has_usable & per_trace.c.has_any)
        .label("unmeasurable"),
        func.count().filter(~per_trace.c.has_any).label("pending"),
        # Overlaps ``scored`` on purpose and is never subtracted from it: a
        # trace can hold a usable measurement *and* a broken one, and both
        # facts are true at once.
        func.count().filter(per_trace.c.has_broken).label("degraded_traces"),
    ).select_from(per_trace)


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
                "group": metric_group(metric_type),
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
    trace_health_row: tuple,
    ci_block_by_metric: dict[str, bool],
    metric_run_rows: Sequence[tuple] = (),
    gate: list[dict] | None = None,
) -> dict:
    """Assemble the analytics response from already-fetched aggregates.

    Split out from the endpoint so every derivation below is testable without
    a database.
    """
    traces, tokens, cost_usd = trace_totals
    scored, unmeasurable, pending, degraded_traces = (
        int(v or 0) for v in trace_health_row
    )
    traces = int(traces or 0)

    runs = cluster_eval_runs(timeline_rows)
    metrics = _metric_health_payload(metric_rows, ci_block_by_metric)

    # A metric absent from a run stays absent rather than becoming a null:
    # the client reads "no previous value" from a missing key, and a null
    # would have to be told apart from a genuinely null mean anyway.
    means_by_run: dict[int, dict[str, float | None]] = {}
    for run_index, metric_name, mean_score, _count, _failed in metric_run_rows:
        means_by_run.setdefault(int(run_index), {})[metric_name] = _optional_float(
            mean_score
        )

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
        # Whether these figures were authored rather than measured. Travels
        # with the payload so the client cannot disagree with the server about
        # what it is rendering, and so the answer survives any future change to
        # which corpora are generated.
        "generated": is_generated(project),
        "totals": {
            "traces": traces,
            "eval_runs": len(runs),
            # Three mutually exclusive states that always sum to ``traces``:
            # at least one usable measurement, measurements that all broke,
            # and never measured at all. Computed in SQL as a partition rather
            # than by subtracting differently-scoped counts.
            "scored": scored,
            "unmeasurable": unmeasurable,
            "pending": pending,
            # Reported alongside, not subtracted: overlaps ``scored``.
            "degraded_traces": degraded_traces,
            "tokens": int(tokens) if tokens is not None else None,
            "cost_usd": _optional_float(cost_usd),
        },
        "trace_volume": volume,
        "eval_runs": [
            {
                "run_at": run["run_at"].isoformat(),
                "trace_count": run["trace_count"],
                # Per group, never pooled: see cluster_eval_runs.
                "group_means": run["group_means"],
                "metric_means": means_by_run.get(index, {}),
                "degraded": run["degraded"],
            }
            for index, run in enumerate(runs)
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
# Metric drill-down
# ---------------------------------------------------------------------------


# Judge prose, from the shape module. These strings have been written to
# ``details`` since the judge shipped and displayed nowhere until the
# drill-down surfaced them.
_reasoning_from = details_shape.reasoning_records


def _metric_health_one_stmt(
    metric_name: str, project: str | None, since: datetime | None
):
    """:func:`_metric_health_stmt` narrowed to a single metric."""
    return _metric_health_stmt(project, since).where(
        EvalResultModel.metric_name == metric_name
    )


def _metric_buckets_one_stmt(
    metric_name: str, project: str | None, since: datetime | None
):
    return _score_buckets_stmt(project, since).where(
        EvalResultModel.metric_name == metric_name
    )


def _worst_rows_stmt(
    metric_name: str,
    project: str | None,
    since: datetime | None,
    limit: int,
):
    """The lowest-scoring measurements of one metric, worst first.

    Degraded rows are excluded. The judge fails closed to 0.0, so they sort
    straight to the bottom and would fill the list with broken measurements
    instead of the lowest real scores -- the opposite of what a reader
    clicking "worst traces" is looking for.
    """
    stmt = select(
        EvalResultModel.trace_id,
        EvalResultModel.span_id,
        EvalResultModel.score,
        EvalResultModel.passed,
        EvalResultModel.evaluated_at,
        EvalResultModel.explanation,
        EvalResultModel.details,
    ).select_from(EvalResultModel)
    stmt = _scope_evals(stmt, project, since).where(
        EvalResultModel.metric_name == metric_name, ~_degraded_expr()
    )
    return stmt.order_by(EvalResultModel.score.asc()).limit(limit)


def _metric_detail_payload(
    metric_name: str,
    project: str | None,
    days: int | None,
    health_row: tuple | None,
    bucket_rows: Sequence[tuple],
    run_rows: Sequence[tuple],
    worst_rows: Sequence[tuple],
    ci_block: bool,
) -> dict | None:
    """Assemble the drill-down, or ``None`` when the metric has no rows.

    Returning ``None`` rather than a payload of zeroes lets the route 404, so
    a typo in the URL is distinguishable from a metric that ran and passed.
    """
    if health_row is None:
        return None

    health = _metric_health_payload([health_row], {metric_name: ci_block})[0]

    return {
        "metric_name": metric_name,
        "metric_type": health["metric_type"],
        "group": health["group"],
        "ci_block": ci_block,
        "project": project,
        "days": days,
        "health": {
            key: health[key]
            for key in (
                "mean_score",
                "std",
                "pass_rate",
                "threshold",
                "count",
                "failed",
                "degraded",
                "has_variance",
            )
        },
        "buckets": [
            {"bucket": float(bucket), "count": int(count)}
            for bucket, count in bucket_rows
        ],
        "runs": [
            {
                "run_at": run_at.isoformat(),
                "mean_score": _optional_float(mean_score),
                "count": int(count or 0),
                "failed": int(failed or 0),
            }
            for run_at, mean_score, count, failed in run_rows
        ],
        "worst": [
            {
                "trace_id": trace_id,
                "span_id": span_id,
                "score": _optional_float(score),
                "passed": bool(passed),
                "evaluated_at": evaluated_at.isoformat() if evaluated_at else None,
                "explanation": explanation,
                "reasoning": _reasoning_from(details),
            }
            for (
                trace_id,
                span_id,
                score,
                passed,
                evaluated_at,
                explanation,
                details,
            ) in worst_rows
        ],
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


@router.get("/evals/metric/{metric_name}")
async def get_metric_detail(
    metric_name: str,
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    # Annotated rather than `= Query(...)`: the tests call these functions
    # directly, and a bare Query default arrives as a Query object instead of
    # an int the moment an argument is omitted.
    days: Annotated[int, Query(ge=0, le=3650)] = 30,
    worst: Annotated[int, Query(ge=1, le=100)] = 10,
) -> dict:
    """One metric in depth: distribution, run history, worst rows, judge prose.

    404s when the metric has no rows in scope. An unknown *project* returns
    zeroes elsewhere in this module because the dashboard's switcher can point
    at one legitimately; an unknown *metric* is a URL the reader typed or a
    link that rotted, and silently rendering an empty page hides that.
    """
    now = datetime.now(UTC)
    since = _window_start(days, now)

    health_row = (
        await db.execute(_metric_health_one_stmt(metric_name, project, since))
    ).first()
    if health_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No eval results for metric '{metric_name}' in this window.",
        )

    bucket_rows = (
        await db.execute(_metric_buckets_one_stmt(metric_name, project, since))
    ).all()
    worst_rows = (
        await db.execute(_worst_rows_stmt(metric_name, project, since, worst))
    ).all()

    # Run history reuses the analytics fold so a run means the same thing on
    # both pages -- gap-clustered, not one per evaluated_at.
    timeline_rows = (await db.execute(_eval_timeline_stmt(project, since))).all()
    runs = cluster_eval_runs(timeline_rows)
    run_stmt = _metric_runs_stmt(project, since, [r["run_at"] for r in runs])
    run_rows: list[tuple] = []
    if run_stmt is not None:
        for index, name, mean_score, count, failed in (
            await db.execute(run_stmt)
        ).all():
            if name == metric_name:
                run_rows.append(
                    (runs[int(index)]["run_at"], mean_score, count, failed)
                )

    payload = _metric_detail_payload(
        metric_name=metric_name,
        project=project,
        days=days,
        health_row=tuple(health_row),
        # The shared bucket statement carries the metric name it was filtered
        # by; the detail payload already knows which metric it is.
        bucket_rows=[(bucket, count) for _name, bucket, count in bucket_rows],
        run_rows=run_rows,
        worst_rows=worst_rows,
        ci_block=_ci_block_by_metric().get(metric_name, True),
    )
    assert payload is not None  # health_row is not None by the guard above
    return payload


@router.get("/evals/analytics")
async def get_evals_analytics(
    db: AsyncSession = Depends(get_db),
    project: str | None = None,
    days: Annotated[int, Query(ge=0, le=3650)] = 30,
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
    trace_health_row = (
        await db.execute(_trace_health_stmt(project, since))
    ).one()

    # The candidate sample is the *latest run*, not the whole window: the gate
    # asks "did this run regress against the pinned baseline", and pooling
    # several runs would blur exactly the change it is looking for.
    runs = cluster_eval_runs(timeline_rows)

    # Per-metric run history, bucketed by the boundaries the fold just found.
    metric_run_stmt = _metric_runs_stmt(
        project, since, [run["run_at"] for run in runs]
    )
    metric_run_rows = (
        (await db.execute(metric_run_stmt)).all() if metric_run_stmt is not None else []
    )

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
        trace_health_row=tuple(trace_health_row),
        ci_block_by_metric=_ci_block_by_metric(),
        metric_run_rows=metric_run_rows,
        gate=gate,
    )
