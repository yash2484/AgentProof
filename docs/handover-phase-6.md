# AgentProof — Handover to Phase 6

**Date:** 2026-06-23
**Prepared after:** Phase 5 (Dashboard) merged to `main` (PR #5, merge `7ec17c4`) + tagged `phase-5`.
**Audience:** the next session/engineer starting Phase 6.

---

## 1. Where the project stands

AgentProof is a framework-agnostic eval, observability, and security harness for
multi-agent systems. Phases 0–5 are **done, merged to `main`, and tagged**
(`phase-1` … `phase-5`). `main` HEAD = `7ec17c4`.

| Phase | Feature | State |
|-------|---------|-------|
| 0 | Monorepo scaffolding, Docker, CI | ✅ |
| 1 | Trace schema + collector SDK + storage API | ✅ |
| 2 | Eval engine (deterministic + LLM-as-judge) | ✅ |
| 3 | Security eval module | ✅ |
| 4 | Regression detector (Welch's t-test) + CI Action | ✅ |
| 5 | Dashboard (waterfall, eval timeseries, security report, project switcher) | ✅ |
| **6–7** | **Demo agent, narrative, docs, launch** | ◻ **next** |

What works end-to-end today: instrument an agent with the `agentproof` SDK →
traces land in the FastAPI/Postgres store → run deterministic / LLM-judge /
security evals via CLI or API → regression gate in CI → **browse it all in the
React dashboard**.

## 2. Phase 6 goal (as scoped by the roadmap)

**A demo research-assistant agent** that exercises the whole stack for the
launch narrative, plus the narrative/docs themselves. The point is a credible,
reproducible story: a real multi-agent app, instrumented, evaluated, and
visualized — not more framework plumbing.

This is **back to Python** (agent code) after the frontend Phase 5.

## 3. What already exists for Phase 6

- `demo_agent/` — **scaffold only**: `pyproject.toml` + an empty
  `demo_agent/demo_agent/__init__.py`. Essentially greenfield.
- **SDK** (`sdk/`, package `agentproof`) — context-manager + decorator
  instrumentation, async exporter, **LangGraph auto-instrumentation adapter**
  (`agentproof.adapters.langgraph.instrument_langgraph`). AutoGen adapter was
  planned, not built.
- **Two seed scripts already produce demo traces** (reuse / learn from these
  before writing new ones):
  - `scripts/seed_dashboard.py` (Phase 5) — posts demo trace DAGs incl. an error
    span and a prompt-injection finding, then triggers evals. **Note:**
    `POST /api/v1/traces/batch` takes a **bare JSON array**, not `{"traces": []}`.
  - `server/agentproof_server/scripts_pkg/seed_demo_traces.py` —
    `build_demo_traces()` / `build_security_demo_traces()`, used by the gated
    integration tests.
- **Server API** (`server/agentproof_server/api/`) — traces ingest/list/detail/
  tree/delete; evals run/run-batch/results/metrics (results now support
  `?project=`). Config-driven by `agentproof.yaml`.
- **Dashboard** (`dashboard/`) — visualizes traces/evals/security per project.

## 4. Likely Phase 6 scope to settle in brainstorming

- Pick the demo domain (e.g. a multi-agent research assistant: planner →
  retriever → writer → fact-checker) and whether to build it on **LangGraph**
  (SDK adapter exists) or hand-instrument with the SDK directly.
- Make it produce **realistic, varied traces** (success, an error path, and an
  adversarial/injection path) so evals + security + the dashboard all have
  something to show. Decide: live LLM calls (needs `ANTHROPIC_API_KEY`) vs a
  recorded/offline mode for a key-free demo.
- Decide how the demo data is loaded for the launch: run the agent live, or ship
  a seed/replay. Reuse `scripts/seed_dashboard.py` where possible.
- **Narrative + docs**: a top-level walkthrough (README/quickstart/maybe a short
  script or recording) that ties SDK → store → evals → regression → dashboard.
- Consider whether the demo surfaces any gap worth a small backend addition
  (keep additive + backward-compatible, as Phase 5's `?project=` was).

## 5. How to start (same flow as Phases 2–5)

1. `superpowers:brainstorming` → design doc in `docs/design/YYYY-MM-DD-…-design.md` (tracked).
2. `superpowers:writing-plans` → plan in `.claude/plans/` (gitignored).
3. `superpowers:subagent-driven-development` (or inline TDD — see §6) task-by-task.
4. **Branch off `main` first.** After merge, tag `phase-6` (annotated) on the merge commit.

## 6. Environment realities (will bite you — read this)

- **npm on Windows:** `node` is NOT on the PATH that npm's `cmd.exe` children
  use → esbuild/postinstall fails. In the Bash tool, prefix every npm command
  with `export PATH="/c/Program Files/nodejs:$PATH"` (env does not persist across
  Bash calls). PowerShell tool was unavailable in the last session.
- **Subagents hit hard session limits mid-run** in the last session; inline TDD
  (red → green → commit per task) proved more reliable. Either works — just
  checkpoint to the ledger.
- **SDD ledger:** `.superpowers/sdd/progress.md` (gitignored scratch). Check it
  on resume before re-dispatching anything.
- **Python tests:** run server tests **from `server/`** (`cd server && pytest`);
  4 regression tests read `../fixtures/...` relative to CWD and "fail" from the
  repo root. Use the repo venv: `./.venv/Scripts/python.exe`.
- **`gh` CLI is not installed and there's no `GH_TOKEN`/`GITHUB_TOKEN`.** Pushes
  work over HTTPS, but **PRs and tags on the merge commit are created by the
  user** — give them the commands / the `pull/new/<branch>` link; don't try to
  run `gh`. Verify remote state with `git ls-remote`.
- Plans live untracked in `.claude/` (gitignored); only specs go in `docs/`.

## 7. Quick verification commands

```bash
# Backend (from server/)
cd server && ../.venv/Scripts/python.exe -m pytest tests/unit -q
../.venv/Scripts/python.exe -m ruff check .

# Dashboard (from dashboard/, PATH-prefixed)
export PATH="/c/Program Files/nodejs:$PATH"
cd dashboard && npm test && npm run build && npm run lint

# Full stack + demo data
docker compose up -d
python scripts/seed_dashboard.py     # then open http://localhost:5173
```

## 8. Pointers

- Phase 5 spec: `docs/design/2026-06-22-dashboard-design.md`
- Phase 5 plan: `.claude/plans/2026-06-22-phase-5-dashboard.md`
- Memory index (auto-loaded each session): the `MEMORY.md` in the project memory dir;
  see `phase-5-execution` and `phase-6-next`.
