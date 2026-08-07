"""Command-line entry point: `python -m demo_agent run ...`."""

from __future__ import annotations

import argparse

from demo_agent.export import run_and_capture, run_and_export
from demo_agent.graph import build_graph
from demo_agent.llm import RecordingBackend, get_backend
from demo_agent.scenarios import SCENARIOS, scenario_names


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="demo_agent", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Run the demo research-assistant agent.")
    run.add_argument(
        "--scenario",
        choices=[*SCENARIOS, "all"],
        default="all",
    )
    run.add_argument("--mode", choices=["replay", "live"], default="replay")
    run.add_argument("--export", action="store_true", help="Ship traces + run evals.")
    run.add_argument("--server-url", default="http://localhost:8000")
    run.add_argument("--project", default="demo-research-agent")
    run.add_argument("--model", default=None, help="Model id for --mode live.")

    cap = sub.add_parser(
        "capture",
        help="Run scenarios and write their traces to a JSON eval corpus "
        "(no server, no database — this is what CI runs).",
    )
    cap.add_argument(
        "--scenario",
        choices=[*SCENARIOS, "all"],
        default="all",
    )
    cap.add_argument("--mode", choices=["replay", "live"], default="replay")
    cap.add_argument("--out", required=True, help="Path to write the corpus JSON.")
    cap.add_argument("--project", default="demo-research-agent")
    cap.add_argument("--model", default=None, help="Model id for --mode live.")
    cap.add_argument(
        "--record-fixtures",
        default=None,
        metavar="PATH",
        help=(
            "With --mode live, also write every model response to PATH as a "
            "replay fixture, so the recorded run can be replayed key-free and "
            "deterministically from then on."
        ),
    )
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

    if args.command == "capture":
        recorder = None
        if getattr(args, "record_fixtures", None):
            if args.mode != "live":
                raise SystemExit("--record-fixtures requires --mode live")
            recorder = RecordingBackend(backend, args.record_fixtures)
            backend = recorder
        ids = run_and_capture(
            keys, backend=backend, out_path=args.out, project=args.project
        )
        print(f"Captured {len(ids)} traces to {args.out}")
        if recorder is not None:
            print(f"Recorded {recorder.flush()} responses to {args.record_fixtures}")
        return 0

    if args.export:
        ids = run_and_export(
            keys, backend=backend, server_url=args.server_url, project=args.project
        )
        print(f"Exported {len(ids)} traces and triggered evals.")
    else:
        _local_run(keys, backend)
    return 0
