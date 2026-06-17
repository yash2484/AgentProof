# server/agentproof_server/eval_engine/cli.py
"""
Command-line entry point for the eval engine.

    python -m agentproof_server.eval_engine.cli evaluate \
        --config agentproof.yaml --trace-id <id>
    python -m agentproof_server.eval_engine.cli evaluate \
        --config agentproof.yaml --batch <id1> <id2> ...

Fetches traces from Postgres (async), runs the synchronous runner, persists the
results, and prints a readable per-metric report.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from fastapi import HTTPException

from agentproof_server.config import settings
from agentproof_server.db.session import AsyncSessionLocal
from agentproof_server.eval_engine.config_parser import load_config, validate_config
from agentproof_server.eval_engine.models import EvalConfig, EvalResult
from agentproof_server.eval_engine.runner import EvalRunner


def format_results(trace_id: str, results: list[EvalResult]) -> str:
    """Render a per-metric report for one trace."""
    if not results:
        return f"Trace {trace_id}: no results."
    lines = [f"Trace {trace_id}:"]
    for r in results:
        verdict = "PASS" if r.passed else "FAIL"
        lines.append(
            f"  [{verdict}] {r.metric_name:<20} score={r.score:.3f} "
            f"(threshold={r.threshold})"
        )
    return "\n".join(lines)


def _has_blocking_failure(results: list[EvalResult], config: EvalConfig) -> bool:
    """Return True if any result with ci_block=True failed."""
    ci_block_names = {m.name for m in config.metrics if m.ci_block}
    return any(
        not r.passed
        for r in results
        if r.metric_name in ci_block_names
    )


async def _evaluate(config_path: str, trace_ids: list[str]) -> int:
    from agentproof_server.api.evals import _fetch_trace_dict, _result_to_row

    config = load_config(config_path)
    for warning in validate_config(config):
        print(f"warning: {warning}", file=sys.stderr)
    runner = EvalRunner(config)

    exit_code = 0
    async with AsyncSessionLocal() as db:
        for trace_id in trace_ids:
            try:
                trace_dict = await _fetch_trace_dict(db, trace_id)
            except HTTPException as exc:
                print(f"error: {exc.detail}", file=sys.stderr)
                exit_code = 1
                continue
            results = await asyncio.to_thread(runner.evaluate_trace, trace_dict)
            for result in results:
                db.add(_result_to_row(result))
            await db.flush()
            print(format_results(trace_id, results))
            if _has_blocking_failure(results, config):
                exit_code = 1
        await db.commit()
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agentproof eval")
    sub = parser.add_subparsers(dest="command", required=True)
    ev = sub.add_parser("evaluate", help="Evaluate stored traces.")
    ev.add_argument("--config", default=settings.eval_config_path)
    ev.add_argument("--trace-id")
    ev.add_argument("--batch", nargs="+")
    args = parser.parse_args(argv)

    trace_ids = args.batch or ([args.trace_id] if args.trace_id else [])
    if not trace_ids:
        parser.error("Provide --trace-id <id> or --batch <id1> <id2> ...")
    return asyncio.run(_evaluate(args.config, trace_ids))


if __name__ == "__main__":
    raise SystemExit(main())
