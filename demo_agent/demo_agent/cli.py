"""Command-line entry point: `python -m demo_agent run ...`."""

from __future__ import annotations

import argparse

from demo_agent.export import run_and_export
from demo_agent.graph import build_graph
from demo_agent.llm import get_backend
from demo_agent.scenarios import SCENARIOS, scenario_names


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="demo_agent", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Run the demo research-assistant agent.")
    run.add_argument(
        "--scenario",
        choices=["success", "error", "injection", "all"],
        default="all",
    )
    run.add_argument("--mode", choices=["replay", "live"], default="replay")
    run.add_argument("--export", action="store_true", help="Ship traces + run evals.")
    run.add_argument("--server-url", default="http://localhost:8000")
    run.add_argument("--project", default="demo-research-agent")
    run.add_argument("--model", default=None, help="Model id for --mode live.")
    return parser


def _local_run(keys: list[str], backend) -> None:
    """Run scenarios without a server; print a concise summary per scenario."""
    graph = build_graph(backend)
    for key in keys:
        state = graph.invoke(SCENARIOS[key].initial_state())
        if state.get("error"):
            print(f"- {key}: [error] retriever failed (HTTP 503 from search provider)")
        else:
            verdict = (state.get("verdict") or "").splitlines()[0] if state.get("verdict") else ""
            print(f"- {key}: [ok] {len(state.get('documents', []))} docs; {verdict}")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    keys = scenario_names(args.scenario)
    backend = get_backend(args.mode, model=args.model)
    if args.export:
        ids = run_and_export(
            keys, backend=backend, server_url=args.server_url, project=args.project
        )
        print(f"Exported {len(ids)} traces and triggered evals.")
    else:
        _local_run(keys, backend)
    return 0
