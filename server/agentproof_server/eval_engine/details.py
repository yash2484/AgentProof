# server/agentproof_server/eval_engine/details.py
"""The one module that knows the shape of an eval row's ``details`` blob.

``details`` is a free-form JSON column, and different evaluators fill it
differently. Three separate defects in one session came from code assuming one
shape while a second shape existed:

1. Degraded detection read ``$.per_span`` and missed dual mode's
   ``$.llm.per_span`` (``security.py`` nests the judge leg), which exempted
   every real dual-mode security row from degraded detection. One of them was
   a 529 Overloaded rendering on screen as a security breach.
2. The metric drill-down had to find judge prose in both of those places.
3. Deterministic rows carry the same quantity under different keys: the real
   cost evaluator writes ``total_cost_usd`` while ``LatencyBudgetEvaluator``
   deliberately surfaces a stable ``latency_ms`` alias, and the synthetic
   generator guessed the obvious names -- matching latency and missing cost.

Rather than fix the same class of bug a fourth time, shape knowledge lives
here. Readers ask this module a question; they never index ``details``
directly.
"""

from __future__ import annotations

from collections.abc import Iterator

# Every spelling a measured quantity arrives under, stable name first.
#
# ``LatencyBudgetEvaluator`` writes both its budget field and a stable alias;
# ``CostBudgetEvaluator`` historically wrote only the budget field. Readers
# should not have to know which evaluator was feeling generous.
STABLE_QUANTITY_KEYS: dict[str, tuple[str, ...]] = {
    "latency_ms": ("latency_ms", "total_latency_ms"),
    "cost_usd": ("cost_usd", "total_cost_usd"),
}


def per_span_records(details: object) -> Iterator[dict]:
    """Yield judge records from every ``per_span`` list in the tree.

    Judged metrics write ``{"per_span": [...]}`` at the top level; a security
    metric in ``dual`` mode writes ``{"heuristic": {...}, "llm": {"per_span":
    [...]}, "combine": "min"}``. Both are reached.
    """
    if not isinstance(details, dict):
        return
    for key, value in details.items():
        if key == "per_span" and isinstance(value, list):
            for record in value:
                if isinstance(record, dict):
                    yield record
        elif isinstance(value, dict):
            yield from per_span_records(value)


def _broken(record: dict) -> bool:
    """``run_structured_judge`` writes these keys only on failure."""
    return bool(record.get("error") or record.get("refusal"))


def is_degraded(details: dict | None) -> bool:
    """True when any judge call behind this row errored or refused.

    A degraded row is a failed *measurement*, not a finding: the judge fails
    closed to 0.0, so without this a timed-out API call renders as a verdict.

    Scoped to ``per_span`` records rather than matching ``error`` anywhere,
    so an unrelated key cannot erase a real finding from the mean.
    """
    if not details:
        return False
    return any(_broken(record) for record in per_span_records(details))


def has_broken_record(leg: dict | None) -> bool:
    """True when *this* leg's own records contain a failure.

    Deliberately not recursive: the security evaluator asks about the llm leg
    alone when deciding whether to fall back to the heuristic one, and must
    not see the other leg's records.
    """
    if not leg:
        return False
    return any(
        _broken(record)
        for record in leg.get("per_span") or []
        if isinstance(record, dict)
    )


def reasoning_records(details: dict | None) -> list[dict]:
    """The judge's prose for one eval row, per span.

    A record with neither ``reasoning`` nor an error marker is a heuristic
    check -- a score with no words. It is skipped rather than rendered as an
    empty quote, because a blank block reads as "the judge said nothing" when
    in fact no judge ran.
    """
    rows: list[dict] = []
    for record in per_span_records(details):
        span_id = record.get("span_id")
        if _broken(record):
            rows.append(
                {
                    "span_id": span_id,
                    "score": None,
                    "error": record.get("error") or "judge refused to answer",
                }
            )
        elif record.get("reasoning"):
            rows.append(
                {
                    "span_id": span_id,
                    "score": _as_float(record.get("score")),
                    "reasoning": record["reasoning"],
                }
            )
    return rows


def _as_float(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def measured_quantity(details: dict | None) -> dict | None:
    """The real quantity behind a budget check, with its limit.

    ``{"key": "cost_usd", "value": 0.024, "limit": 0.05}``, or ``None`` when
    this row carries no budget quantity. This is what lets a compliance rate
    show its margin: "97% within budget" hides how close the passing runs ran
    to the edge, which is where the next regression lands first.

    A missing measurement returns ``None``, never zero. The budget evaluator
    writes ``{field: None, "limit": x}`` when the trace lacks the field, and
    zero would render as a run that cost nothing.
    """
    if not isinstance(details, dict):
        return None
    for stable, spellings in STABLE_QUANTITY_KEYS.items():
        for spelling in spellings:
            value = _as_float(details.get(spelling))
            if value is not None:
                return {
                    "key": stable,
                    "value": value,
                    "limit": _as_float(details.get("limit")),
                }
    return None


def attack_attempted(details: dict | None) -> bool | None:
    """Whether an attack was even attempted against this trace. Tri-state.

    ``True`` attacked, ``False`` checked and not attacked, ``None`` no attempt
    signal was recorded at all. The distinction is the whole point: a breach
    rate is meaningless without it, because "0 of 0 attempted", "0 of 34
    attempted" and "nobody checked" are three different facts and only one of
    them is reassuring.

    Searched at any depth, and any leg reporting an attempt wins. Measured on
    the live corpus: the demo project carries this flag on 37 rows, every one
    of them nested under the heuristic leg, with 5 real attempts — a
    top-level-only read reports zero attacks while five sit in the data.
    Only ``injection_resistance`` records it; the other security metrics
    return ``None``, which must not be rendered as "0 attempted".
    """
    if not isinstance(details, dict):
        return None
    found: bool | None = None
    for key, value in details.items():
        if key == "injection_attempted" and isinstance(value, bool):
            if value:
                return True
            found = False
        elif isinstance(value, dict):
            nested = attack_attempted(value)
            if nested:
                return True
            if nested is False:
                found = False
    return found


def violations(details: dict | None) -> list[str]:
    """Tool names called outside the allowlist. Empty is a real answer."""
    if not isinstance(details, dict):
        return []
    found = details.get("violations")
    return [str(v) for v in found] if isinstance(found, list) else []
