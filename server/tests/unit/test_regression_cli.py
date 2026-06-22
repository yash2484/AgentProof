# server/tests/unit/test_regression_cli.py
"""Unit tests for the file-based baseline/regression CLI subcommands."""

from __future__ import annotations

import json
from pathlib import Path

from agentproof_server.eval_engine.cli import main
from agentproof_server.scripts_pkg.regression_fixtures import build_regression_corpus

CONFIG = "../fixtures/regression_config.yaml"


def _write_corpus(path: Path, traces: list[dict]) -> str:
    path.write_text(json.dumps(traces))
    return str(path)


def test_baseline_then_clean_regression_passes(tmp_path):
    corpus = _write_corpus(tmp_path / "corpus.json", build_regression_corpus())
    baseline = str(tmp_path / "baseline.json")
    rc = main([
        "baseline", "--traces", corpus, "--config", CONFIG,
        "--project", "demo-research-agent", "--out", baseline,
    ])
    assert rc == 0
    assert Path(baseline).exists()
    # Same corpus -> no regression -> exit 0.
    rc = main([
        "regression", "--traces", corpus, "--baseline", baseline,
        "--config", CONFIG,
    ])
    assert rc == 0


def test_regressed_corpus_fails(tmp_path):
    corpus = build_regression_corpus()
    baseline = str(tmp_path / "baseline.json")
    base_corpus = _write_corpus(tmp_path / "corpus.json", corpus)
    assert main([
        "baseline", "--traces", base_corpus, "--config", CONFIG,
        "--project", "demo-research-agent", "--out", baseline,
    ]) == 0

    # Regress latency_budget: push every trace over the 15000ms budget.
    regressed = [dict(t, total_latency_ms=30000) for t in corpus]
    bad_corpus = _write_corpus(tmp_path / "bad.json", regressed)
    rc = main([
        "regression", "--traces", bad_corpus, "--baseline", baseline,
        "--config", CONFIG,
    ])
    assert rc == 1


def test_regression_skips_baseline_metric_absent_from_run(tmp_path, capsys):
    """Baseline metrics with no candidate scores are skipped, not falsely flagged."""
    corpus = build_regression_corpus()
    baseline_path = tmp_path / "baseline.json"
    base_corpus = _write_corpus(tmp_path / "corpus.json", corpus)

    # Build a real baseline from the corpus.
    assert main([
        "baseline", "--traces", base_corpus, "--config", CONFIG,
        "--project", "demo-research-agent", "--out", str(baseline_path),
    ]) == 0

    # Inject a ghost metric into the baseline JSON.
    import datetime as _dt
    baseline_data = json.loads(baseline_path.read_text())
    baseline_data["baselines"].append({
        "metric_name": "ghost_metric",
        "scores": [1.0, 1.0, 1.0],
        "mean": 1.0,
        "std": 0.0,
        "sample_size": 3,
        "project": "demo-research-agent",
        "created_at": _dt.datetime.now(_dt.UTC).isoformat(),
    })
    baseline_path.write_text(json.dumps(baseline_data, indent=2) + "\n")

    # Run regression against the clean corpus (no ghost_metric in candidate).
    rc = main([
        "regression", "--traces", base_corpus, "--baseline", str(baseline_path),
        "--config", CONFIG,
    ])
    captured = capsys.readouterr()

    assert rc == 0, f"Expected exit 0, got {rc}\nstdout:\n{captured.out}"
    assert "ghost_metric" in captured.out, "Expected a skipped note for ghost_metric"
    assert "skipped" in captured.out, "Expected 'skipped' in stdout note"
    assert "REGRESSION" not in captured.out or "ghost_metric" not in captured.out.split("REGRESSION")[0].split("\n")[-1], \
        "ghost_metric must not be reported as REGRESSION"
