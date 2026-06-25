import os

import httpx
import pytest
from demo_agent.export import run_and_export
from demo_agent.llm import ReplayBackend

SERVER = os.environ.get("DEMO_SERVER_URL", "http://localhost:8000")


def _server_up() -> bool:
    try:
        httpx.get(f"{SERVER}/api/v1/traces", timeout=2.0)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _server_up(), reason="No AgentProof server reachable")
def test_export_all_scenarios_to_live_server():
    ids = run_and_export(
        ["success", "error", "injection"],
        backend=ReplayBackend(),
        server_url=SERVER,
        project="demo-research-agent",
    )
    assert len(ids) == 3
    # Each trace is retrievable.
    with httpx.Client(base_url=f"{SERVER}/api/v1", timeout=10.0) as c:
        for tid in ids:
            r = c.get(f"/traces/{tid}")
            assert r.status_code == 200
