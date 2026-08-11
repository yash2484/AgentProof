"""Getting scenario identity out of a trace corpus and into a baseline.

The statistics can pair; this is the wiring that gives them something to pair
on. A captured trace carries a fresh UUID and a shared trace name, so the only
stable identity is a tag the agent stamps on the way past.
"""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.eval_engine.baseline import build_baselines_from_report
from agentproof_server.eval_engine.cli import pair_keys
from agentproof_server.eval_engine.models import BatchEvalReport, EvalResult


def _trace(trace_id: str, scenario: str | None) -> dict:
    return {
        "trace_id": trace_id,
        "name": "research-assistant",
        "tags": {"scenario": scenario} if scenario else {},
    }


def _result(trace_id: str, metric: str, score: float) -> EvalResult:
    return EvalResult(
        trace_id=trace_id, metric_name=metric, metric_type="deterministic",
        score=score, passed=True, threshold=1.0, evaluated_at=datetime.now(UTC),
    )


def _report(results: list[EvalResult]) -> BatchEvalReport:
    return BatchEvalReport(
        results=results, summary={}, overall_passed=True,
        evaluated_traces=len(results), total_metrics=1, failed_metrics=[],
        timestamp=datetime.now(UTC),
    )


def test_pair_keys_reads_the_scenario_tag():
    traces = [_trace("uuid-a", "success"), _trace("uuid-b", "injection")]
    assert pair_keys(traces) == {"uuid-a": "success", "uuid-b": "injection"}


def test_pair_keys_is_empty_when_traces_are_untagged():
    """An uninstrumented corpus must degrade to unpaired, not half-pair."""
    assert pair_keys([_trace("uuid-a", None), _trace("uuid-b", None)]) == {}


def test_pair_keys_refuses_a_partially_tagged_corpus():
    """Half a key set is not a key set. Pairing a subset silently changes the
    population under test, so the whole corpus falls back instead."""
    traces = [_trace("uuid-a", "success"), _trace("uuid-b", None)]
    assert pair_keys(traces) == {}


def test_pair_keys_refuses_duplicate_scenario_tags():
    """Two traces claiming the same scenario make pairing ambiguous.

    Left unchecked, one silently overwrites the other and the comparison
    quietly drops a scenario.
    """
    traces = [_trace("uuid-a", "success"), _trace("uuid-b", "success")]
    assert pair_keys(traces) == {}


def test_baselines_carry_scores_by_key_when_identity_is_available():
    report = _report([
        _result("uuid-a", "faithfulness", 0.9),
        _result("uuid-b", "faithfulness", 0.2),
    ])
    keys = {"uuid-a": "success", "uuid-b": "overclaim_bait"}
    baselines = {
        b.metric_name: b
        for b in build_baselines_from_report(report, "demo", keys_by_trace=keys)
    }
    assert baselines["faithfulness"].scores_by_key == {
        "success": 0.9,
        "overclaim_bait": 0.2,
    }
    # The unkeyed list stays, so nothing that reads baselines today breaks.
    assert baselines["faithfulness"].scores == [0.9, 0.2]


def test_baselines_omit_scores_by_key_without_identity():
    report = _report([_result("uuid-a", "faithfulness", 0.9)])
    baselines = build_baselines_from_report(report, "demo")
    assert baselines[0].scores_by_key is None


def test_a_metric_scored_twice_for_one_trace_forfeits_pairing():
    """Pairing needs exactly one score per scenario per metric.

    A metric that emits per-span results would otherwise have its last span
    silently win the scenario's slot.
    """
    report = _report([
        _result("uuid-a", "faithfulness", 0.9),
        _result("uuid-a", "faithfulness", 0.3),
        _result("uuid-b", "faithfulness", 0.8),
    ])
    keys = {"uuid-a": "success", "uuid-b": "injection"}
    baselines = build_baselines_from_report(report, "demo", keys_by_trace=keys)
    assert baselines[0].scores_by_key is None
    assert baselines[0].sample_size == 3
