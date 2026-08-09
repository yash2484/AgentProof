# server/agentproof_server/scripts_pkg/synthetic_showcase.py
"""
Generate the ``synthetic-showcase`` project: an openly fabricated corpus.

**This data is not measured.** It exists because the real demo corpus is 25
traces across 4 runs, which is too thin to judge an analytics design against —
six of eight metrics never move and every trend panel is two points. The real
corpus is a byte-for-byte recording and stays untouched; both the README and
PROGRESS make that claim load-bearing, and mixing generated rows into it would
quietly destroy it.

Everything here is therefore:

- **Separate.** Its own project name, never baselined, never evaluated by the
  real CLI.
- **Labelled.** The project name says what it is, and the dashboard badges it.
- **Deterministic.** Same seed, same corpus, forever — a fabricated corpus that
  drifts between runs would silently rot every screenshot and every number in
  the docs.

The shape it produces on purpose:

- a **slow quality drift** rather than a step change, because a step is obvious
  from any single pair of runs while a drift is the thing a regression gate
  exists to catch;
- a scattering of **degraded judge calls**, so the "broken measurement is not a
  finding" path is exercised;
- **attacks that are resisted as well as landed**, so breach rates have a
  denominator;
- ``evaluated_at`` stamped **per trace**, mirroring ``runner.py``, so the
  analytics gap-clustering is exercised rather than bypassed.

Seed it into a running database with::

    python -m agentproof_server.scripts_pkg.synthetic_showcase
"""

from __future__ import annotations

import argparse
import asyncio
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

PROJECT = "synthetic-showcase"

DEFAULT_SEED = 20260809
DEFAULT_TRACES = 300
DEFAULT_DAYS = 180
DEFAULT_RUNS = 9

# Mirrors the real agentproof.yaml so the dashboard's grouping, thresholds and
# ci_block treatment all behave identically against this project.
METRICS: tuple[tuple[str, str, float], ...] = (
    ("faithfulness", "llm_judge", 0.7),
    ("relevance", "llm_judge", 0.6),
    ("injection_resistance", "security", 0.9),
    ("data_exfiltration", "security", 0.8),
    ("tool_misuse", "security", 0.8),
    ("latency_budget", "deterministic", 0.7),
    ("cost_budget", "deterministic", 0.7),
    ("tool_allowlist", "deterministic", 0.7),
)

# Quality at the start of the window and at the end of it.
DRIFT = {
    "faithfulness": (0.95, 0.78),
    "relevance": (0.93, 0.80),
}

SCENARIOS = (
    "grounded-answer",
    "multi-hop-lookup",
    "summarise-sources",
    "unanswerable-query",
    "tool-assisted-lookup",
    "partially-covered",
)

# Reasoning banded by score, because the drill-down now displays these strings
# next to the number they explain. A 0.6 labelled "every claim traces to a
# retrieved chunk" is a corpus that contradicts itself on screen, which is
# worse than no prose at all -- the corpus exists to stand in for real data,
# and real judge prose agrees with the score it accompanies.
_JUDGE_REASONS: tuple[tuple[float, tuple[str, ...]], ...] = (
    (
        0.9,
        (
            "Every claim traces to a retrieved chunk.",
            "Correctly declines to answer beyond the provided sources.",
            "Fully grounded; no assertion goes past the context.",
        ),
    ),
    (
        0.7,
        (
            "Mostly grounded; one figure is not in the sources.",
            "Largely supported, though one inference goes past what the context states.",
            "Grounded overall, with a minor extrapolation in the closing sentence.",
        ),
    ),
    (
        0.5,
        (
            "The answer restates the question without adding grounded detail.",
            "Several claims are plausible inferences rather than direct support.",
            "Reasonable but speculative: the context does not address the core question.",
        ),
    ),
    (
        0.0,
        (
            "Two claims appear nowhere in the retrieved context.",
            "The answer asserts specifics the sources never mention.",
            "Substantially unsupported — the context contradicts the main claim.",
        ),
    ),
)


def _reason_for(score: float) -> str:
    """A reasoning string that agrees with the score it explains.

    Chosen from the score itself rather than by drawing on the RNG. Prose is
    cosmetic and must not move the numbers: ``random.choice`` consumes a
    variable number of bits with the length of the sequence, so picking from a
    3-option band instead of the old flat 5-tuple shifted the whole downstream
    stream and quietly flattened the drift from 0.15 to 0.08 — the corpus's
    entire reason for existing, weakened by a copy change.
    """
    for floor, options in _JUDGE_REASONS:
        if score >= floor:
            return options[int(score * 1000) % len(options)]
    return _JUDGE_REASONS[-1][1][0]


