"""Which projects hold measured data and which hold authored data.

The dashboard's honesty rests on a reader never mistaking a fabricated number
for a measured one. That is easy to hold when a project is named on screen and
easy to lose the moment figures are pooled: the Overview's default view summed
a 300-trace generated corpus with a 36-trace real one under the heading "All
projects", and the badge that marks the generated corpus does not appear when
no single project is selected.

So "all" means **all measured projects**. A generated corpus is reachable only
by naming it, where the badge is present and the provenance strip explains what
the numbers are.

The distinction is not "real versus fake" -- it is *how each number was
produced*, and there are three answers, not two:

``measured``
    Computed by code from recorded spans. No model in the loop, reproducible.
    Every deterministic and security metric.
``judged``
    A live model call read real agent output and returned a verdict. Carries
    the +/-0.2 judge swing and can fail.
``authored``
    Drawn from a distribution by ``scripts_pkg/synthetic_showcase.py``. Never
    evidence of anything.

Measured on the corpus: ``synthetic-showcase`` has ``raw_judge_output IS NULL``
on all 2400 of its rows -- no judge was ever called for any of them.
"""

from __future__ import annotations

# Projects whose rows are authored rather than measured.
#
# A frozenset rather than a column because there is no working migration path
# in this repo (``versions/`` is empty), and because provenance is a fact about
# how a corpus was created, not about any individual row.
GENERATED_PROJECTS = frozenset({"synthetic-showcase"})


def is_generated(project: str | None) -> bool:
    """True when a project's numbers were authored rather than measured."""
    return project in GENERATED_PROJECTS


def exclude_generated_filter(project: str | None):
    """The exclusion as a standalone predicate, for callers holding a filter list.

    Returns an always-true predicate when a project is named, so it can be
    appended unconditionally without the caller branching.
    """
    from sqlalchemy import true

    from agentproof_server.db.models import Trace as TraceModel

    if project is not None or not GENERATED_PROJECTS:
        return true()
    return TraceModel.project.notin_(GENERATED_PROJECTS)


def exclude_generated(stmt, project: str | None, trace_model):
    """Drop generated corpora from an unscoped ("all projects") statement.

    A no-op when a project is named: selecting the generated corpus explicitly
    is how you look at it, and that view carries its own labelling.
    """
    if project is None and GENERATED_PROJECTS:
        stmt = stmt.where(trace_model.project.notin_(GENERATED_PROJECTS))
    return stmt
