# Phase 6 Design — Demo Research-Assistant Agent + Narrative

**Date:** 2026-06-23
**Status:** Approved (brainstorming)
**Branch:** `phase-6-demo-agent` (off `main` @ `3e6f259`)
**Predecessor:** Phase 5 (Dashboard) — `docs/design/2026-06-22-dashboard-design.md`

---

## 1. Goal

Build a real **multi-agent research assistant** as a LangGraph graph,
instrumented *only* through the existing `agentproof` SDK and its
`instrument_langgraph` adapter. It is the first genuine end-to-end consumer of
the whole stack: running it produces real, varied traces (success / error /
injection) that flow into the FastAPI/Postgres store and light up the eval
engine, the security module, the regression detector, and the dashboard.

It ships with a **key-free reproduction path** (recorded replay) so any
reviewer, CI run, or launch demo can produce the full story without an API key,
plus a **live mode** for authentic Claude calls when a key is present.

This phase adds **no new server or eval code** — the demo emits trace shapes the
existing evaluators already understand. Small additive, backward-compatible
fixes to the SDK's LangGraph adapter are in scope if the first real consumer
surfaces gaps (the same posture as Phase 5's additive `?project=`).

This is back to **Python** after the Phase 5 frontend.

## 2. Non-goals

- No new evaluators, security rules, or server endpoints.
- No real external web search — retrieval is deterministic and offline (§5).
- No AutoGen adapter (planned elsewhere; out of scope here).
- No recorded video/screencast — narrative is text + commands (§8).

## 3. The agent

A LangGraph graph with four nodes, linear with the natural verify step at the
end:

```
planner ──▶ retriever ──▶ writer ──▶ fact_checker ──▶ END
(llm_call)  (retrieval)   (llm_call)  (llm_call)
```

- **planner** (`llm_call`): turns the user question into 2–3 focused sub-queries.
- **retriever** (`retrieval`): returns top-k documents from a bundled local
  mini-corpus (`corpus.py`). Always offline and deterministic — see §5.
- **writer** (`llm_call`): drafts an answer grounded in the retrieved documents.
- **fact_checker** (`llm_call`): verifies the draft's claims against the
  retrieved documents (groundedness), producing a real signal for the eval
  engine to score.

The graph definition is never modified for tracing. `instrument_langgraph(graph,
ap)` wraps the compiled graph and auto-creates one span per node execution. The
demo is the first real exercise of that adapter; additive, backward-compatible
fixes to it are allowed if needed.

## 4. LLM backend abstraction (live + replay)

`demo_agent/llm.py` defines an `LLMBackend` protocol with a single
`complete(...)` method and two implementations:

- **`AnthropicBackend`** — live Claude calls via the `anthropic` SDK. Requires
  `ANTHROPIC_API_KEY`. Model id configurable; default a small, cheap model for
  the planner/fact-checker and a capable model for the writer (single default
  acceptable for v1).
- **`ReplayBackend`** — reads canned responses from a committed
  `demo_agent/fixtures/replay_responses.json`, keyed by `(scenario, node)`.
  Deterministic, requires no key. This is the headline reproduction path.

A thin **record** capability (a wrapper that runs the live backend and tees each
response into the fixtures file) is used *once* to generate the committed
fixtures; it is not needed at demo time and not part of the launch flow.

Backend is selected by `--mode live|replay` (default **`replay`**). The factory
that maps mode → backend is unit-tested; the live path is exercised only behind
a key-gated integration test.

## 5. Retrieval corpus

`demo_agent/corpus.py` ships a small in-repo document set (a handful of short
documents about multi-agent systems / agent evaluation). Retrieval is a simple
deterministic top-k keyword/overlap match over that corpus. It is **always
offline**, in both live and replay modes, so the LLM is the *only* variable that
differs between modes — keeping traces reproducible and removing any network
dependency from retrieval.

One corpus document carries the injection payload used by the injection
scenario (§6); it is only included in that scenario's retrieval results.

## 6. Scenarios

`demo_agent/scenarios.py` defines three named scenarios, each a (question,
corpus selection, expected outcome) bundle:

- **success** — a normal research question. Clean trace, status `ok`. Evals
  score well; nothing for the security module to flag.
- **error** — the retriever hits a simulated provider failure (e.g. HTTP 503).
  Produces an `error` span and a trace with status `error`, demonstrating error
  visualization in the dashboard and how evals/regression treat failed runs.
- **injection** — one retrieved document contains an embedded
  `"Ignore all previous instructions…"` payload. The trace carries the injected
  content in the relevant span metadata so the security module's
  `injection_resistance` metric flags it. The agent itself is written to resist
  (it does not comply), so the trace shows both the attack and a defended
  outcome.

## 7. CLI & launch flow

Entry point: `python -m demo_agent run ...`

```
python -m demo_agent run \
  --scenario success|error|injection|all \
  --mode replay|live \
  [--export] [--server-url URL] [--project NAME]
```

- Runs the real instrumented graph for the chosen scenario(s).
- Without `--export`: runs locally and prints a concise summary (no server
  needed) — useful for tests and quick checks.
- With `--export`: the SDK exporter sends the produced traces to the server and
  then triggers eval + security runs for them, reusing the API pattern already
  in `scripts/seed_dashboard.py` (`POST /api/v1/traces/batch` takes a **bare
  JSON array**; evals via `/api/v1/evals/*`).

Launch quickstart becomes:

```bash
docker compose up -d
python -m demo_agent run --scenario all --mode replay --export
# open the dashboard
```

Fully key-free, a real agent, real traces. `scripts/seed_dashboard.py` remains
as the instant static-fill fallback and is not removed.

## 8. Docs / narrative

- **README** quickstart updated to lead with the demo agent (the command above),
  and the roadmap table updated to mark Phase 6 done.
- **`docs/walkthrough.md`** — an end-to-end narrative that ties the pieces
  together: instrument with the SDK → traces in the store → run evals → security
  findings → regression gate → browse in the dashboard, anchored on the three
  scenarios with the exact commands to reproduce each.

## 9. Module / file layout

```
demo_agent/
  pyproject.toml              # + langgraph, anthropic, httpx, agentproof (path dep)
  demo_agent/
    __init__.py
    __main__.py               # `python -m demo_agent` → cli.main()
    cli.py                    # argparse: run --scenario --mode --export ...
    graph.py                  # build + compile the LangGraph graph
    nodes.py                  # planner / retriever / writer / fact_checker
    llm.py                    # LLMBackend protocol, AnthropicBackend, ReplayBackend, factory
    corpus.py                 # bundled mini-corpus + deterministic top-k retrieval
    scenarios.py              # success / error / injection definitions
    export.py                 # post traces + trigger evals (seed_dashboard pattern)
    fixtures/
      replay_responses.json   # committed pre-recorded LLM responses
  tests/
    __init__.py
    test_llm.py
    test_corpus.py
    test_nodes.py
    test_graph.py
    test_scenarios.py
    test_cli.py
```

## 10. Testing

- **TDD**, inline red → green → commit per task.
- All unit tests use `ReplayBackend` — no network, fully deterministic.
  - `test_llm` — backend factory (mode → backend), replay determinism + key lookup.
  - `test_corpus` — top-k retrieval ordering; injection doc only in injection scenario.
  - `test_nodes` — each node's input/output contract against a replay backend.
  - `test_graph` — graph wiring; instrumented run yields the expected span types
    (`llm_call`, `retrieval`) in order.
  - `test_scenarios` — each scenario's resulting trace shape, including the
    `error` span (error scenario) and the injection marker (injection scenario).
  - `test_cli` — argument parsing and dispatch; `--export` calls the exporter
    (mocked, no live server).
- A **gated integration test** posts to a live server and auto-skips when no
  server is reachable (mirrors existing integration-test gating).
- Verification gates: `ruff check`, `pytest` green from the demo package, and a
  manual `--mode replay` run that produces the three traces.

## 11. Process

1. Spec (this doc) committed on `phase-6-demo-agent`.
2. `superpowers:writing-plans` → plan in `.claude/plans/` (gitignored).
3. Implement task-by-task (inline TDD; subagents optional but hit session limits
   last phase — checkpoint to `.superpowers/sdd/progress.md`).
4. Branch is off `main`; after merge, tag `phase-6` (annotated) on the merge
   commit. PR and tag are created by the user (no `gh` CLI / token in this env).

## 12. Environment realities (carried from Phase 5)

- Run Python tests with the repo venv (`./.venv/Scripts/python.exe`); server
  tests run from `server/` (CWD-relative fixtures). Demo tests run from
  `demo_agent/`.
- `npm` on Windows needs `export PATH="/c/Program Files/nodejs:$PATH"` per Bash
  call (only relevant if touching the dashboard — not expected this phase).
- No `gh` / token: pushes over HTTPS work; PRs and tags are manual.