@dataclass
class SyntheticEval:
    """One fabricated eval row, shaped like the real ``eval_results``."""

    metric_name: str
    metric_type: str
    score: float
    threshold: float
    passed: bool
    explanation: str
    details: dict
    evaluated_at: datetime


@dataclass
class SyntheticTrace:
    trace_id: str
    project: str
    name: str
    created_at: datetime
    status: str
    total_latency_ms: int
    total_tokens: int
    total_cost_usd: float
    spans: list[dict]
    evals: list[SyntheticEval] = field(default_factory=list)


@dataclass
class Corpus:
    traces: list[SyntheticTrace]
    run_starts: list[datetime]


def run_schedule(
    start: datetime, end: datetime, runs: int
) -> list[datetime]:
    """Evenly spaced evaluation instants across the window.

    Runs fire at the *end* of each equal slice, not the start. A run at the
    window's first instant has no traces behind it yet, so it would evaluate an
    empty cohort and the corpus would silently ship one fewer run than asked
    for.

    Spacing is days wide, so consecutive runs sit far beyond the analytics
    layer's 120-second clustering gap. Runs closer than that would merge into
    one and the corpus would misreport its own shape.
    """
    if runs <= 1:
        return [end]
    step = (end - start) / runs
    return [start + step * (i + 1) for i in range(runs)]


def drifted_mean(progress: float, start: float, end: float) -> float:
    """Linear interpolation from ``start`` to ``end`` over ``progress`` 0→1.

    Deliberately linear. A curve would let the drift hide in one segment and
    look like a step, which is the shape this corpus is meant *not* to have.
    """
    progress = max(0.0, min(1.0, progress))
    return start + (end - start) * progress


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, round(value, 4)))


def _judge_eval(
    rng: random.Random,
    metric: str,
    threshold: float,
    progress: float,
    at: datetime,
) -> SyntheticEval:
    """A judged metric: drifting mean, per-trace noise, occasional breakage."""
    # ~2% of judge calls break. They fail closed to 0.0, which is exactly why
    # the analytics layer has to tell them apart from a real low score.
    if rng.random() < 0.02:
        broken = (
            {"error": "APIError: 529 overloaded_error"}
            if rng.random() < 0.5
            else {"refusal": True}
        )
        return SyntheticEval(
            metric_name=metric,
            metric_type="llm_judge",
            score=0.0,
            threshold=threshold,
            passed=False,
            explanation=f"{metric}: judge call failed or was refused → scored 0.0",
            details={"per_span": [{"span_id": "s-writer", **broken}], "aggregation": "min"},
            evaluated_at=at,
        )

    start, end = DRIFT[metric]
    score = _clamp(rng.gauss(drifted_mean(progress, start, end), 0.12))
    return SyntheticEval(
        metric_name=metric,
        metric_type="llm_judge",
        score=score,
        threshold=threshold,
        passed=score >= threshold,
        explanation=f"{metric}: min of 1 judged span = {score:.3f}",
        details={
            "per_span": [
                {
                    "span_id": "s-writer",
                    "score": score,
                    "reasoning": _reason_for(score),
                }
            ],
            "aggregation": "min",
        },
        evaluated_at=at,
    )


def _security_eval(
    rng: random.Random, metric: str, threshold: float, at: datetime
) -> SyntheticEval:
    """A security metric: mostly clean, occasionally breached, always attributed."""
    if metric == "injection_resistance":
        # A quarter of runs are actually attacked. Recording the attempt even
        # when it is resisted is what gives a breach rate its denominator.
        attempted = rng.random() < 0.25
        breached = attempted and rng.random() < 0.06
        score = 0.0 if breached else 1.0
        details = {
            "injection_attempted": attempted,
            "per_span": [{"span_id": "s-writer", "score": score}],
            "mode": "dual",
        }
        explanation = (
            "Injected instruction was obeyed."
            if breached
            else "No injected instruction was followed."
        )
    else:
        breached = rng.random() < 0.015
        score = 0.0 if breached else 1.0
        details = {
            "per_span": [{"span_id": "s-writer", "score": score}],
            "mode": "heuristic",
        }
        explanation = (
            f"{metric}: unsafe span detected."
            if breached
            else f"{metric}: nothing flagged."
        )

    return SyntheticEval(
        metric_name=metric,
        metric_type="security",
        score=score,
        threshold=threshold,
        passed=score >= threshold,
        explanation=explanation,
        details=details,
        evaluated_at=at,
    )


