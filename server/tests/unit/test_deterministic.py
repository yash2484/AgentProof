# server/tests/unit/test_deterministic.py
"""Unit tests for the five deterministic evaluators."""

from __future__ import annotations

from agentproof_server.eval_engine.deterministic import (
    CostBudgetEvaluator,
    LatencyBudgetEvaluator,
    ResponsePatternEvaluator,
    TokenBudgetEvaluator,
    ToolAllowlistEvaluator,
)
from agentproof_server.eval_engine.models import MetricConfig


def _llm_span(completion: str) -> dict:
    return {
        "span_id": "s",
        "span_type": "llm_call",
        "metadata": {"completion": completion},
    }


def _tool_span(tool_name: str) -> dict:
    return {
        "span_id": "s",
        "span_type": "tool_use",
        "metadata": {"tool_name": tool_name},
    }


# ---- LatencyBudgetEvaluator ----

def test_latency_within_budget_scores_one():
    cfg = MetricConfig(
        name="latency_budget", type="deterministic", applies_to="trace",
        max_latency_ms=15000,
    )
    score = LatencyBudgetEvaluator(cfg).evaluate({"total_latency_ms": 5000}, [])
    assert score.value == 1.0


def test_latency_over_budget_scores_zero():
    cfg = MetricConfig(
        name="latency_budget", type="deterministic", applies_to="trace",
        max_latency_ms=1000,
    )
    score = LatencyBudgetEvaluator(cfg).evaluate({"total_latency_ms": 5000}, [])
    assert score.value == 0.0
    assert score.details["latency_ms"] == 5000


def test_latency_falls_back_to_span_sum():
    cfg = MetricConfig(
        name="latency_budget", type="deterministic", applies_to="trace",
        max_latency_ms=1000,
    )
    spans = [{"latency_ms": 400}, {"latency_ms": 300}]
    score = LatencyBudgetEvaluator(cfg).evaluate({"total_latency_ms": None}, spans)
    assert score.value == 1.0  # 700 <= 1000


# ---- CostBudgetEvaluator ----

def test_cost_within_budget():
    cfg = MetricConfig(
        name="cost_budget", type="deterministic", applies_to="trace",
        max_cost_usd=0.5,
    )
    assert CostBudgetEvaluator(cfg).evaluate({"total_cost_usd": 0.1}, []).value == 1.0


def test_cost_missing_field_scores_zero_and_names_it():
    cfg = MetricConfig(
        name="cost_budget", type="deterministic", applies_to="trace",
        max_cost_usd=0.5,
    )
    score = CostBudgetEvaluator(cfg).evaluate({"total_cost_usd": None}, [])
    assert score.value == 0.0
    assert "total_cost_usd" in score.explanation


# ---- TokenBudgetEvaluator ----

def test_token_over_budget():
    cfg = MetricConfig(
        name="token_budget", type="deterministic", applies_to="trace",
        max_tokens=100,
    )
    assert TokenBudgetEvaluator(cfg).evaluate({"total_tokens": 250}, []).value == 0.0


# ---- ToolAllowlistEvaluator ----

def test_tool_allowlist_all_allowed():
    cfg = MetricConfig(
        name="tool_allowlist", type="deterministic", applies_to="tool_use",
        allowed_tools=["web_search", "calculator"],
    )
    spans = [_tool_span("web_search"), _tool_span("calculator")]
    assert ToolAllowlistEvaluator(cfg).evaluate({}, spans).value == 1.0


def test_tool_allowlist_lists_violations():
    cfg = MetricConfig(
        name="tool_allowlist", type="deterministic", applies_to="tool_use",
        allowed_tools=["web_search"],
    )
    spans = [_tool_span("web_search"), _tool_span("rm_rf"), _tool_span("sudo")]
    score = ToolAllowlistEvaluator(cfg).evaluate({}, spans)
    assert score.value == 1 / 3  # one of three compliant
    assert set(score.details["violations"]) == {"rm_rf", "sudo"}


def test_tool_allowlist_no_spans_scores_one():
    cfg = MetricConfig(
        name="tool_allowlist", type="deterministic", applies_to="tool_use",
        allowed_tools=["web_search"],
    )
    score = ToolAllowlistEvaluator(cfg).evaluate({}, [])
    assert score.value == 1.0
    assert "no applicable spans" in score.explanation


# ---- ResponsePatternEvaluator ----

def test_response_pattern_fraction_matching():
    cfg = MetricConfig(
        name="has_citation", type="deterministic", applies_to="llm_call",
        pattern=r"\[\d+\]",
    )
    spans = [_llm_span("answer [1]"), _llm_span("no citation here")]
    assert ResponsePatternEvaluator(cfg).evaluate({}, spans).value == 0.5
