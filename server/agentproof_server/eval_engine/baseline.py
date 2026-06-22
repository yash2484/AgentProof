"""
Baseline lifecycle: build pinned score distributions from a batch report and
(de)serialize them as JSON. File-based and DB-free (Phase 4 scope).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np

from agentproof_server.eval_engine.models import Baseline, BatchEvalReport


def build_baselines_from_report(
    report: BatchEvalReport,
    project: str,
    metric_names: set[str] | None = None,
) -> list[Baseline]:
    """Group per-trace scores by metric into pinned ``Baseline`` records."""
    by_metric: dict[str, list[float]] = {}
    for r in report.results:
        if metric_names is not None and r.metric_name not in metric_names:
            continue
        by_metric.setdefault(r.metric_name, []).append(r.score)

    now = datetime.now(UTC)
    baselines: list[Baseline] = []
    for name, scores in by_metric.items():
        arr = np.asarray(scores, dtype=float)
        baselines.append(
            Baseline(
                project=project,
                metric_name=name,
                scores=scores,
                mean=float(arr.mean()),
                std=float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
                sample_size=len(scores),
                created_at=now,
            )
        )
    return baselines


def baselines_to_json(baselines: list[Baseline]) -> str:
    """Serialize baselines to a stable ``{"baselines": [...]}`` JSON document."""
    payload = {"baselines": [b.model_dump(mode="json") for b in baselines]}
    return json.dumps(payload, indent=2) + "\n"


def baselines_from_json(text: str) -> dict[str, Baseline]:
    """Parse a baseline document into a ``metric_name -> Baseline`` mapping."""
    data = json.loads(text)
    return {
        item["metric_name"]: Baseline.model_validate(item)
        for item in data["baselines"]
    }
