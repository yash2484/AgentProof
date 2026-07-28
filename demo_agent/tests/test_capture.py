"""Capture mode: run scenarios offline and write an eval corpus to disk."""

from __future__ import annotations

import json

import demo_agent.export as export
from demo_agent.llm import ReplayBackend


def test_capture_writes_one_trace_per_scenario(tmp_path):
    out = tmp_path / "corpus.json"
    ids = export.run_and_capture(
        ["success", "error", "injection"],
        backend=ReplayBackend(),
        out_path=out,
        project="demo-research-agent",
    )

    corpus = json.loads(out.read_text())
    assert len(corpus) == 3
    assert [t["trace_id"] for t in corpus] == ids


def test_captured_corpus_has_the_shape_the_eval_engine_consumes(tmp_path):
    out = tmp_path / "corpus.json"
    export.run_and_capture(
        ["success"],
        backend=ReplayBackend(),
        out_path=out,
        project="demo-research-agent",
    )

    trace = json.loads(out.read_text())[0]
    for key in ("trace_id", "project", "name", "start_time", "status", "spans"):
        assert key in trace, f"corpus trace missing '{key}'"
    assert trace["project"] == "demo-research-agent"

    span = trace["spans"][0]
    for key in ("span_id", "span_type", "name", "start_time", "metadata"):
        assert key in span, f"corpus span missing '{key}'"


def test_capture_records_llm_spans_for_the_security_metrics(tmp_path):
    """injection_resistance scores llm_call spans, so a captured corpus with no
    llm_call span would silently produce an empty candidate sample."""
    out = tmp_path / "corpus.json"
    export.run_and_capture(
        ["success", "injection"],
        backend=ReplayBackend(),
        out_path=out,
        project="demo-research-agent",
    )

    corpus = json.loads(out.read_text())
    llm_spans = [
        s for t in corpus for s in t["spans"] if s["span_type"] == "llm_call"
    ]
    assert len(llm_spans) >= 2
    assert all("completion" in s["metadata"] for s in llm_spans)


def test_capture_never_contacts_a_server(tmp_path, monkeypatch):
    """Capture must work in CI with no server up — no socket, ever."""

    def boom(*a, **k):
        raise AssertionError("capture must not open an HTTP client")

    monkeypatch.setattr(export.httpx, "Client", boom)
    export.run_and_capture(
        ["success"],
        backend=ReplayBackend(),
        out_path=tmp_path / "corpus.json",
        project="demo-research-agent",
    )


def test_capture_is_deterministic_in_replay_mode(tmp_path):
    """The regression gate pins a baseline built from this corpus; if replay
    output drifted between runs the gate would flap."""
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    for out in (a, b):
        export.run_and_capture(
            ["success", "error", "injection"],
            backend=ReplayBackend(),
            out_path=out,
            project="demo-research-agent",
        )

    def scrub(corpus: list[dict]) -> list[dict]:
        """Drop identifiers and wall-clock fields; keep the eval-visible payload."""
        for trace in corpus:
            for key in ("trace_id", "start_time", "end_time", "created_at",
                        "total_latency_ms"):
                trace.pop(key, None)
            for span in trace["spans"]:
                for key in ("span_id", "trace_id", "parent_span_ids",
                            "start_time", "end_time", "latency_ms"):
                    span.pop(key, None)
        return corpus

    assert scrub(json.loads(a.read_text())) == scrub(json.loads(b.read_text()))