def _deterministic_eval(
    rng: random.Random,
    metric: str,
    threshold: float,
    trace: SyntheticTrace,
    at: datetime,
) -> SyntheticEval:
    """A budget/contract check: binary, and it reports the real quantity.

    The measured value travels in ``details`` because "97% within budget" hides
    how close the other 3% ran — the panel needs the underlying number, not
    just the verdict.
    """
    # Both spellings, mirroring the real evaluators exactly. Guessing the
    # obvious names instead matched LatencyBudgetEvaluator's stable alias and
    # missed CostBudgetEvaluator's `total_cost_usd`, so the same quantity
    # arrived under different keys in the two projects — and a reader written
    # against one shape would have returned data for the fabricated corpus and
    # silently nothing for the real one. The corpus only works as a stand-in
    # while its shapes are the real shapes.
    if metric == "latency_budget":
        limit = 4000
        value = trace.total_latency_ms
        details = {
            "total_latency_ms": value,
            "latency_ms": value,
            "limit": limit,
        }
        within = value <= limit
    elif metric == "cost_budget":
        limit = 0.05
        value = trace.total_cost_usd
        details = {"total_cost_usd": value, "cost_usd": value, "limit": limit}
        within = value <= limit
    else:
        within = rng.random() > 0.01
        details = {
            "violations": [] if within else ["shell"],
            "allowed_tools": ["search", "fetch", "calculator"],
        }

    score = 1.0 if within else 0.0
    return SyntheticEval(
        metric_name=metric,
        metric_type="deterministic",
        score=score,
        threshold=threshold,
        passed=within,
        explanation=f"{metric}: {'within' if within else 'exceeds'} budget.",
        details=details,
        evaluated_at=at,
    )


def _spans(prefix: str, latency_ms: int, tokens: int, scenario: str) -> list[dict]:
    retrieval_ms = max(40, int(latency_ms * 0.2))
    return [
        {
            "span_id": f"{prefix}-retrieval",
            "span_type": "retrieval",
            "name": "retrieval",
            "latency_ms": retrieval_ms,
            "metadata": {"query": scenario.replace("-", " "), "top_k": 5},
        },
        {
            "span_id": f"{prefix}-writer",
            "span_type": "llm_call",
            "name": "writer",
            "latency_ms": latency_ms - retrieval_ms,
            "metadata": {
                "model": "claude-haiku-4-5",
                "total_tokens": tokens,
                "completion": f"[synthetic completion for {scenario}]",
            },
        },
    ]


def build_corpus(
    seed: int = DEFAULT_SEED,
    end: datetime | None = None,
    traces: int = DEFAULT_TRACES,
    days: int = DEFAULT_DAYS,
    runs: int = DEFAULT_RUNS,
) -> Corpus:
    """Build the whole fabricated corpus deterministically from ``seed``.

    ``end`` is a parameter rather than ``datetime.now()`` so the corpus is
    reproducible: the same seed and the same end instant always yield byte-
    identical output.
    """
    rng = random.Random(seed)
    end = end or datetime.now(UTC)
    start = end - timedelta(days=days)

    run_starts = run_schedule(start, end, runs)

    built: list[SyntheticTrace] = []
    for i in range(traces):
        # Traces are spread evenly, with jitter, so daily volume varies.
        offset = (days * (i + 0.5) / traces) + rng.uniform(-0.4, 0.4)
        created_at = start + timedelta(days=max(0.0, min(float(days), offset)))
        scenario = rng.choice(SCENARIOS)
        errored = rng.random() < 0.07
        latency_ms = int(rng.gauss(2200, 700))
        latency_ms = max(300, min(9000, latency_ms))
        tokens = int(rng.gauss(1400, 350))
        prefix = f"syn-{i:04d}"

        built.append(
            SyntheticTrace(
                trace_id=f"{PROJECT}-{i:04d}",
                project=PROJECT,
                name=scenario,
                created_at=created_at,
                status="error" if errored else "ok",
                total_latency_ms=latency_ms,
                total_tokens=max(200, tokens),
                total_cost_usd=round(max(200, tokens) * 0.000012, 6),
                spans=_spans(prefix, latency_ms, max(200, tokens), scenario),
            )
        )

    # Each run evaluates the traces created since the previous one — the way a
    # nightly eval job actually behaves.
    for index, run_at in enumerate(run_starts):
        window_start = run_starts[index - 1] if index else start
        cohort = [t for t in built if window_start <= t.created_at < run_at]
        progress = index / max(1, len(run_starts) - 1)

        for position, trace in enumerate(cohort):
            # Stamped per trace, exactly like runner.py. The clustering in the
            # analytics layer exists because of this; the corpus must reproduce
            # it rather than hand the code a tidy single timestamp.
            at = run_at + timedelta(seconds=position * 4)
            for metric, metric_type, threshold in METRICS:
                if metric_type == "llm_judge":
                    trace.evals.append(
                        _judge_eval(rng, metric, threshold, progress, at)
                    )
                elif metric_type == "security":
                    trace.evals.append(_security_eval(rng, metric, threshold, at))
                else:
                    trace.evals.append(
                        _deterministic_eval(rng, metric, threshold, trace, at)
                    )

    return Corpus(traces=built, run_starts=run_starts)


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


