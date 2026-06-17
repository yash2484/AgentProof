"""Unit tests for the YAML config parser and validator."""

from __future__ import annotations

import textwrap

import pytest
from agentproof_server.eval_engine.config_parser import (
    ConfigError,
    load_config,
    validate_config,
)


def _write(tmp_path, body: str):
    path = tmp_path / "agentproof.yaml"
    path.write_text(textwrap.dedent(body))
    return path


VALID = """
    project: demo
    judge_model: claude-sonnet-4-6
    metrics:
      - name: faithfulness
        type: llm_judge
        applies_to: llm_call
        rubric: "Score faithfulness 0..1."
        aggregation: min
      - name: latency_budget
        type: deterministic
        applies_to: trace
        max_latency_ms: 15000
        threshold: 1.0
      - name: tool_allowlist
        type: deterministic
        applies_to: tool_use
        allowed_tools: [web_search]
"""


def test_load_valid_config(tmp_path):
    cfg = load_config(_write(tmp_path, VALID))
    assert cfg.project == "demo"
    assert cfg.judge_model == "claude-sonnet-4-6"
    assert len(cfg.metrics) == 3


def test_duplicate_metric_name_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: dup, type: deterministic, applies_to: trace, max_cost_usd: 1.0}
          - {name: dup, type: deterministic, applies_to: trace, max_tokens: 10}
    """
    with pytest.raises(ConfigError, match="dup"):
        load_config(_write(tmp_path, body))


def test_bad_applies_to_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: m, type: deterministic, applies_to: banana, max_tokens: 10}
    """
    with pytest.raises(ConfigError, match="banana"):
        load_config(_write(tmp_path, body))


def test_llm_judge_without_rubric_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: faith, type: llm_judge, applies_to: llm_call}
    """
    with pytest.raises(ConfigError, match="faith"):
        load_config(_write(tmp_path, body))


def test_deterministic_without_resolvable_evaluator_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: mystery, type: deterministic, applies_to: trace}
    """
    with pytest.raises(ConfigError, match="mystery"):
        load_config(_write(tmp_path, body))


def test_threshold_out_of_range_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: m, type: deterministic, applies_to: trace, max_tokens: 10, threshold: 2.0}
    """
    with pytest.raises(ConfigError, match="threshold"):
        load_config(_write(tmp_path, body))


def test_composite_without_weights_raises(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: overall, type: composite, applies_to: trace}
    """
    with pytest.raises(ConfigError, match="overall"):
        load_config(_write(tmp_path, body))


def test_security_metric_is_tolerated(tmp_path):
    body = """
        project: demo
        metrics:
          - {name: injection, type: security, applies_to: llm_call, detection_mode: dual}
    """
    cfg = load_config(_write(tmp_path, body))
    assert cfg.metrics[0].type == "security"


def test_validate_config_warns_when_no_judge_metrics(tmp_path):
    cfg = load_config(_write(tmp_path, """
        project: demo
        metrics:
          - {name: cost, type: deterministic, applies_to: trace, max_cost_usd: 1.0}
    """))
    warnings = validate_config(cfg)
    assert any("judge" in w.lower() for w in warnings)
