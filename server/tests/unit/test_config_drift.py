"""Shipped eval configs must not disagree about what a metric means.

A metric's *definition* — rubric, thresholds, floors, detection mode, span
scoping, aggregation, judge model — decides what its number means. A baseline
is measured under one config and compared under another, so a definition that
differs between them compares two different measurements and any verdict it
produces is meaningless.

What may legitimately differ per environment is only which metrics are
*present*: the key-free CI config cannot run judged metrics at all. Set is
local; definition is global.

Two real drifts existed when this was written. `relevance.min_mean_drop` was
0.15 in the CI config and unset in the active one, so the dashboard gated it at
the global 0.05 — inside its measured 0.120 noise. `injection_resistance` was
`dual` in the active config and `heuristic` in both CI configs, so the
dashboard scored it with a judge in the loop while the gate scored it with a
regex, against one shared baseline.
"""

from __future__ import annotations

import pytest
from agentproof_server.eval_engine.config_parser import load_config

SHIPPED_CONFIGS = [
    "../agentproof.yaml",
    "../fixtures/regression_config.yaml",
    "../fixtures/regression_config_judged.yaml",
]

# Everything that changes what a metric measures or how its verdict is decided.
DEFINING_FIELDS = [
    "type",
    "applies_to",
    "span_names",
    "threshold",
    "rubric",
    "judge_model",
    "aggregation",
    "detection_mode",
    "security_check",
    "allowed_tools",
    "max_latency_ms",
    "max_cost_usd",
    "min_mean_drop",
    "ci_block",
]


def _definitions() -> dict[str, list[tuple[str, object]]]:
    """metric name -> [(config path, metric definition), ...]"""
    out: dict[str, list[tuple[str, object]]] = {}
    for path in SHIPPED_CONFIGS:
        for metric in load_config(path).metrics:
            out.setdefault(metric.name, []).append((path, metric))
    return out


@pytest.mark.parametrize("field", DEFINING_FIELDS)
def test_shared_metrics_agree_across_shipped_configs(field: str):
    for name, defs in _definitions().items():
        if len(defs) < 2:
            continue
        values = {path: getattr(metric, field) for path, metric in defs}
        distinct = {repr(v) for v in values.values()}
        assert len(distinct) == 1, (
            f"'{name}.{field}' differs between shipped configs: {values}. "
            f"A metric's definition must be identical everywhere — only which "
            f"metrics are present may differ per environment. If this change is "
            f"intended, it changes what the metric measures and needs a re-pin."
        )


def test_the_keyfree_config_is_a_subset_not_a_variant():
    """The key-free config may drop judged metrics; it may not invent its own."""
    active = {m.name for m in load_config("../agentproof.yaml").metrics}
    keyfree = {m.name for m in load_config("../fixtures/regression_config.yaml").metrics}
    assert keyfree <= active, f"key-free config has metrics the active one lacks: {keyfree - active}"


def test_the_keyfree_config_declares_no_judged_metrics():
    """It is selected precisely when there is no key, and an unkeyed judge
    scores 0.0 rather than erroring."""
    metrics = load_config("../fixtures/regression_config.yaml").metrics
    assert [m.name for m in metrics if m.type.value == "llm_judge"] == []
