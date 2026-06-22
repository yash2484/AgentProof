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
