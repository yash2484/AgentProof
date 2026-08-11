"""
Baseline lifecycle: build pinned score distributions from a batch report and
(de)serialize them as JSON. File-based and DB-free (Phase 4 scope).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime

import numpy as np

from agentproof_server.eval_engine.models import Baseline, BatchEvalReport


def build_baselines_from_report(
    report: BatchEvalReport,
    project: str,
    metric_names: set[str] | None = None,
    keys_by_trace: Mapping[str, str] | None = None,
) -> list[Baseline]:
    """Group per-trace scores by metric into pinned ``Baseline`` records.

    When ``keys_by_trace`` maps every evaluated trace to a stable scenario key,
    the baseline also records ``scores_by_key`` so later runs can be compared
    scenario by scenario instead of as two unordered bags of numbers.

    A metric only gets keyed scores if it produced exactly one score per
    scenario. Anything else -- an untagged trace, or a metric emitting several
    results for one trace -- forfeits pairing for that metric rather than
    letting one score silently take another's slot.
    """
    by_metric: dict[str, list[float]] = {}
    keyed: dict[str, dict[str, float]] = {}
    unpairable: set[str] = set()

    for r in report.results:
        if metric_names is not None and r.metric_name not in metric_names:
            continue
        by_metric.setdefault(r.metric_name, []).append(r.score)
        if not keys_by_trace:
            continue
        key = keys_by_trace.get(r.trace_id)
        slot = keyed.setdefault(r.metric_name, {})
        if key is None or key in slot:
            unpairable.add(r.metric_name)
        else:
            slot[key] = r.score

    now = datetime.now(UTC)
    baselines: list[Baseline] = []
    for name, scores in by_metric.items():
        arr = np.asarray(scores, dtype=float)
        pairable = bool(keys_by_trace) and name not in unpairable
        baselines.append(
            Baseline(
                project=project,
                metric_name=name,
                scores=scores,
                scores_by_key=keyed.get(name) if pairable else None,
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
