"""How small a faithfulness drop does the gate catch?

The sweep in server/tests/unit/test_detector_sensitivity.py measures a regex
metric, where the same input always yields the same score. An LLM judge is not
like that: the metric itself has run-to-run variance, so the detector has to
separate a real degradation from judge noise. This measures that case.

Method: judge each of the 13 corpus traces twice -- once as recorded, once with
a fabricated claim spliced into the writer's answer -- then sweep k from 0 to
13, building a candidate score list from k fabricated scores plus the rest
clean, and asking the shipped detector for a verdict at each k.

That costs 13 judge calls rather than 13 x 14, because judging one trace is
independent of the others. The arithmetic afterwards is free.

This is a script and not a test on purpose. The judge is nondeterministic, so
pinning a threshold as an assertion would flake. It is a characterisation to be
re-run and recorded, not an invariant.

Run:  python scripts/judge_sensitivity_sweep.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "server"))

from agentproof_server.eval_engine.baseline import (  # noqa: E402
    baselines_from_json,
)
from agentproof_server.eval_engine.config_parser import load_config  # noqa: E402
from agentproof_server.eval_engine.llm_judge import (  # noqa: E402
    LLMJudgeEvaluator,
    resolve_judge_api_key,
)
from agentproof_server.eval_engine.models import RegressionConfig  # noqa: E402
from agentproof_server.eval_engine.regression import detect_regression  # noqa: E402

_METRIC = "faithfulness"
_BASELINE = _ROOT / "baselines" / "demo-agent-replay.json"
_CONFIG = _ROOT / "agentproof.yaml"

# A specific, confident claim the sources never make, introduced with the
# language of citation -- modelled on the real hallucination this corpus
# already caught in the partially_covered scenario.
_FABRICATION = (
    " Based on the provided context, this approach reduces end-to-end latency "
    "by 43% and is mandated by the ISO 24089 multi-agent standard."
)


def _capture_corpus() -> list[dict]:
    """Regenerate the replay corpus so the sweep matches the pinned baseline."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "corpus.json"
        subprocess.run(
            [
                sys.executable, "-m", "demo_agent", "capture",
                "--scenario", "all", "--mode", "replay",
                "--project", "demo-research-agent", "--out", str(out),
            ],
            cwd=_ROOT, check=True, capture_output=True,
        )
        data = json.loads(out.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data["traces"]


def _judge_each(traces: list[dict], *, fabricate: bool) -> list[float]:
    config = load_config(str(_CONFIG))
    metric = next(m for m in config.metrics if m.name == _METRIC)
    evaluator = LLMJudgeEvaluator(metric, config.judge_model)

    wanted = set(metric.span_names or [])
    scores: list[float] = []
    for trace in traces:
        spans = [s for s in trace.get("spans", []) if s.get("span_type") == "llm_call"]
        if wanted:
            spans = [s for s in spans if s.get("name") in wanted]
        if fabricate:
            spans = [
                {**s, "metadata": {
                    **(s.get("metadata") or {}),
                    "completion": (s.get("metadata") or {}).get("completion", "")
                    + _FABRICATION,
                }}
                for s in spans
            ]
        scores.append(evaluator.evaluate(trace, spans).value)
    return scores


def main() -> int:
    if resolve_judge_api_key() is None:
        print("Needs ANTHROPIC_API_KEY in the environment or .env.")
        return 2

    baseline = baselines_from_json(_BASELINE.read_text(encoding="utf-8"))[_METRIC]
    traces = _capture_corpus()
    n = len(traces)

    print(f"Judging {n} traces clean and fabricated ({n} judge calls)...\n")
    clean = _judge_each(traces, fabricate=False)
    fabricated = _judge_each(traces, fabricate=True)

    print(f"Judge sensitivity — metric: {_METRIC}, corpus: {n} traces")
    print(f"baseline mean {baseline.mean:.3f} (std {baseline.std:.3f}, n={baseline.sample_size})")
    print(f"clean scores this run: {[round(s, 2) for s in clean]}")
    print(f"fabricated scores:     {[round(s, 2) for s in fabricated]}\n")

    print(f"{'degraded':>9}{'candidate mean':>17}{'verdict':>14}   reason")
    fired_at = None
    for k in range(n + 1):
        candidate = fabricated[:k] + clean[k:]
        result = detect_regression(baseline, candidate, RegressionConfig())
        if result.is_regression and fired_at is None:
            fired_at = k
        verdict = "REGRESSION" if result.is_regression else "ok"
        print(f"{k:>9}{result.candidate_mean:>17.3f}{verdict:>14}   {result.reason}")

    if fired_at is None:
        print("\nGate never fired, even with every trace fabricating.")
    else:
        pct = 100 * fired_at / n
        print(f"\nFires from {fired_at} degraded trace(s) of {n} ({pct:.0f}%).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
