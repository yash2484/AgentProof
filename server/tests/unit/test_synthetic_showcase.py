# server/tests/unit/test_synthetic_showcase.py
"""
Unit tests for the `synthetic-showcase` corpus generator.

This corpus is openly fabricated. It exists because the real demo corpus is 25
traces and 4 runs, which is too thin to judge an analytics design against. The
real corpus stays untouched: it is a byte-for-byte recording and both the
README and PROGRESS make that claim load-bearing.

So the thing these tests protect is not realism, it is *honesty and
reproducibility*: the corpus must regenerate identically from its seed, and it
must be labelled as generated everywhere it surfaces.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from itertools import pairwise

from agentproof_server.scripts_pkg.synthetic_showcase import (
    PROJECT,
    _reason_for,
    build_corpus,
    drifted_mean,
    run_schedule,
)

END = datetime(2026, 8, 9, 12, 0, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Run scheduling
# ---------------------------------------------------------------------------


def test_runs_are_spread_across_the_whole_window():
    schedule = run_schedule(END - timedelta(days=180), END, 9)

    assert len(schedule) == 9
    assert schedule == sorted(schedule)
    assert (schedule[-1] - schedule[0]).days >= 150


def test_runs_are_far_enough_apart_to_cluster_separately():
    # The analytics endpoint folds eval rows into runs with a 120s gap rule.
    # Runs closer together than that would silently merge into one.
    schedule = run_schedule(END - timedelta(days=180), END, 9)

    gaps = [(b - a).total_seconds() for a, b in pairwise(schedule)]
    assert min(gaps) > 120


def test_a_single_run_is_allowed():
    assert len(run_schedule(END - timedelta(days=10), END, 1)) == 1


# ---------------------------------------------------------------------------
# The drift
# ---------------------------------------------------------------------------
#
# Slow degradation, not a step change. A step is obvious from any single pair
# of runs; a gradual drift is exactly what a regression gate exists to catch,
# which makes it the more interesting thing to render.


def test_quality_starts_high_and_ends_low():
    assert drifted_mean(0.0, 0.95, 0.78) == 0.95
    assert drifted_mean(1.0, 0.95, 0.78) == 0.78


def test_the_drift_is_gradual_not_a_step():
    # Every step between deciles is small; no single pair of runs explains it.
    points = [drifted_mean(i / 10, 0.95, 0.78) for i in range(11)]
    steps = [abs(b - a) for a, b in pairwise(points)]

    assert max(steps) < 0.03
    assert points == sorted(points, reverse=True)


# ---------------------------------------------------------------------------
# The corpus
# ---------------------------------------------------------------------------


def test_judge_reasoning_agrees_with_the_score_it_explains():
    """The drill-down shows these strings next to the number they explain.

    A 0.6 labelled "every claim traces to a retrieved chunk" is a corpus that
    contradicts itself on screen — worse than no prose at all, since the
    corpus exists to stand in for real data.
    """
    high = {_reason_for(s / 1000) for s in range(900, 1001)}
    low = {_reason_for(s / 1000) for s in range(0, 500)}

    assert high.isdisjoint(low)
    assert all("nowhere" not in r for r in high)
    assert all("Every claim traces" not in r for r in low)


def test_every_score_band_has_reasoning_available():
    for score in (0.0, 0.35, 0.55, 0.75, 0.95, 1.0):
        assert _reason_for(score)


def test_choosing_reasoning_never_touches_the_random_stream():
    """Prose is cosmetic and must not move the numbers.

    ``random.choice`` consumes a variable number of bits with the length of
    the sequence it draws from, so banding the strings by score shifted the
    whole downstream stream and flattened the drift from 0.15 to 0.08 — the
    corpus's entire reason for existing, weakened by a copy change.
    """
    # A pure function of the score consumes no randomness by construction.
    assert all(_reason_for(0.62) == _reason_for(0.62) for _ in range(50))
    assert [_reason_for(s / 100) for s in range(101)] == [
        _reason_for(s / 100) for s in range(101)
    ]


def test_the_corpus_regenerates_identically_from_its_seed():
    # A fabricated corpus that changes between runs is worse than no corpus:
    # every screenshot and every number in the docs would silently rot.
    a = build_corpus(seed=7, end=END)
    b = build_corpus(seed=7, end=END)

    assert [t.trace_id for t in a.traces] == [t.trace_id for t in b.traces]
    assert [e.score for t in a.traces for e in t.evals] == [
        e.score for t in b.traces for e in t.evals
    ]


def test_a_different_seed_gives_a_different_corpus():
    a = build_corpus(seed=7, end=END)
    b = build_corpus(seed=8, end=END)

    assert [e.score for t in a.traces for e in t.evals] != [
        e.score for t in b.traces for e in t.evals
    ]


def test_the_corpus_is_named_so_nobody_mistakes_it_for_measured_data():
    assert PROJECT == "synthetic-showcase"
    assert all(t.project == PROJECT for t in build_corpus(seed=7, end=END).traces)


def test_the_corpus_has_the_requested_shape():
    corpus = build_corpus(seed=7, end=END, traces=300, days=180, runs=9)

    assert len(corpus.traces) == 300
    assert len(corpus.run_starts) == 9
    span_days = (corpus.traces[-1].created_at - corpus.traces[0].created_at).days
    assert 170 <= span_days <= 180


def test_every_trace_carries_spans_so_the_waterfall_has_something_to_draw():
    corpus = build_corpus(seed=7, end=END)

    assert all(len(t.spans) >= 2 for t in corpus.traces)
    assert all(
        any(s["span_type"] == "llm_call" for s in t.spans) for t in corpus.traces
    )


def test_all_eight_metrics_are_covered_across_the_three_groups():
    corpus = build_corpus(seed=7, end=END)
    by_type: dict[str, set[str]] = {}
    for trace in corpus.traces:
        for ev in trace.evals:
            by_type.setdefault(ev.metric_type, set()).add(ev.metric_name)

    assert by_type["llm_judge"] == {"faithfulness", "relevance"}
    assert by_type["security"] == {
        "injection_resistance",
        "data_exfiltration",
        "tool_misuse",
    }
    assert by_type["deterministic"] == {
        "latency_budget",
        "cost_budget",
        "tool_allowlist",
    }


def test_quality_actually_degrades_across_the_window():
    corpus = build_corpus(seed=7, end=END)
    first, last = corpus.run_starts[0], corpus.run_starts[-1]

    def mean_faithfulness(run_at: datetime) -> float:
        scores = [
            e.score
            for t in corpus.traces
            for e in t.evals
            if e.metric_name == "faithfulness"
            and abs((e.evaluated_at - run_at).total_seconds()) < 3600
            and not e.details.get("per_span", [{}])[0].get("error")
        ]
        return sum(scores) / len(scores)

    assert mean_faithfulness(last) < mean_faithfulness(first) - 0.1


def test_some_judge_calls_are_degraded_so_that_state_is_exercised():
    corpus = build_corpus(seed=7, end=END)
    degraded = [
        e
        for t in corpus.traces
        for e in t.evals
        if e.details
        and any(
            r.get("error") or r.get("refusal") for r in e.details.get("per_span", [])
        )
    ]

    assert len(degraded) > 0
    # A degraded judge call fails closed to 0.0 — that is the whole reason the
    # analytics layer has to tell it apart from a real low score.
    assert all(e.score == 0.0 for e in degraded)


def test_at_least_one_real_security_breach_exists():
    corpus = build_corpus(seed=7, end=END)
    breaches = [
        e
        for t in corpus.traces
        for e in t.evals
        if e.metric_type == "security" and not e.passed
    ]

    assert len(breaches) >= 1


def test_attacks_are_recorded_even_when_they_fail():
    # A breach rate is meaningless without a denominator of attempts:
    # "0 of 0 attempted" and "0 of 34 attempted" are different facts.
    corpus = build_corpus(seed=7, end=END)
    attempted = [
        e
        for t in corpus.traces
        for e in t.evals
        if e.metric_name == "injection_resistance"
        and e.details.get("injection_attempted")
    ]

    assert len(attempted) > len(
        [e for e in attempted if not e.passed]
    ), "some attacks must be resisted, not only landed"


def test_traces_carry_a_realistic_error_rate():
    corpus = build_corpus(seed=7, end=END)
    errors = [t for t in corpus.traces if t.status == "error"]

    assert 0 < len(errors) < len(corpus.traces) * 0.2


def test_evals_within_one_run_are_stamped_per_trace_not_per_batch():
    # Mirrors runner.py, which takes `now` once per trace. The analytics
    # clustering exists precisely because of this, so the corpus must
    # reproduce it or it would never exercise that code path.
    corpus = build_corpus(seed=7, end=END)
    run_at = corpus.run_starts[0]
    stamps = {
        e.evaluated_at
        for t in corpus.traces
        for e in t.evals
        if abs((e.evaluated_at - run_at).total_seconds()) < 3600
    }

    assert len(stamps) > 1
