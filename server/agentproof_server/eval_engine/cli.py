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
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException

from agentproof_server.config import settings
from agentproof_server.db.session import AsyncSessionLocal
from agentproof_server.eval_engine.baseline import (
    baselines_from_json,
    baselines_to_json,
    build_baselines_from_report,
)
from agentproof_server.eval_engine.config_parser import load_config, validate_config
from agentproof_server.eval_engine.models import (
    EvalConfig,
    EvalResult,
    RegressionConfig,
    RegressionReport,
)
from agentproof_server.eval_engine.regression import detect_regression
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


def load_traces(path: str) -> list[dict]:
    """Load a JSON list of trace dicts from a file."""
    data = json.loads(Path(path).read_text())
    if not isinstance(data, list):
        raise ValueError("traces file must be a JSON list of trace dicts")
    return data


def regression_metric_names(config) -> set[str]:
    """Names of metrics that participate in regression detection."""
    return {m.name for m in config.metrics if m.regression_alert}


def format_regression_report(report: RegressionReport) -> str:
    """Render a per-metric regression report."""
    lines = ["Regression report:"]
    for r in report.results:
        verdict = "REGRESSION" if r.is_regression else "ok"
        lines.append(
            f"  [{verdict:<10}] {r.metric_name:<22} "
            f"baseline={r.baseline_mean:.3f} candidate={r.candidate_mean:.3f} "
            f"-- {r.reason}"
        )
    status = "PASS" if report.passed else "FAIL"
    lines.append(f"Overall: {status} (regressed: {report.regressed_metrics or 'none'})")
    return "\n".join(lines)


def cmd_baseline(args) -> int:
    """Build pinned baselines from a trace file and write them to JSON."""
    config = load_config(args.config)
    report = EvalRunner(config).evaluate_batch(load_traces(args.traces))
    names = regression_metric_names(config)
    baselines = build_baselines_from_report(report, args.project, names)
    Path(args.out).write_text(baselines_to_json(baselines))
    print(
        f"Wrote {len(baselines)} baseline(s) for project "
        f"'{args.project}' to {args.out}"
    )
    return 0


def cmd_regression(args) -> int:
    """Evaluate a trace file and compare it to a pinned baseline file."""
    config = load_config(args.config)
    report = EvalRunner(config).evaluate_batch(load_traces(args.traces))
    baselines = baselines_from_json(Path(args.baseline).read_text())
    cfg = RegressionConfig()

    candidate: dict[str, list[float]] = {}
    for r in report.results:
        candidate.setdefault(r.metric_name, []).append(r.score)

    ci_block = {m.name for m in config.metrics if m.ci_block}
    results = [
        detect_regression(baseline, candidate.get(name, []), cfg)
        for name, baseline in baselines.items()
    ]
    regressed = [r.metric_name for r in results if r.is_regression]
    blocking = [n for n in regressed if n in ci_block]
    report_out = RegressionReport(
        results=results,
        regressed_metrics=regressed,
        passed=len(blocking) == 0,
        timestamp=datetime.now(UTC),
    )
    print(format_regression_report(report_out))
    return 0 if report_out.passed else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agentproof eval")
    sub = parser.add_subparsers(dest="command", required=True)

    ev = sub.add_parser("evaluate", help="Evaluate stored traces (DB-backed).")
    ev.add_argument("--config", default=settings.eval_config_path)
    ev.add_argument("--trace-id")
    ev.add_argument("--batch", nargs="+")

    bl = sub.add_parser("baseline", help="Build a pinned baseline from a trace file.")
    bl.add_argument("--traces", required=True)
    bl.add_argument("--config", default=settings.eval_config_path)
    bl.add_argument("--project", required=True)
    bl.add_argument("--out", required=True)

    rg = sub.add_parser("regression", help="Check a trace file against a baseline.")
    rg.add_argument("--traces", required=True)
    rg.add_argument("--baseline", required=True)
    rg.add_argument("--config", default=settings.eval_config_path)

    args = parser.parse_args(argv)

    if args.command == "baseline":
        return cmd_baseline(args)
    if args.command == "regression":
        return cmd_regression(args)

    # evaluate (DB-backed, unchanged)
    trace_ids = args.batch or ([args.trace_id] if args.trace_id else [])
    if not trace_ids:
        parser.error("Provide --trace-id <id> or --batch <id1> <id2> ...")
    return asyncio.run(_evaluate(args.config, trace_ids))


if __name__ == "__main__":
    raise SystemExit(main())
