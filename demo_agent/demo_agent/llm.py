"""Pluggable LLM backends: live Anthropic and key-free replay.

Retrieval is always offline (see corpus.py); the LLM is the only thing that
differs between live and replay modes, which keeps traces reproducible.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

_FIXTURES = Path(__file__).parent / "fixtures" / "replay_responses.json"


@dataclass(frozen=True)
class LLMResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int


class LLMBackend(Protocol):
    def complete(self, *, system: str, prompt: str, key: str) -> LLMResponse:
        ...


class ReplayBackend:
    """Returns canned responses keyed by ``"<scenario>:<node>"``."""

    def __init__(self, fixtures_path: str | os.PathLike[str] | None = None) -> None:
        path = Path(fixtures_path) if fixtures_path else _FIXTURES
        self._responses: dict[str, dict] = json.loads(path.read_text(encoding="utf-8"))

    def complete(self, *, system: str, prompt: str, key: str) -> LLMResponse:
        if key not in self._responses:
            raise KeyError(f"No replay response for key '{key}'")
        r = self._responses[key]
        return LLMResponse(
            content=r["content"],
            model=r["model"],
            input_tokens=int(r["input_tokens"]),
            output_tokens=int(r["output_tokens"]),
        )


class AnthropicBackend:
    """Live Claude calls. Requires ANTHROPIC_API_KEY when ``complete`` is used."""

    def __init__(self, model: str = "claude-haiku-4-5-20251001") -> None:
        self.model = model

    def complete(self, *, system: str, prompt: str, key: str) -> LLMResponse:
        from anthropic import Anthropic

        client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
        msg = client.messages.create(
            model=self.model,
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            block.text for block in msg.content if getattr(block, "type", "") == "text"
        )
        return LLMResponse(
            content=text,
            model=self.model,
            input_tokens=msg.usage.input_tokens,
            output_tokens=msg.usage.output_tokens,
        )


def get_backend(mode: str, model: str | None = None) -> LLMBackend:
    if mode == "replay":
        return ReplayBackend()
    if mode == "live":
        return AnthropicBackend(model=model or "claude-haiku-4-5-20251001")
    raise ValueError(f"Unknown mode '{mode}' (expected 'replay' or 'live')")
