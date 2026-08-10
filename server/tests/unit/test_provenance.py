"""'All projects' means all *measured* projects.

Pooling a 300-trace generated corpus with a 36-trace measured one under an
unlabelled heading was the worst honesty defect on the Overview: the badge that
marks generated data is bound to a named project and simply is not rendered
when the scope is "all". Excluding it server-side means the pooled figure
cannot be produced at all, rather than relying on a label to explain it away.
"""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.api.analytics import (
    _eval_timeline_stmt,
    _metric_health_stmt,
    _score_buckets_stmt,
    _trace_health_stmt,
    _trace_totals_stmt,
    _trace_volume_stmt,
)
from agentproof_server.provenance import (
    GENERATED_PROJECTS,
    exclude_generated,
    is_generated,
)

SINCE = datetime(2026, 7, 9, tzinfo=UTC)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


def test_the_synthetic_showcase_is_marked_generated():
    assert is_generated("synthetic-showcase") is True


def test_the_demo_corpus_is_not_marked_generated():
    # 50 of its judged rows carry a real verdict and 222 of its measurements
    # are arithmetic over recorded spans.
    assert is_generated("demo-research-agent") is False


def test_no_project_selected_is_not_itself_generated():
    assert is_generated(None) is False


def test_every_unscoped_aggregate_excludes_generated_projects():
    for stmt in (
        _trace_totals_stmt(None, SINCE),
        _trace_volume_stmt(None, SINCE),
        _eval_timeline_stmt(None, SINCE),
        _metric_health_stmt(None, SINCE),
        _score_buckets_stmt(None, SINCE),
        _trace_health_stmt(None, SINCE),
    ):
        assert "synthetic-showcase" in _sql(stmt), (
            "an unscoped aggregate must exclude the generated corpus"
        )


def test_naming_the_generated_project_still_shows_it():
    # Excluding it everywhere would make the corpus unreachable. Selecting it
    # by name is how you look at it, and that view carries its own badge.
    sql = _sql(_trace_totals_stmt("synthetic-showcase", SINCE))
    assert "traces.project = 'synthetic-showcase'" in sql
    assert "not in" not in sql


def test_naming_a_measured_project_does_not_add_an_exclusion():
    sql = _sql(_trace_totals_stmt("demo-research-agent", SINCE))
    assert "synthetic-showcase" not in sql


def test_eval_rooted_statements_reach_project_through_the_trace_join():
    # Eval rows carry no project of their own, so excluding a project from an
    # eval aggregate means joining the owning trace even though no project was
    # named -- the case that previously skipped the join entirely.
    sql = _sql(_metric_health_stmt(None, SINCE))
    assert "join traces" in sql
    assert "synthetic-showcase" in sql


def test_exclusion_is_a_no_op_when_nothing_is_marked_generated(monkeypatch):
    # The rule is data-driven, not hard-coded to one corpus name.
    monkeypatch.setattr(
        "agentproof_server.provenance.GENERATED_PROJECTS", frozenset()
    )
    from agentproof_server.db.models import Trace as TraceModel
    from sqlalchemy import select

    stmt = select(TraceModel.id)
    assert exclude_generated(stmt, None, TraceModel) is stmt


def test_the_generated_set_is_not_empty():
    # A guard on the fixture above: if this ever empties, the exclusion tests
    # above would pass vacuously.
    assert GENERATED_PROJECTS


def test_the_payload_declares_whether_its_figures_were_authored():
    # The client must not have to re-derive provenance from a project name it
    # keeps in its own list; the two would eventually disagree.
    from tests.unit.test_evals_analytics import _payload

    assert _payload(project="synthetic-showcase")["generated"] is True
    assert _payload(project="demo-research-agent")["generated"] is False
    assert _payload(project=None)["generated"] is False
