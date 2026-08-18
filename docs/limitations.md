# Honest limitations — the complete list

The README carries the five limitations that change how you read the numbers on
it. This file is the full set, kept because a harness that overstates itself is
the thing it exists to prevent, and because a limitation dropped from a summary
should still be findable.

Each entry says what is wrong, how it was measured, and what fixing it involves.
Defects in shipped behaviour are also tracked in `PROGRESS.md`; deferred
decisions are in `docs/review-later.md`.

---

## Scope — what this deliberately is not

### This is not an observability product
Evaluation is after-the-fact and batch; there is no live ingest, no alerting,
and no streaming view. It stores traces because it needs them to grade, not to
compete on tracing.

### It is the wrong shape for ad-hoc use
The gate compares a fixed input set against a pinned baseline. A developer using
an LLM CLI runs a different task every session, so there is nothing stable to
pin a baseline against.

### The positioning is a judgement, not a validated finding
"A CI regression gate for teams shipping an agent as a product" is inferred from
what the code does well. It has not been checked against a team that ships an
agent in production.

---

## Coverage — how far the evidence reaches

### The demo agent is the only agent it has run against
Every number in this repository comes from one 13-scenario LangGraph agent
written by the same author. Instrumenting a second, unrelated project is the
next real validation.

### One adapter ships
The core is framework-neutral and manual instrumentation works anywhere, but
LangGraph is the only auto-instrumentation adapter today.

### Five of eight metrics have never moved
No scenario on the demo corpus stresses the deterministic and security checks
hard enough. The dashboard reports them as unexercised rather than passing,
which is the honest reading but not a substitute for exercising them.

---

## Measurement — how much to trust a score

### The LLM judge is not calibrated against human labels
It discriminates fabrication from grounded text by a wide margin, but no
agreement statistic (Cohen's kappa or otherwise) has been computed against a
hand-labelled gold set. Until that exists, treat judge scores as a soft signal.

### `relevance` is not yet trustworthy, and is contained rather than fixed
Its rubric has a band for "directly answers" and one for "off-topic or empty",
and none for *correctly declining because the corpus cannot answer*. On the
`unanswerable` scenario the judge therefore picks a different band each run:
0.00, 0.10, 0.10, 0.40, 0.40 across five evaluations of an identical fixture. It
is held back by a per-metric floor of 0.15 and reports without blocking, but a
floor is containment. The rubric needs the missing band, and that changes what
the metric measures, so it needs its own re-pin.

### A pinned baseline carries one evaluation run's judge noise
Baselines are built from a single pass, so whatever the judge happened to return
that day becomes the reference. Averaging over several runs would reduce it;
there is no `--repeat` yet. The practical-significance floors are what keep this
from mattering, and they are sized against measured noise, but the reference
itself is noisier than it needs to be.

### The judge-noise figures are recorded observations, not reproducible ones
The per-scenario standard deviations the practical-significance floors are sized
against are quoted in prose across several files. There is no committed artifact
of the underlying draws, no script that regenerates them, and no test that
recomputes them. The method is recorded in a single comment line in
`fixtures/regression_config_judged.yaml`: they were measured on the **degraded
corpus of PR #14**, not on `main`. Re-measuring against `main`'s clean fixtures
returns a different quantity, not a correction — a degraded agent produces
borderline answers that sit on rubric band edges, where a judge is least stable.
Closing this means running a k-draw harness against that branch and committing
the draws.

---

## Gate behaviour — where the decision rule is wrong

### A single security breach does not block the build
The effect-size guard is designed for graded quality metrics, where one bad
answer should not convict a whole suite. Applied to security it reads oddly: one
scenario in thirteen successfully prompt-injected produces `d_z=0.277` and
passes, and it takes three before the gate fires. A breach is not a trend, and
the six measured metrics have a run-to-run standard deviation of **0.000**, so
there is no noise for a statistical guard to see through — every drop is signal.
Reproduction and the full table are in [walkthrough.md](walkthrough.md). Open,
and the likeliest fix is to route zero-noise metrics to an absolute-drop rule
rather than a statistical one.

---

## Open defects in shipped behaviour

### The batch eval endpoint can return 200 without persisting
`server/tests/integration/test_eval_pipeline.py` reproduces it intermittently
(measured at 2 failures in 4 consecutive runs): POST a batch, get 200, then 404
on the trace, with no rows written. An endpoint that reports success without
writing is the same class of defect as a metric that reports a pass without
measuring, and it is open.

### `trigger_evals` has a fixed timeout against a variable batch
`demo_agent/demo_agent/export.py` hard-codes a 30-second HTTP timeout for a
batch whose cost depends entirely on the config it runs. It currently passes in
about 20 seconds, but only because `injection_resistance` was moved from `dual`
to `heuristic`, which stopped it making a judge call on every `llm_call` span.
Measured by putting it back: `dual` fails at 36.3s, and `heuristic` passes in
three consecutive runs. The symptom is gone; the defect is not. Adding scenarios
or re-enabling a judge-backed security metric brings it straight back, and the
fix is a timeout that scales with the batch.

### Alembic migrations are scaffolded, not written
There is no `versions/` directory and no `alembic_version` table in a deployed
database; the schema is created by `Base.metadata.create_all`. A declared
`ondelete="CASCADE"` therefore reaches the database only because the model
builds it, not because a migration applied it.
