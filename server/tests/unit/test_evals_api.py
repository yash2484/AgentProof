# server/tests/unit/test_evals_api.py
"""Unit tests for evals-API helpers that don't require a live database."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.api.evals import _resolve_config_path, _result_to_row
from agentproof_server.eval_engine.models import EvalResult


def test_result_to_row_maps_all_columns():
    result = EvalResult(
        trace_id="t1", span_id=None, metric_name="faithfulness",
        metric_type="llm_judge", score=0.9, explanation="ok", threshold=0.7,
        passed=True, details={"a": 1}, raw_judge_output={"r": 2},
        evaluated_at=datetime.now(UTC),
    )
    row = _result_to_row(result)
    assert row.trace_id == "t1"
    assert row.metric_name == "faithfulness"
    assert row.metric_type == "llm_judge"
    assert row.score == 0.9
    assert row.passed is True
    assert row.details == {"a": 1}


def test_resolve_config_path_defaults_to_setting(tmp_path, monkeypatch):
    from agentproof_server import config as config_module

    cfg_file = tmp_path / "agentproof.yaml"
    cfg_file.write_text("project: x\nmetrics: []\n")
    monkeypatch.setattr(config_module.settings, "eval_config_path", str(cfg_file))
    assert _resolve_config_path(None) == str(cfg_file)


def test_resolve_config_path_uses_explicit_when_given():
    assert _resolve_config_path("/tmp/custom.yaml") == "/tmp/custom.yaml"


# ---------------------------------------------------------------------------
# ci_block exposure
# ---------------------------------------------------------------------------
#
# ci_block lives on MetricConfig (default True) and has never been
# serialised, so nothing downstream can tell a blocking metric from an
# advisory one. Severity tiers need it: "rate >= 10% and affected >= 2" only
# escalates to Serious on a metric that actually blocks CI.


def _config_file(tmp_path):
    cfg = tmp_path / "agentproof.yaml"
    cfg.write_text(
        "project: demo\n"
        "metrics:\n"
        "  - name: faithfulness\n"
        "    type: llm_judge\n"
        "    applies_to: llm_call\n"
        "    rubric: grounded?\n"
        "    ci_block: false\n"
        "  - name: latency_budget\n"
        "    type: deterministic\n"
        "    applies_to: trace\n"
        "    max_latency_ms: 2000\n"
    )
    return cfg


async def test_metrics_endpoint_reports_which_metrics_block_ci(
    tmp_path, monkeypatch
):
    from agentproof_server import config as config_module
    from agentproof_server.api.evals import list_metrics

    monkeypatch.setattr(
        config_module.settings, "eval_config_path", str(_config_file(tmp_path))
    )

    payload = await list_metrics()

    by_name = {m["name"]: m for m in payload["metrics"]}
    assert by_name["faithfulness"]["ci_block"] is False
    assert by_name["latency_budget"]["ci_block"] is True


def test_result_rows_carry_ci_block_from_the_config():
    from agentproof_server.api.evals import _row_to_dict
    from agentproof_server.db.models import EvalResult as EvalResultModel

    row = EvalResultModel(
        trace_id="t1", metric_name="faithfulness", metric_type="llm_judge",
        score=0.9, threshold=0.7, passed=True, evaluated_at=datetime.now(UTC),
    )

    assert _row_to_dict(row, {"faithfulness": False})["ci_block"] is False


def test_a_result_row_for_an_unconfigured_metric_stays_blocking():
    from agentproof_server.api.evals import _row_to_dict
    from agentproof_server.db.models import EvalResult as EvalResultModel

    row = EvalResultModel(
        trace_id="t1", metric_name="dropped_metric", metric_type="llm_judge",
        score=0.9, threshold=0.7, passed=True, evaluated_at=datetime.now(UTC),
    )

    assert _row_to_dict(row, {})["ci_block"] is True
