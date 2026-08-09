# server/tests/unit/test_security_analytics.py
"""Unit tests for the Security page's aggregate."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from agentproof_server.api.security_analytics import (
    _attempted_expr,
    _posture_stmt,
    _security_payload,
)

T0 = datetime(2026, 8, 8, 6, 39, 0, tzinfo=UTC)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------


def test_attempts_are_found_however_deeply_they_are_nested():
    # Measured: the demo project carries injection_attempted on 37 rows, every
    # one nested under the heuristic leg. A top-level read reports 0 attacks
    # while 5 sit in the data.
    sql = str(_attempted_expr().compile(compile_kwargs={"literal_binds": True}))
    assert "$.**.injection_attempted" in sql


def test_the_posture_query_counts_breaches_and_attempts_per_metric():
    sql = _sql(_posture_stmt("demo", None))
    assert "group by eval_results.metric_name" in sql
    assert "eval_results.metric_type = 'security'" in sql


def test_the_posture_query_only_looks_at_security_metrics():
    # A judged faithfulness score is not a security posture statement.
    assert "'security'" in _sql(_posture_stmt("demo", None))


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


def _posture_row(
    name="injection_resistance",
    measured=300,
    breached=4,
    degraded=0,
    attempted=69,
    signal=300,
    std=0.115,
):
    return (name, measured, breached, degraded, attempted, signal, std)


def _payload(**overrides):
    kwargs = {
        "project": "demo",
        "days": 30,
        "generated_at": T0,
        "posture_rows": [_posture_row()],
        "attack_surface_row": (300, 69),
        "run_rows": [(T0, 34, 1, 8), (T0 + timedelta(days=20), 33, 0, 7)],
        "finding_rows": [],
    }
    kwargs.update(overrides)
    return _security_payload(**kwargs)


def test_a_metric_reports_breaches_against_attempts_not_against_everything():
    """A breach rate is meaningless without the attempted denominator."""
    metric = _payload()["metrics"][0]

    assert metric["breached"] == 4
    assert metric["attempted"] == 69
    assert metric["measured"] == 300


def test_a_metric_with_no_attempt_signal_says_so_rather_than_claiming_zero():
    # data_exfiltration and tool_misuse never record one. "0 attempted" would
    # claim a check that never ran.
    payload = _payload(
        posture_rows=[_posture_row(name="tool_misuse", attempted=0, signal=0)]
    )

    metric = payload["metrics"][0]
    assert metric["attempt_signal"] is False
    assert metric["attempted"] is None


def test_a_metric_that_was_checked_and_never_attacked_reports_zero():
    # Genuinely different from the case above, and the difference is the point.
    payload = _payload(
        posture_rows=[_posture_row(name="injection_resistance", attempted=0, signal=300)]
    )

    metric = payload["metrics"][0]
    assert metric["attempt_signal"] is True
    assert metric["attempted"] == 0


def test_an_unexercised_control_is_flagged_rather_than_called_passing():
    # std 0 means nothing ever moved it. Same honesty rule as the Overview's
    # ceiling strip: that is an absence of evidence, not evidence of safety.
    payload = _payload(posture_rows=[_posture_row(breached=0, std=0.0)])

    assert payload["metrics"][0]["has_variance"] is False


def test_a_single_observation_cannot_claim_stability():
    payload = _payload(posture_rows=[_posture_row(std=None)])

    assert payload["metrics"][0]["has_variance"] is False


def test_the_attack_surface_splits_traces_into_attacked_and_not():
    surface = _payload()["attack_surface"]

    assert surface == {"traces": 300, "attacked": 69, "unattacked": 231}


def test_the_breach_timeline_is_per_run_oldest_first():
    runs = _payload()["runs"]

    assert runs[0]["run_at"] == T0.isoformat()
    assert runs[0]["breached"] == 1
    assert runs[1]["breached"] == 0


def test_totals_roll_up_across_every_security_metric():
    payload = _payload(
        posture_rows=[
            _posture_row(name="injection_resistance", breached=4, measured=300),
            _posture_row(name="tool_misuse", breached=3, measured=300, signal=0),
        ]
    )

    assert payload["totals"]["breached"] == 7
    assert payload["totals"]["measured"] == 600


def test_findings_carry_what_is_needed_to_act_on_them():
    payload = _payload(
        finding_rows=[
            (
                "tr-1",
                "sp-1",
                "injection_resistance",
                0.0,
                T0,
                "Injected instruction was obeyed.",
                {
                    "injection_attempted": True,
                    "per_span": [
                        {"span_id": "sp-1", "score": 0.0, "reasoning": "Obeyed it."}
                    ],
                },
            )
        ]
    )

    finding = payload["findings"][0]
    assert finding["trace_id"] == "tr-1"
    assert finding["metric_name"] == "injection_resistance"
    assert finding["attempted"] is True
    assert finding["reasoning"][0]["reasoning"] == "Obeyed it."


def test_an_empty_project_reports_zeroes_rather_than_erroring():
    payload = _payload(
        posture_rows=[], attack_surface_row=(0, 0), run_rows=[], finding_rows=[]
    )

    assert payload["metrics"] == []
    assert payload["findings"] == []
    assert payload["totals"] == {"measured": 0, "breached": 0, "degraded": 0}
    assert payload["attack_surface"] == {"traces": 0, "attacked": 0, "unattacked": 0}


def test_the_window_and_project_are_echoed_back():
    payload = _payload(days=7)

    assert payload["days"] == 7
    assert payload["project"] == "demo"
