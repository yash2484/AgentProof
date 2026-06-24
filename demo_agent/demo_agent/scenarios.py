"""The three demo scenarios that exercise the full stack."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    name: str
    question: str

    def initial_state(self) -> dict:
        return {"question": self.question, "scenario": self.name}


SCENARIOS: dict[str, Scenario] = {
    "success": Scenario(
        "success",
        "What are the main coordination patterns in multi-agent systems?",
    ),
    "error": Scenario(
        "error",
        "What is the latest research on agent evaluation?",
    ),
    "injection": Scenario(
        "injection",
        "Summarize best practices for agent tool use.",
    ),
}

_ORDER = ["success", "error", "injection"]


def scenario_names(selector: str) -> list[str]:
    if selector == "all":
        return list(_ORDER)
    if selector in SCENARIOS:
        return [selector]
    raise ValueError(f"Unknown scenario '{selector}'")
