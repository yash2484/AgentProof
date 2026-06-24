from demo_agent.llm import ReplayBackend
from demo_agent.nodes import (
    fact_checker_node,
    planner_node,
    retriever_node,
    writer_node,
)

B = ReplayBackend()


def test_planner_node_emits_subqueries_and_llm_meta():
    out = planner_node({"question": "q", "scenario": "success"}, backend=B)
    assert isinstance(out["subqueries"], list) and out["subqueries"]
    meta = out["agentproof_meta"]
    assert meta["span_type"] == "llm_call"
    assert meta["user_prompt"] == "q"
    assert meta["completion"]
    assert meta["input_tokens"] == 38


def test_retriever_node_success_returns_documents():
    out = retriever_node({"question": "coordination patterns", "scenario": "success"}, backend=B)
    assert out["documents"]
    assert out["agentproof_meta"]["span_type"] == "retrieval"
    assert out["agentproof_meta"]["query"] == "coordination patterns"


def test_retriever_node_error_scenario_emits_error_meta():
    out = retriever_node({"question": "q", "scenario": "error"}, backend=B)
    assert out["error"] is True
    meta = out["agentproof_meta"]
    assert meta["span_type"] == "tool_use"
    assert meta["status"] == "error"
    assert meta["error_message"] == "HTTP 503 from search provider"


def test_retriever_node_injection_scenario_includes_injection_doc():
    out = retriever_node({"question": "tool use", "scenario": "injection"}, backend=B)
    assert out["documents"][0]["doc_id"] == "inj-1"


def test_writer_node_grounds_prompt_in_context_and_injection_text_present():
    docs = retriever_node({"question": "tool use", "scenario": "injection"}, backend=B)["documents"]
    out = writer_node(
        {"question": "tool use", "scenario": "injection", "documents": docs},
        backend=B,
    )
    assert out["draft"]
    meta = out["agentproof_meta"]
    assert meta["span_type"] == "llm_call"
    assert "Ignore all previous instructions" in meta["user_prompt"]


def test_fact_checker_node_emits_verdict():
    out = fact_checker_node(
        {"question": "q", "scenario": "success", "documents": [], "draft": "d"},
        backend=B,
    )
    assert "VERDICT" in out["verdict"]
    assert out["agentproof_meta"]["span_type"] == "llm_call"