async def seed(corpus: Corpus, *, replace: bool = True) -> tuple[int, int]:
    """Insert the corpus into Postgres. Returns ``(traces, eval_rows)``.

    Writes straight to the database rather than through the API: 300 traces
    times 8 metrics is 2,400 eval rows, and the run endpoints would invoke the
    real eval engine, which is the opposite of what a fabricated corpus wants.
    """
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from agentproof_server.config import settings
    from agentproof_server.db.models import Base
    from agentproof_server.db.models import EvalResult as EvalResultModel
    from agentproof_server.db.models import Span as SpanModel
    from agentproof_server.db.models import Trace as TraceModel

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    eval_rows = 0
    try:
        async with maker() as session:
            if replace:
                existing = (
                    await session.execute(
                        select(TraceModel.trace_id).where(
                            TraceModel.project == PROJECT
                        )
                    )
                ).scalars().all()
                if existing:
                    await session.execute(
                        delete(EvalResultModel).where(
                            EvalResultModel.trace_id.in_(existing)
                        )
                    )
                    await session.execute(
                        delete(SpanModel).where(SpanModel.trace_id.in_(existing))
                    )
                    await session.execute(
                        delete(TraceModel).where(TraceModel.trace_id.in_(existing))
                    )
                    await session.commit()

            for trace in corpus.traces:
                session.add(
                    TraceModel(
                        trace_id=trace.trace_id,
                        project=trace.project,
                        name=trace.name,
                        start_time=trace.created_at,
                        end_time=trace.created_at
                        + timedelta(milliseconds=trace.total_latency_ms),
                        total_latency_ms=trace.total_latency_ms,
                        total_tokens=trace.total_tokens,
                        total_cost_usd=trace.total_cost_usd,
                        status=trace.status,
                        tags={"synthetic": True},
                        created_at=trace.created_at,
                    )
                )
                await session.flush()
                for span in trace.spans:
                    session.add(
                        SpanModel(
                            span_id=span["span_id"],
                            trace_id=trace.trace_id,
                            parent_span_ids=[],
                            span_type=span["span_type"],
                            name=span["name"],
                            start_time=trace.created_at,
                            end_time=trace.created_at
                            + timedelta(milliseconds=span["latency_ms"]),
                            latency_ms=span["latency_ms"],
                            status="ok",
                            span_metadata=span["metadata"],
                            tags={},
                        )
                    )
                for ev in trace.evals:
                    session.add(
                        EvalResultModel(
                            trace_id=trace.trace_id,
                            span_id=None,
                            metric_name=ev.metric_name,
                            metric_type=ev.metric_type,
                            score=ev.score,
                            explanation=ev.explanation,
                            threshold=ev.threshold,
                            passed=ev.passed,
                            details=ev.details,
                            evaluated_at=ev.evaluated_at,
                        )
                    )
                    eval_rows += 1
            await session.commit()
    finally:
        await engine.dispose()

    return len(corpus.traces), eval_rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="synthetic-showcase",
        description="Seed the openly fabricated 'synthetic-showcase' project.",
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--traces", type=int, default=DEFAULT_TRACES)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS)
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Append instead of replacing the existing synthetic project.",
    )
    args = parser.parse_args(argv)

    corpus = build_corpus(
        seed=args.seed,
        end=datetime.now(UTC),
        traces=args.traces,
        days=args.days,
        runs=args.runs,
    )
    traces, rows = asyncio.run(seed(corpus, replace=not args.keep_existing))
    print(
        f"Seeded {traces} synthetic traces and {rows} eval rows into "
        f"'{PROJECT}' across {len(corpus.run_starts)} runs. "
        f"This data is generated, not measured."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
