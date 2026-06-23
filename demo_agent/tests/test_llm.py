import pytest

from demo_agent.llm import AnthropicBackend, LLMResponse, ReplayBackend, get_backend


def test_replay_backend_returns_canned_response_by_key():
    b = ReplayBackend()
    r = b.complete(system="sys", prompt="q", key="success:writer")
    assert isinstance(r, LLMResponse)
    assert "orchestration" in r.content
    assert r.model == "claude-sonnet-4-6"
    assert r.input_tokens == 210
    assert r.output_tokens == 64


def test_replay_backend_is_deterministic():
    b = ReplayBackend()
    r1 = b.complete(system="s", prompt="p", key="success:planner")
    r2 = b.complete(system="s", prompt="p", key="success:planner")
    assert r1 == r2


def test_replay_backend_unknown_key_raises():
    b = ReplayBackend()
    with pytest.raises(KeyError):
        b.complete(system="s", prompt="p", key="nope:nope")


def test_get_backend_replay():
    assert isinstance(get_backend("replay"), ReplayBackend)


def test_get_backend_live_returns_anthropic_backend():
    # Constructing the backend must not require a key (key only needed to call).
    b = get_backend("live", model="claude-haiku-4-5-20251001")
    assert isinstance(b, AnthropicBackend)
    assert b.model == "claude-haiku-4-5-20251001"


def test_get_backend_invalid_mode_raises():
    with pytest.raises(ValueError):
        get_backend("bogus")
