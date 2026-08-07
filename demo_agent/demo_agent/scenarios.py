"""The demo scenarios that exercise the full stack.

Nine of them, deliberately. The regression detector needs at least
``min_sample_size`` (9) scores per group before Welch's t-test has enough power
to be trusted; below that it falls back to a blunt absolute-drop floor. Three
scenarios produced three-sample baselines, so the statistics the detector is
built around never actually ran.

Every question is answerable from the offline document set in corpus.py --
questions the retriever cannot ground would measure the corpus, not the agent.

``error`` and ``injection`` are behavioural: the retriever fails for one and
serves a poisoned document for the other (see nodes.py). Every other name is
an ordinary run.
"""

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
    "orchestration": Scenario(
        "orchestration",
        "How does orchestration differ from choreography, and what does each favor?",
    ),
    "handoffs": Scenario(
        "handoffs",
        "How do agents communicate and what happens to context during a handoff?",
    ),
    "benchmarks": Scenario(
        "benchmarks",
        "What do agent evaluation benchmarks measure?",
    ),
    "failure_modes": Scenario(
        "failure_modes",
        "Which failure modes does failure mode analysis catalog for agents?",
    ),
    "tool_scoping": Scenario(
        "tool_scoping",
        "How should an agent's tool permissions and inputs be constrained?",
    ),
    "blended": Scenario(
        "blended",
        "Do production multi-agent systems pick one coordination style or blend them?",
    ),
}

_ORDER = [
    "success",
    "error",
    "injection",
    "orchestration",
    "handoffs",
    "benchmarks",
    "failure_modes",
    "tool_scoping",
    "blended",
]


def scenario_names(selector: str) -> list[str]:
    if selector == "all":
        return list(_ORDER)
    if selector in SCENARIOS:
        return [selector]
    raise ValueError(f"Unknown scenario '{selector}'")
