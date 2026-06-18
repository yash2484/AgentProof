# server/tests/integration/test_eval_pipeline.py
"""
Live, gated end-to-end test of the eval pipeline.

Skips unless BOTH:
  - the AgentProof server is reachable (docker compose up), and
  - ANTHROPIC_API_KEY is set (the LLM judge makes a real call).

Seeds demo traces, runs evals via the API, and asserts deterministic + judge
results land in eval_results and read back.
"""

from __future__ import annotations

import os

import httpx
import pytest
from agentproof_server.scripts_pkg.seed_demo_traces import build_demo_traces

BASE_URL = os.environ.get("AGENTPROOF_SERVER_URL", "http://localhost:8000")


def _server_up() -> bool:
    try:
        return httpx.get(f"{BASE_URL}/health", timeout=2.0).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(
    not (_server_up() and os.environ.get("ANTHROPIC_API_KEY")),
    reason="requires a running server and ANTHROPIC_API_KEY",
)


def test_eval_pipeline_end_to_end():
    traces = build_demo_traces()
    clean = traces[0]
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        # Seed.
        resp = client.post("/api/v1/traces/batch", json=traces)
        assert resp.status_code == 200, resp.text

        try:
            # Run evals on the clean RAG trace.
            resp = client.post("/api/v1/evals/run", json={"trace_id": clean["trace_id"]})
            assert resp.status_code == 200, resp.text
            results = resp.json()["results"]
            names = {r["metric_name"] for r in results}
            # Deterministic + judge metrics both ran.
            assert "latency_budget" in names
            assert "faithfulness" in names

            # Read results back.
            resp = client.get(f"/api/v1/evals/results/{clean['trace_id']}")
            assert resp.status_code == 200, resp.text
            assert len(resp.json()["results"]) >= len(names)

            # The clean trace should be faithful (grounded completion).
            faith = next(r for r in results if r["metric_name"] == "faithfulness")
            assert faith["score"] >= 0.7
        finally:
            for t in traces:
                client.delete(f"/api/v1/traces/{t['trace_id']}")


def test_unfaithful_trace_scores_lower():
    traces = build_demo_traces()
    unfaithful = traces[1]
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        client.post("/api/v1/traces/batch", json=traces)
        try:
            resp = client.post(
                "/api/v1/evals/run", json={"trace_id": unfaithful["trace_id"]}
            )
            assert resp.status_code == 200, resp.text
            faith = next(
                r for r in resp.json()["results"] if r["metric_name"] == "faithfulness"
            )
            # The fabricated "built by NASA" claim should drag faithfulness down.
            assert faith["score"] < 0.7
        finally:
            for t in traces:
                client.delete(f"/api/v1/traces/{t['trace_id']}")


def test_security_metrics_flag_attacks():
    from agentproof_server.scripts_pkg.seed_demo_traces import (
        build_security_demo_traces,
    )

    traces = build_security_demo_traces()
    injection, leak = traces[0], traces[1]
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        resp = client.post("/api/v1/traces/batch", json=traces)
        assert resp.status_code == 200, resp.text
        try:
            # Injection trace: injection_resistance should flag (score < threshold).
            resp = client.post(
                "/api/v1/evals/run", json={"trace_id": injection["trace_id"]}
            )
            assert resp.status_code == 200, resp.text
            results = {r["metric_name"]: r for r in resp.json()["results"]}
            assert "injection_resistance" in results
            assert results["injection_resistance"]["passed"] is False

            # Leak trace: data_exfiltration should flag.
            resp = client.post(
                "/api/v1/evals/run", json={"trace_id": leak["trace_id"]}
            )
            assert resp.status_code == 200, resp.text
            results = {r["metric_name"]: r for r in resp.json()["results"]}
            assert "data_exfiltration" in results
            assert results["data_exfiltration"]["passed"] is False
        finally:
            for t in traces:
                client.delete(f"/api/v1/traces/{t['trace_id']}")
