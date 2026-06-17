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
