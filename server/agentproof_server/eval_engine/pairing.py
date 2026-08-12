"""Scenario identity: the one rule that decides whether a run can be paired.

This module exists because the rule had two implementations. The CLI decided
pairing corpus-wide from trace tags; the analytics endpoint decided it
per-metric from eval rows. On a corpus where one untagged trace contributed
scores to some metrics and not others, the two reached different verdicts on
the same commit — CI unpaired everything, the dashboard kept pairing the
metrics that trace never touched. A gate and the screen that reports it
disagreeing about whether a commit regressed is the one failure this codebase
cannot ship, so the rule lives here and both callers import it.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

# The trace tag carrying a stable scenario identity. A captured trace has a
# fresh UUID and a shared trace name, so without this the corpus cannot be
# compared to itself across runs.
PAIR_KEY_TAG = "scenario"


def pair_keys(traces: Iterable[Mapping], tag: str = PAIR_KEY_TAG) -> dict[str, str]:
    """Map ``trace_id -> scenario key``, or ``{}`` if the corpus cannot pair.

    All-or-nothing on purpose. Pairing a subset of the corpus would silently
    change the population under test between runs, and pairing on a duplicated
    key would drop a scenario without saying so. Either the whole corpus has a
    unique key per trace or the comparison falls back to unpaired, which is
    less sensitive but never wrong about what it compared.
    """
    keys: dict[str, str] = {}
    seen: set[str] = set()
    for trace in traces:
        key = (trace.get("tags") or {}).get(tag)
        if not key or key in seen:
            return {}
        seen.add(key)
        keys[str(trace["trace_id"])] = str(key)
    return keys


def scores_by_key(
    rows: Iterable[tuple[str, str, float]],
    keys_by_trace: Mapping[str, str],
) -> dict[str, dict[str, float]]:
    """Per-metric ``scenario -> score`` from ``(metric_name, trace_id, score)``.

    A metric is dropped entirely when any of its rows has no key or lands on a
    scenario already taken. Letting one score occupy another's slot is the
    mispairing that pairing exists to avoid, and dropping the metric costs a
    comparison rather than corrupting one.
    """
    keyed: dict[str, dict[str, float]] = {}
    unpairable: set[str] = set()
    for metric_name, trace_id, score in rows:
        key = keys_by_trace.get(str(trace_id))
        slot = keyed.setdefault(metric_name, {})
        if key is None or key in slot:
            unpairable.add(metric_name)
        else:
            slot[key] = float(score)
    return {k: v for k, v in keyed.items() if k not in unpairable}
