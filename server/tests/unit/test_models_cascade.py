# server/tests/unit/test_models_cascade.py
"""
Schema invariants for trace deletion.

Runs without a database: these assert the declared ``ondelete`` rules on
``Base.metadata``, so a fresh install built by ``create_all`` cannot
regress the constraint that made DELETE /traces/{id} return 500 for any
evaluated trace.
"""

from __future__ import annotations

from agentproof_server.db.models import EvalResult, Span


def _ondelete(model, column_name: str, target_table: str) -> str | None:
    column = model.__table__.c[column_name]
    fk = next(fk for fk in column.foreign_keys if fk.column.table.name == target_table)
    return fk.ondelete


def test_spans_cascade_when_their_trace_is_deleted():
    assert _ondelete(Span, "trace_id", "traces") == "CASCADE"


def test_eval_results_cascade_when_their_trace_is_deleted():
    # Regression: a bare ForeignKey here left the constraint as NO ACTION,
    # so Postgres rejected the parent delete and the dashboard's Delete
    # button failed for every evaluated trace.
    assert _ondelete(EvalResult, "trace_id", "traces") == "CASCADE"
