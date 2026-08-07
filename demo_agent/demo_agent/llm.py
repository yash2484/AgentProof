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


def resolve_api_key() -> str | None:
    """Return ANTHROPIC_API_KEY from the environment or the repo-root ``.env``.

    The SDK only reads the environment. A key that lives in ``.env`` — which is
    where the repo tells you to put it, since ``.env`` is gitignored — is
    invisible to it, and the failure is a 401 at request time rather than
    anything that names the cause. Parsed by hand so demo_agent keeps its
    dependency-light install.
    """
    from_env = os.environ.get("ANTHROPIC_API_KEY")
    if from_env:
        return from_env

    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if not candidate.is_file():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() == "ANTHROPIC_API_KEY":
                return value.strip().strip("'\"") or None
    return None


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

        api_key = resolve_api_key()
        if api_key is None:
            raise RuntimeError(
                "Live mode needs ANTHROPIC_API_KEY in the environment or in a "
                ".env file at the repo root. Replay mode needs no key."
            )
        client = Anthropic(api_key=api_key)
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


class RecordingBackend:
    """Wraps a live backend and writes every response to a replay fixture file.

    This is how the replay corpus stops being author-written fiction: run each
    scenario live once, freeze exactly what the model said, and replay that
    forever after. CI keeps its determinism and zero cost, but the content
    under evaluation is real model output rather than an idealised script.
    """

    def __init__(self, inner: LLMBackend, out_path: str | os.PathLike[str]) -> None:
        self._inner = inner
        self._out = Path(out_path)
        self._recorded: dict[str, dict] = {}

    def complete(self, *, system: str, prompt: str, key: str) -> LLMResponse:
        resp = self._inner.complete(system=system, prompt=prompt, key=key)
        self._recorded[key] = {
            "content": resp.content,
            "model": resp.model,
            "input_tokens": resp.input_tokens,
            "output_tokens": resp.output_tokens,
        }
        return resp

    def flush(self) -> int:
        """Write the recorded responses, merging over any existing file."""
        existing: dict[str, dict] = {}
        if self._out.is_file():
            existing = json.loads(self._out.read_text(encoding="utf-8"))
        existing.update(self._recorded)
        ordered = {k: existing[k] for k in sorted(existing)}
        self._out.write_text(
            json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return len(self._recorded)


def get_backend(mode: str, model: str | None = None) -> LLMBackend:
    if mode == "replay":
        return ReplayBackend()
    if mode == "live":
        return AnthropicBackend(model=model or "claude-haiku-4-5-20251001")
    raise ValueError(f"Unknown mode '{mode}' (expected 'replay' or 'live')")
