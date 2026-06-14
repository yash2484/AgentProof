"""
Model pricing table for cost computation.

Prices are in USD per 1M tokens. Users can override with custom pricing.

Design decision: hardcoded defaults + user override. We don't fetch prices
from an API because (a) pricing APIs don't exist for most providers, and
(b) we need deterministic cost computation for reproducibility.
"""

from __future__ import annotations

# USD per 1 million tokens.
DEFAULT_PRICING: dict[str, dict[str, float]] = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "o3-mini": {"input": 1.10, "output": 4.40},
    # Anthropic
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-20250414": {"input": 0.80, "output": 4.00},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
}

# Aliases for convenience.
DEFAULT_PRICING["gpt-4o-mini-2024-07-18"] = DEFAULT_PRICING["gpt-4o-mini"]
DEFAULT_PRICING["claude-3-5-sonnet-20241022"] = DEFAULT_PRICING[
    "claude-sonnet-4-20250514"
]


def compute_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    custom_pricing: dict | None = None,
) -> float | None:
    """Compute USD cost for an LLM call.

    Returns None if the model isn't in the pricing table (after attempting a
    prefix match, e.g. "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini").
    """
    pricing = custom_pricing or DEFAULT_PRICING

    if model not in pricing:
        # Pick the LONGEST matching prefix so e.g. "gpt-4o-mini-2025" resolves
        # to "gpt-4o-mini" rather than the shorter, pricier "gpt-4o".
        matched = max(
            (key for key in pricing if model.startswith(key)),
            key=len,
            default=None,
        )
        if matched is None:
            return None
        model = matched

    rates = pricing[model]
    cost = (input_tokens / 1_000_000) * rates["input"] + (
        output_tokens / 1_000_000
    ) * rates["output"]
    return round(cost, 6)
