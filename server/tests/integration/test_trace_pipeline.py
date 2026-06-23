"""
Integration test: SDK models -> Server -> Database -> API round-trip.

This exercises the full Phase 1 pipeline:
1. Build a realistic multi-agent trace (with a DAG) using the SDK data models.
2. POST it to the server's batch endpoint.
3. Retrieve it via the API (detail + tree views).
4. Verify structure, span count, metadata, and DAG parent relationships.

It requires a running server (``docker compose up``) reachable at BASE_URL.
If the server is not reachable, the whole module is skipped so CI stays green
without a live stack.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import UTC, datetime

import httpx
import pytest

# Make the SDK importable when running from the server package.
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
_SDK_PATH = os.path.join(_REPO_ROOT, "sdk")
if _SDK_PATH not in sys.path:
    sys.path.insert(0, _SDK_PATH)

from agentproof.spans import (  # noqa: E402
    AgentHandoffMetadata,
    LLMCallMetadata,
    RetrievalMetadata,
    Span,
    SpanStatus,
    SpanType,
    Trace,
)

BASE_URL = os.environ.get("AGENTPROOF_SERVER_URL", "http://localhost:8000")


def _server_up() -> bool:
    try:
        resp = httpx.get(f"{BASE_URL}/health", timeout=2.0)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(
    not _server_up(),
    reason=f"AgentProof server not reachable at {BASE_URL} (start it with docker compose up)",
)


def _make_test_trace() -> Trace:
    """A 5-span research-assistant trace: retrieval -> llm -> handoff -> writer -> factcheck."""
    trace_id = f"itest-{uuid.uuid4()}"
    now = datetime.now(UTC)
    trace = Trace(trace_id=trace_id, project="integration-test", name="research-run")

    retrieval = Span(
        span_id=f"{trace_id}-s1",
        trace_id=trace_id,
        parent_span_ids=[],
        span_type=SpanType.RETRIEVAL,
        name="researcher_retrieval",
        start_time=now,
        end_time=now,
        latency_ms=120,
        metadata=RetrievalMetadata(
            query="What is agentic AI?",
            num_results=2,
            top_k=5,
            sources=[
                {"doc_id": "d1", "chunk_id": "c1", "score": 0.92, "text_preview": "..."},
                {"doc_id": "d2", "chunk_id": "c3", "score": 0.87, "text_preview": "..."},
            ],
        ),
    )
    researcher_llm = Span(
        span_id=f"{trace_id}-s2",
        trace_id=trace_id,
        parent_span_ids=[retrieval.span_id],
        span_type=SpanType.LLM_CALL,
        name="researcher_synthesis",
        start_time=now,
        end_time=now,
        latency_ms=800,
        metadata=LLMCallMetadata(
            model="gpt-4o-mini",
            user_prompt="Summarize: What is agentic AI?",
            completion="Agentic AI refers to systems that plan and act autonomously...",
            input_tokens=450,
            output_tokens=120,
            total_tokens=570,
            cost_usd=0.000139,
        ),
    )
    handoff = Span(
        span_id=f"{trace_id}-s3",
        trace_id=trace_id,
        parent_span_ids=[researcher_llm.span_id],
        span_type=SpanType.AGENT_HANDOFF,
        name="researcher_to_writer",
        start_time=now,
        end_time=now,
        latency_ms=5,
        metadata=AgentHandoffMetadata(
            from_agent="researcher",
            to_agent="writer",
            handoff_reason="Synthesis complete.",
        ),
    )
    writer_llm = Span(
        span_id=f"{trace_id}-s4",
        trace_id=trace_id,
        parent_span_ids=[handoff.span_id],
        span_type=SpanType.LLM_CALL,
        name="writer_generation",
        start_time=now,
        end_time=now,
        latency_ms=1200,
        metadata=LLMCallMetadata(
            model="gpt-4o-mini",
            user_prompt="Write a cited answer.",
            completion="Agentic AI represents a paradigm shift [1]...",
            input_tokens=600,
            output_tokens=250,
            total_tokens=850,
            cost_usd=0.000240,
        ),
    )
    # Fact-checker depends on BOTH the writer output and the original retrieval
    # (a DAG merge / multi-parent span).
    factcheck = Span(
        span_id=f"{trace_id}-s5",
        trace_id=trace_id,
        parent_span_ids=[writer_llm.span_id, retrieval.span_id],
        span_type=SpanType.LLM_CALL,
        name="factchecker_verify",
        start_time=now,
        end_time=now,
        latency_ms=600,
        status=SpanStatus.OK,
        metadata=LLMCallMetadata(
            model="gpt-4o-mini",
            user_prompt="Verify citations against sources.",
            completion="All citations are supported.",
            input_tokens=500,
            output_tokens=80,
            total_tokens=580,
            cost_usd=0.000132,
        ),
    )

    for span in (retrieval, researcher_llm, handoff, writer_llm, factcheck):
        trace.add_span(span)
    return trace


def test_trace_roundtrip():
    trace = _make_test_trace()
    payload = [trace.model_dump(mode="json")]

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Ingest via the batch endpoint.
        resp = client.post("/api/v1/traces/batch", json=payload)
        assert resp.status_code == 200, resp.text
        assert resp.json()["accepted"] == 1

        # 2. Idempotency: re-posting the same trace skips it.
        resp = client.post("/api/v1/traces/batch", json=payload)
        assert resp.json()["skipped"] == 1

        try:
            # 3. Fetch full trace and verify structure + metadata round-trip.
            resp = client.get(f"/api/v1/traces/{trace.trace_id}")
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["trace_id"] == trace.trace_id
            assert len(body["spans"]) == 5
            assert body["total_tokens"] == 570 + 850 + 580

            by_name = {s["name"]: s for s in body["spans"]}
            llm = by_name["writer_generation"]
            assert llm["span_type"] == "llm_call"
            assert llm["metadata"]["model"] == "gpt-4o-mini"
            assert llm["metadata"]["total_tokens"] == 850

            # DAG multi-parent preserved.
            fc = by_name["factchecker_verify"]
            assert len(fc["parent_span_ids"]) == 2

            # 4. Tree view: one root (the retrieval span has no parents).
            resp = client.get(f"/api/v1/traces/{trace.trace_id}/tree")
            assert resp.status_code == 200, resp.text
            roots = resp.json()
            assert len(roots) == 1
            assert roots[0]["name"] == "researcher_retrieval"
            assert roots[0]["children"], "root should have children"
        finally:
            # 5. Cleanup.
            client.delete(f"/api/v1/traces/{trace.trace_id}")


def test_list_traces_endpoint():
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        resp = client.get("/api/v1/traces", params={"limit": 5})
        assert resp.status_code == 200
        body = resp.json()
        assert "traces" in body and "total" in body
        assert isinstance(body["traces"], list)


def test_eval_results_project_filter():
    """GET /evals/results?project=X scopes results to that project's traces."""
    proj_a = f"proj-a-{uuid.uuid4().hex[:8]}"
    proj_b = f"proj-b-{uuid.uuid4().hex[:8]}"
    start = datetime.now(UTC).isoformat()

    def _raw_trace(project: str) -> dict:
        tid = str(uuid.uuid4())
        return {
            "trace_id": tid,
            "project": project,
            "name": "filter-test",
            "status": "ok",
            "spans": [
                {
                    "span_id": str(uuid.uuid4()),
                    "parent_span_ids": [],
                    "span_type": "llm_call",
                    "name": "gen",
                    "start_time": start,
                    "status": "ok",
                    "metadata": {"model": "x", "user_prompt": "hi", "completion": "hello"},
                }
            ],
        }

    ta, tb = _raw_trace(proj_a), _raw_trace(proj_b)
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        assert client.post("/api/v1/traces/batch", json=[ta, tb]).status_code == 200
        try:
            # Generate eval rows for both (heuristic/deterministic metrics run key-free).
            client.post("/api/v1/evals/run", json={"trace_id": ta["trace_id"]})
            client.post("/api/v1/evals/run", json={"trace_id": tb["trace_id"]})

            resp = client.get(
                "/api/v1/evals/results", params={"project": proj_a, "limit": 200}
            )
            assert resp.status_code == 200, resp.text
            tids = {r["trace_id"] for r in resp.json()["results"]}
            # The filter must exclude project B and never leak other-project rows.
            assert tb["trace_id"] not in tids
            assert tids <= {ta["trace_id"]}
        finally:
            client.delete(f"/api/v1/traces/{ta['trace_id']}")
            client.delete(f"/api/v1/traces/{tb['trace_id']}")
