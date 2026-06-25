from agentproof import AgentProof


def test_flush_delegates_to_exporter_shutdown(monkeypatch):
    ap = AgentProof(server_url="http://localhost:8000", project="t")
    called = {}

    def fake_shutdown(timeout: float = 10.0) -> None:
        called["timeout"] = timeout

    monkeypatch.setattr(ap._exporter, "shutdown", fake_shutdown)
    ap.flush(timeout=3.0)
    assert called["timeout"] == 3.0
