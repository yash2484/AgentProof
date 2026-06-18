"""
Load and validate ``agentproof.yaml`` into an ``EvalConfig``.

Validation is stricter than Pydantic alone: it enforces cross-field invariants
(unique names, evaluator-resolvability, span-type membership) and raises
``ConfigError`` naming the offending metric so misconfigurations fail loudly at
load time rather than silently mid-run.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import ValidationError

from agentproof_server.eval_engine.models import EvalConfig, MetricConfig, MetricType

VALID_SPAN_TYPES = {
    "llm_call",
    "tool_use",
    "retrieval",
    "agent_handoff",
    "human_decision",
}

# A deterministic metric resolves to exactly one evaluator via the single
# discriminating field it sets. (name -> field) is intentionally inverted here:
# we check which of these fields is populated.
_DETERMINISTIC_FIELDS = (
    "max_latency_ms",
    "max_cost_usd",
    "max_tokens",
    "allowed_tools",
    "pattern",
)

VALID_SECURITY_CHECKS = {"injection_resistance", "data_exfiltration", "tool_misuse"}
VALID_DETECTION_MODES = {"heuristic", "llm", "dual"}


class ConfigError(Exception):
    """Raised when ``agentproof.yaml`` is structurally or semantically invalid."""


def resolve_deterministic_field(metric: MetricConfig) -> str:
    """Return the single populated discriminating field, or raise ConfigError."""
    populated = [f for f in _DETERMINISTIC_FIELDS if getattr(metric, f) is not None]
    if len(populated) != 1:
        raise ConfigError(
            f"Deterministic metric '{metric.name}' must set exactly one of "
            f"{_DETERMINISTIC_FIELDS} (found {populated or 'none'})."
        )
    return populated[0]


def resolve_security_check(metric: MetricConfig) -> str:
    """Return the metric's security_check, or raise ConfigError naming it."""
    check = metric.security_check
    if check not in VALID_SECURITY_CHECKS:
        raise ConfigError(
            f"Security metric '{metric.name}' must set security_check to one of "
            f"{sorted(VALID_SECURITY_CHECKS)} (found {check!r})."
        )
    return check


def load_config(path: str | Path) -> EvalConfig:
    """Parse and validate a config file into an ``EvalConfig``."""
    raw = yaml.safe_load(Path(path).read_text()) or {}
    try:
        config = EvalConfig.model_validate(raw)
    except ValidationError as exc:  # malformed types/enums
        raise ConfigError(f"Invalid config structure: {exc}") from exc

    seen: set[str] = set()
    for metric in config.metrics:
        if metric.name in seen:
            raise ConfigError(f"Duplicate metric name '{metric.name}'.")
        seen.add(metric.name)

        if metric.applies_to not in VALID_SPAN_TYPES and metric.applies_to != "trace":
            raise ConfigError(
                f"Metric '{metric.name}' has invalid applies_to "
                f"'{metric.applies_to}'."
            )

        if not (0.0 <= metric.threshold <= 1.0):
            raise ConfigError(
                f"Metric '{metric.name}' threshold {metric.threshold} "
                f"is out of range [0, 1]."
            )

        if metric.type == MetricType.LLM_JUDGE and not metric.rubric:
            raise ConfigError(f"llm_judge metric '{metric.name}' requires a rubric.")

        if metric.type == MetricType.DETERMINISTIC:
            resolve_deterministic_field(metric)  # raises if unresolvable

        if metric.type == MetricType.COMPOSITE and not metric.weights:
            raise ConfigError(f"composite metric '{metric.name}' requires weights.")

        if metric.type == MetricType.SECURITY:
            resolve_security_check(metric)  # raises if unresolvable
            mode = metric.detection_mode or "heuristic"
            if mode not in VALID_DETECTION_MODES:
                raise ConfigError(
                    f"Security metric '{metric.name}' has invalid detection_mode "
                    f"'{metric.detection_mode}' (use one of "
                    f"{sorted(VALID_DETECTION_MODES)})."
                )

    return config


def validate_config(config: EvalConfig) -> list[str]:
    """Return non-fatal warnings about an otherwise-valid config."""
    warnings: list[str] = []
    if not any(m.type == MetricType.LLM_JUDGE for m in config.metrics):
        warnings.append("Config defines no llm_judge metrics — quality is unscored.")
    if not any(m.ci_block for m in config.metrics):
        warnings.append("No metric has ci_block=true — CI will never fail on quality.")
    return warnings
