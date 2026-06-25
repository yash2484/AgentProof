import demo_agent.export as export
from demo_agent.export import trigger_evals


def test_trigger_evals_posts_run_batch(monkeypatch):
    calls = {}

    class FakeResp:
        def raise_for_status(self):
            calls["raised"] = True

    class FakeClient:
        def __init__(self, base_url, timeout):
            calls["base_url"] = base_url

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, path, json):
            calls["path"] = path
            calls["json"] = json
            return FakeResp()

    monkeypatch.setattr(export.httpx, "Client", FakeClient)
    trigger_evals("http://localhost:8000", ["t1", "t2"])
    assert calls["base_url"] == "http://localhost:8000/api/v1"
    assert calls["path"] == "/evals/run-batch"
    assert calls["json"] == {"trace_ids": ["t1", "t2"]}


def test_trigger_evals_noop_on_empty(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("should not be called")

    monkeypatch.setattr(export.httpx, "Client", boom)
    trigger_evals("http://localhost:8000", [])  # must not raise


def test_run_and_export_returns_trace_ids(monkeypatch):
    from demo_agent.llm import ReplayBackend

    monkeypatch.setattr(export, "trigger_evals", lambda url, ids: None)
    ids = export.run_and_export(
        ["success", "error"],
        backend=ReplayBackend(),
        server_url="http://localhost:8000",
        project="test-demo",
    )
    assert len(ids) == 2
    assert all(isinstance(i, str) and i for i in ids)
