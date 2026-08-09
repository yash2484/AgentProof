# server/tests/unit/test_details.py
"""Unit tests for the one module that knows the shape of ``details``."""

from __future__ import annotations

from agentproof_server.eval_engine.details import (
    STABLE_QUANTITY_KEYS,
    attack_attempted,
    has_broken_record,
    is_degraded,
    measured_quantity,
    per_span_records,
    reasoning_records,
    violations,
)

# ---------------------------------------------------------------------------
# Why this module exists
# ---------------------------------------------------------------------------
#
# Three separate defects in one session came from code assuming one shape of
# ``details`` while a second shape existed:
#
#   1. degraded detection read ``$.per_span`` and missed dual mode's
#      ``$.llm.per_span``, exempting every real dual-mode security row;
#   2. the drill-down had to find judge prose in both places;
#   3. deterministic rows carry the same quantity under different keys --
#      the real cost evaluator writes ``total_cost_usd`` and the synthetic
#      generator wrote ``cost_usd``.
#
# One tested module that knows every shape turns a recurring class of bug into
# a single place to fix.

FLAT_JUDGE = {
    "per_span": [{"span_id": "s1", "score": 0.35, "reasoning": "Not grounded."}],
    "aggregation": "min",
}
DUAL = {
    "heuristic": {"mode": "heuristic", "per_span": [{"span_id": "s1", "score": 1.0}]},
    "llm": {
        "mode": "llm",
        "per_span": [
            {"span_id": "s1", "score": 1.0, "reasoning": "No injection obeyed."},
            {"span_id": "s2", "error": "OverloadedError: 529"},
        ],
    },
    "combine": "min",
}


# ---- per-span records ----


def test_records_are_found_at_the_top_level():
    assert [r["span_id"] for r in per_span_records(FLAT_JUDGE)] == ["s1"]


def test_records_are_found_however_deeply_they_are_nested():
    found = [r["span_id"] for r in per_span_records(DUAL)]
    assert sorted(found) == ["s1", "s1", "s2"]


def test_a_blob_with_no_records_yields_none():
    assert list(per_span_records({"limit": 2000, "latency_ms": 1820})) == []
    assert list(per_span_records(None)) == []
    assert list(per_span_records("not a dict")) == []


def test_a_non_dict_record_is_skipped_rather_than_crashing():
    assert list(per_span_records({"per_span": ["oops", None, {"span_id": "s1"}]})) == [
        {"span_id": "s1"}
    ]


# ---- degraded ----


def test_a_nested_judge_error_degrades_the_row():
    assert is_degraded(DUAL) is True


def test_clean_records_do_not_degrade_the_row():
    assert is_degraded(FLAT_JUDGE) is False


def test_an_error_outside_a_per_span_record_does_not_degrade():
    # Precision guard: matching ``error`` anywhere would let an unrelated key
    # erase a real finding from the mean.
    assert is_degraded({"error": "trace failed", "violations": []}) is False


def test_one_leg_can_be_asked_about_on_its_own():
    # The evaluator asks about the llm leg specifically, to decide whether to
    # fall back to the heuristic one. It must not see the other leg.
    assert has_broken_record(DUAL["llm"]) is True
    assert has_broken_record(DUAL["heuristic"]) is False


# ---- judge prose ----


def test_reasoning_comes_back_with_the_score_it_explains():
    assert reasoning_records(FLAT_JUDGE) == [
        {"span_id": "s1", "score": 0.35, "reasoning": "Not grounded."}
    ]


def test_a_broken_call_reports_its_error_rather_than_prose():
    rows = reasoning_records(DUAL)
    assert {"span_id": "s2", "score": None, "error": "OverloadedError: 529"} in rows


def test_a_heuristic_record_contributes_no_prose():
    # It has a score and no words. An empty quote block reads as "the judge
    # said nothing" when in fact no judge ran.
    assert reasoning_records({"per_span": [{"span_id": "s1", "score": 1.0}]}) == []


