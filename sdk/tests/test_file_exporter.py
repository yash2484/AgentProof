"""FileExporter: capture traces to a JSON file instead of shipping them."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from agentproof import AgentProof, SpanType
from agentproof.exporters import FileExporter
from agentproof.spans import LLMCallMetadata, Span, Trace


def _trace(trace_id: str, project: str = "p") -> Trace:
    t = Trace(trace_id=trace_id, project=project, name="run")
    t.add_span(
        Span(
            span_id=f"{trace_id}-s0",
            trace_id=trace_id,
            span_type=SpanType.LLM_CALL,
            name="synthesis",
            start_time=datetime(2026, 1, 1, tzinfo=UTC),
            end_time=datetime(2026, 1, 1, tzinfo=UTC),
            latency_ms=10,
            metadata=LLMCallMetadata(
                model="claude-sonnet-4-20250514",
                user_prompt="Q?",
                completion="A.",
                input_tokens=5,
                output_tokens=5,
                total_tokens=10,
            ),
        )
    )
    return t


def test_writes_enqueued_traces_as_a_json_list(tmp_path):
    out = tmp_path / "corpus.json"
    exporter = FileExporter(out)
    exporter.enqueue(_trace("a"))
    exporter.enqueue(_trace("b"))
    exporter.shutdown()

    data = json.loads(out.read_text())
    assert isinstance(data, list)
    assert [t["trace_id"] for t in data] == ["a", "b"]


def test_written_shape_matches_the_wire_payload(tmp_path):
    """The file must hold exactly what AsyncExporter would POST, so the eval
    engine can consume a captured file and a stored trace identically."""
    out = tmp_path / "corpus.json"
    trace = _trace("a")
    exporter = FileExporter(out)
    exporter.enqueue(trace)
    exporter.shutdown()

    assert json.loads(out.read_text()) == [trace.model_dump(mode="json")]


def test_preserves_enqueue_order(tmp_path):
    out = tmp_path / "corpus.json"
    exporter = FileExporter(out)
    for i in range(5):
        exporter.enqueue(_trace(f"t{i}"))
    exporter.shutdown()

    assert [t["trace_id"] for t in json.loads(out.read_text())] == [
        f"t{i}" for i in range(5)
    ]


def test_creates_parent_directories(tmp_path):
    out = tmp_path / "nested" / "deeper" / "corpus.json"
    exporter = FileExporter(out)
    exporter.enqueue(_trace("a"))
    exporter.shutdown()

    assert out.exists()


def test_shutdown_is_idempotent(tmp_path):
    out = tmp_path / "corpus.json"
    exporter = FileExporter(out)
    exporter.enqueue(_trace("a"))
    exporter.shutdown()
    exporter.shutdown()

    assert len(json.loads(out.read_text())) == 1


def test_writes_an_empty_list_when_nothing_was_captured(tmp_path):
    out = tmp_path / "corpus.json"
    FileExporter(out).shutdown()

    assert json.loads(out.read_text()) == []


def test_stats_report_captured_count(tmp_path):
    exporter = FileExporter(tmp_path / "corpus.json")
    exporter.enqueue(_trace("a"))
    assert exporter.stats == {"sent": 0, "dropped": 0, "buffered": 1}
    exporter.shutdown()
    assert exporter.stats == {"sent": 1, "dropped": 0, "buffered": 0}


def test_client_accepts_an_injected_exporter(tmp_path):
    """AgentProof(exporter=...) must bypass the HTTP exporter entirely, so an
    offline capture run never opens a socket."""
    out = tmp_path / "corpus.json"
    exporter = FileExporter(out)
    ap = AgentProof(project="demo", exporter=exporter)

    assert ap._exporter is exporter

    with ap.trace("run") as t:
        with t.span("synthesis", span_type=SpanType.LLM_CALL) as s:
            s.record_llm_call(
                model="claude-sonnet-4-20250514",
                user_prompt="Q?",
                completion="A.",
                input_tokens=5,
                output_tokens=5,
            )
    ap.flush()

    data = json.loads(out.read_text())
    assert len(data) == 1
    assert data[0]["project"] == "demo"
    assert data[0]["spans"][0]["metadata"]["completion"] == "A."
