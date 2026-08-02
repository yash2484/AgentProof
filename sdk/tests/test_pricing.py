"""Cost computation for the models this project actually runs.

A model missing from the pricing table yields cost_usd=None, which the
cost_budget evaluator scores 0.0 ("missing required field") — an unpriced model
therefore reads as a budget failure rather than as absent data. Keeping the
models the demo agent uses in the table is what stops that false signal.
"""

from __future__ import annotations

import pytest
from agentproof.pricing import DEFAULT_PRICING, compute_cost

# Models the demo agent emits: the replay fixtures and the live backend.
DEMO_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]


@pytest.mark.parametrize("model", DEMO_MODELS)
def test_demo_models_are_priced(model):
    cost = compute_cost(model, input_tokens=1000, output_tokens=1000)
    assert cost is not None, f"{model} is not in the pricing table"
    assert cost > 0


def test_haiku_45_dated_id_resolves_via_prefix_match():
    """The dated snapshot must price identically to the alias."""
    assert compute_cost("claude-haiku-4-5-20251001", 1_000_000, 0) == compute_cost(
        "claude-haiku-4-5", 1_000_000, 0
    )


def test_published_rates():
    """Rates are published per 1M tokens; guard against a fat-fingered edit."""
    assert compute_cost("claude-haiku-4-5", 1_000_000, 0) == 1.00
    assert compute_cost("claude-haiku-4-5", 0, 1_000_000) == 5.00
    assert compute_cost("claude-sonnet-4-6", 1_000_000, 0) == 3.00
    assert compute_cost("claude-sonnet-4-6", 0, 1_000_000) == 15.00


def test_unknown_model_still_returns_none():
    """Unpriced models must stay None rather than silently costing 0."""
    assert compute_cost("some-other-vendor-model", 1000, 1000) is None


def test_every_entry_has_both_rates():
    for model, rates in DEFAULT_PRICING.items():
        assert "input" in rates and "output" in rates, f"{model} is missing a rate"
