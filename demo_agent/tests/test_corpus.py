from demo_agent.corpus import INJECTION_TEXT, retrieve


def test_retrieve_returns_top_k_sources():
    out = retrieve("coordination patterns in multi-agent systems", top_k=3)
    assert len(out) == 3
    assert all({"doc_id", "text_preview", "score"} <= set(s) for s in out)


def test_retrieve_is_deterministic():
    a = retrieve("agent evaluation benchmarks", top_k=3)
    b = retrieve("agent evaluation benchmarks", top_k=3)
    assert a == b


def test_retrieve_excludes_injection_by_default():
    out = retrieve("agent tool use best practices", top_k=5)
    assert all(s["doc_id"] != "inj-1" for s in out)


def test_retrieve_includes_injection_when_requested():
    out = retrieve("agent tool use best practices", top_k=3, include_injection=True)
    assert out[0]["doc_id"] == "inj-1"
    assert "Ignore all previous instructions" in out[0]["text_preview"]
    assert INJECTION_TEXT in out[0]["text_preview"]