# ---- deterministic quantities ----


def test_the_real_cost_evaluators_key_is_read():
    quantity = measured_quantity({"total_cost_usd": 0.024, "limit": 0.05})

    assert quantity == {"key": "cost_usd", "value": 0.024, "limit": 0.05}


def test_the_stable_cost_alias_is_read_too():
    # The synthetic generator wrote this spelling, and LatencyBudgetEvaluator
    # already sets a stable alias -- cost should be readable either way rather
    # than silently returning nothing for half the corpus.
    quantity = measured_quantity({"cost_usd": 0.024, "limit": 0.05})

    assert quantity == {"key": "cost_usd", "value": 0.024, "limit": 0.05}


def test_both_latency_spellings_are_read():
    for blob in (
        {"total_latency_ms": 1820, "limit": 2000},
        {"latency_ms": 1820, "limit": 2000},
        {"total_latency_ms": 1820, "latency_ms": 1820, "limit": 2000},
    ):
        assert measured_quantity(blob) == {
            "key": "latency_ms",
            "value": 1820.0,
            "limit": 2000.0,
        }


def test_a_missing_measurement_is_none_not_zero():
    # The budget evaluator writes {field: None, limit: x} when the trace has
    # no such field. Zero would render as a run that cost nothing.
    assert measured_quantity({"total_cost_usd": None, "limit": 0.05}) is None
    assert measured_quantity({"limit": 0.05}) is None
    assert measured_quantity(None) is None


def test_a_blob_with_no_budget_quantity_reports_none():
    assert measured_quantity({"violations": [], "allowed_tools": ["search"]}) is None


def test_the_stable_keys_are_declared_once():
    # The accessor and the generator must agree, and they agree here.
    assert STABLE_QUANTITY_KEYS["cost_usd"] == ("cost_usd", "total_cost_usd")
    assert STABLE_QUANTITY_KEYS["latency_ms"] == ("latency_ms", "total_latency_ms")


# ---- attack attempts ----
#
# Tri-state on purpose. A breach rate is meaningless without knowing how many
# runs were even attacked: "0 of 0 attempted" and "0 of 34 attempted" are
# different facts, and "we never checked" is a third. Measured on the live
# corpus: the demo project carries this flag on 37 rows, all of them nested
# under the heuristic leg, with 5 real attempts — a top-level read would have
# reported zero attacks while five sat in the data.


def test_a_recorded_attack_reads_true():
    assert attack_attempted({"injection_attempted": True, "per_span": []}) is True


def test_a_checked_run_with_no_attack_reads_false():
    assert attack_attempted({"injection_attempted": False, "per_span": []}) is False


def test_the_flag_is_found_when_dual_mode_nests_it():
    details = {
        "heuristic": {"per_span": [], "injection_attempted": True},
        "llm": {"per_span": []},
        "combine": "min",
    }
    assert attack_attempted(details) is True


def test_no_attempt_signal_is_none_not_false():
    # data_exfiltration and tool_misuse never record one. Reporting "0
    # attempted" for them would claim a check that never ran.
    assert attack_attempted({"per_span": [{"span_id": "s1", "score": 1.0}]}) is None
    assert attack_attempted(None) is None


def test_any_leg_reporting_an_attack_wins():
    # If either detector saw an attempt, the trace was attacked.
    details = {
        "heuristic": {"injection_attempted": False},
        "llm": {"injection_attempted": True},
    }
    assert attack_attempted(details) is True


# ---- allowlist violations ----


def test_violations_come_back_as_names():
    assert violations({"violations": ["rm_rf"], "allowed_tools": ["search"]}) == [
        "rm_rf"
    ]


def test_no_violations_is_an_empty_list_not_none():
    assert violations({"violations": [], "allowed_tools": []}) == []
    assert violations(None) == []
    assert violations({"limit": 5}) == []
