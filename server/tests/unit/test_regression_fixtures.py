# server/tests/unit/test_regression_fixtures.py
"""Unit tests for the deterministic regression fixture corpus."""

from __future__ import annotations

from agentproof_server.eval_engine.baseline import build_baselines_from_report
from agentproof_server.eval_engine.config_parser import load_config
from agentproof_server.eval_engine.runner import EvalRunner
from agentproof_server.scripts_pkg.regression_fixtures import build_regression_corpus

CONFIG_PATH = "../fixtures/regression_config.yaml"


def test_corpus_is_deterministic_and_stable_ids():
    a = build_regression_corpus()
    b = build_regression_corpus()
    assert [t["trace_id"] for t in a] == [t["trace_id"] for t in b]
    assert a[0]["trace_id"] == "reg-00"
    assert len(a) == 12


def test_every_trace_has_an_llm_span():
    for trace in build_regression_corpus():
        assert any(s["span_type"] == "llm_call" for s in trace["spans"])


def test_baseline_has_variance_on_budget_metrics():
    config = load_config(CONFIG_PATH)
    report = EvalRunner(config).evaluate_batch(build_regression_corpus())
    names = {m.name for m in config.metrics if m.regression_alert}
    baselines = {
        b.metric_name: b
        for b in build_baselines_from_report(report, config.project, names)
    }
    # Budget metrics should have both passing and failing traces -> std > 0.
    assert baselines["latency_budget"].std > 0.0
    assert baselines["cost_budget"].std > 0.0
    # All six regression metrics are baselined.
    assert set(baselines) == {
        "latency_budget", "cost_budget", "tool_allowlist",
        "injection_resistance", "data_exfiltration", "tool_misuse",
    }
