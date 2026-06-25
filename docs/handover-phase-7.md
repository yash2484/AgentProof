# AgentProof — Handover to Phase 7 (Launch)

**Date:** 2026-06-24
**Prepared after:** Phase 6 (Demo agent) merged to `main` (PR #6, merge `db30713`) + tagged `phase-6`.
**Audience:** the next session/engineer starting Phase 7 — the final phase toward v1.

---

## 1. Where the project stands

AgentProof is a framework-agnostic eval, observability, and security harness for
multi-agent systems. **Phases 0–6 are done, merged to `main`, and tagged**
(`phase-1` … `phase-6`). `main` HEAD = `db30713`.

| Phase | Feature | State |
|-------|---------|-------|
| 0 | Monorepo scaffolding, Docker, CI | ✅ |
| 1 | Trace schema + collector SDK + storage API | ✅ |
| 2 | Eval engine (deterministic + LLM-as-judge) | ✅ |
| 3 | Security eval module | ✅ |
| 4 | Regression detector (Welch's t-test) + CI Action | ✅ |
| 5 | Dashboard (waterfall, eval timeseries, security report, project switcher) | ✅ |
| 6 | Demo research-assistant agent (LangGraph) + narrative/docs | ✅ |
| **7** | **Launch** | ◻ **next — not yet scoped** |

What works end-to-end today: a real **LangGraph demo agent** (`demo_agent/`),
instrumented only via the `agentproof` SDK + `instrument_langgraph` adapter,
produces success/error/injection traces → they land in the FastAPI/Postgres
store → deterministic / LLM-judge / security evals run via CLI or API → a
regression gate runs in CI → it's all browsable in the React dashboard. One
command drives the whole story:

```bash
docker compose up -d
pip install -e ./sdk -e ./demo_agent
python -m demo_agent run --scenario all --mode replay --export
```

## 2. Phase 7 goal (as scoped by the roadmap)

The roadmap's final row is simply **"launch."** There is **no written spec for
Phase 7** — it must be settled in a `superpowers:brainstorming` pass before any
plan. The first real decision is *what "launch" means for this project*: an
**open-source release** (publish the SDK, polish docs, tag v1.0.0) vs a **hosted
product** (deploy the server + dashboard somewhere, add auth/limits). These imply
very different work; do not assume.

**Candidate scope to settle in brainstorming (NOT yet decided):**

- **Packaging & publishing** — the SDK (`sdk/`, package `agentproof`) and
  possibly the server are not published anywhere. Decide PyPI (real or
  TestPyPI), package names, and whether the demo package ships at all.
  Container images for `server/` + `dashboard/` for a one-command run.
- **Versioning & release** — a `v1.0.0` tag, a `CHANGELOG`, a license check
  (confirm a `LICENSE` exists and headers are consistent), and a release
  workflow (GitHub Action that builds/publishes on tag).
- **Docs polish for a cold reader** — a top-level "what is this / why" intro, an
  architecture diagram, and a quickstart **verified on a clean machine** (the
  current quickstart assumes the repo venv and editable installs). `README.md`
  still says "Status: Active Development" — flip to a release framing.
- **The launch artifact** — a recorded or scripted demo / screencast was
  explicitly out of scope in Phase 6; decide if it's in for launch.
- **Pre-launch hardening (open question)** — the server currently has no auth /
  rate limiting. Whether that's required depends on OSS-vs-hosted. Keep any
  additions additive + backward-compatible (the posture used since Phase 5's
  `?project=`).

## 3. What already exists relevant to launch

- **Packages:** `sdk/` (`agentproof`), `demo_agent/` (`agentproof-demo-agent`),
  `server/` (`agentproof-server`), `dashboard/` (Vite/React/MUI).
- **`docker compose`** brings up postgres + server + dashboard.
- **`docs/walkthrough.md`** (Phase 6) is the end-to-end narrative — a strong
  starting point for launch docs.
- **CI:** `regression.yml` GitHub Action (DB-free, key-free regression gate).
- **No release tooling yet:** no PyPI publish workflow, no `CHANGELOG`, no
  `v*.*.*` semver tags (only `phase-N` tags exist).

## 4. Open items carried from Phase 6 (non-blocking)

The Phase 6 final whole-branch review (Opus) returned **ready-to-merge: yes**
with three Minor findings, deferred as post-merge nice-to-haves. Fold them into a
Phase 7 "polish" task or address opportunistically:

1. `demo_agent/demo_agent/graph.py::run_instrumented` duplicates the
   instrument-and-invoke loop that `export.py` does inline — collapse to one path
   so they can't drift.
2. The SDK LangGraph adapter's `agentproof_meta` path has no dedicated tests for
   the `agent_handoff` or `tool_use`-success branches (the demo never exercises
   them). Cheap to add.
3. `demo_agent/tests/test_export.py::test_trigger_evals_posts_run_batch` asserts
   `raise_for_status` is *defined* but not that it *fired*; add the assertion.

## 5. How to start (same flow as Phases 2–6)

1. `superpowers:brainstorming` → settle OSS-vs-hosted and the concrete launch
   checklist → spec in `docs/design/YYYY-MM-DD-launch-design.md` (tracked).
2. `superpowers:writing-plans` → plan in `.claude/plans/` (gitignored).
3. `superpowers:subagent-driven-development` (or inline TDD) task-by-task.
4. **Branch off `main` first.** After merge, **tag `phase-7` (annotated) on the
   MERGE COMMIT** — note Phase 6's tag landed on the branch tip (`f4f83d5`)
   rather than its merge commit; revert to the Phase 1–5 merge-commit convention.
   If you cut a real release, tag `v1.0.0` as well.

## 6. Environment realities (carried — read this)

- **venv:** `./.venv/Scripts/python.exe`. Run **server** tests from `server/`
  (4 regression tests read `../fixtures/...` relative to CWD). Run **demo** tests
  from the repo root (`pytest demo_agent/tests`). SDK tests: `pytest sdk/tests`.
- **npm on Windows:** `node` is not on the PATH npm's `cmd.exe` children use →
  prefix every npm command in the Bash tool with
  `export PATH="/c/Program Files/nodejs:$PATH"` (env doesn't persist across Bash
  calls). Only relevant if touching the dashboard.
- **No `gh` CLI / token.** Pushes work over HTTPS, but **PRs and tags are
  created by the user**: push the branch, hand over the `pull/new/<branch>` link,
  and give the `git tag -a … && git push origin <tag>` commands. Verify remote
  state with `git fetch --tags --prune` + `git ls-remote` / `git log origin/main`.
- **Opus safety-classifier flakiness:** Bash calls occasionally return
  "claude-opus-4-8 temporarily unavailable, so auto mode cannot determine the
  safety of Bash" — transient; just retry. If the final whole-branch review
  (slated for Opus) is affected, fall back to Sonnet for that review.
- **SDK exporter noise:** when no server is up, the exporter's background thread
  logs "connection refused" / "dropped traces" warnings (notably during
  `demo_agent` export tests). Fire-and-forget — **not** failures.
- **Where things live:** specs → `docs/design/` (tracked); handovers → `docs/`
  (tracked, committed directly to `main`); plans → `.claude/plans/` (gitignored);
  SDD ledger → `.superpowers/sdd/progress.md` (gitignored scratch — check it on
  resume before re-dispatching anything).

## 7. Quick verification commands

```bash
# Backend (from server/)
cd server && ../.venv/Scripts/python.exe -m pytest tests/unit -q
../.venv/Scripts/python.exe -m ruff check .

# SDK + demo agent (from repo root)
./.venv/Scripts/python.exe -m pytest sdk/tests -q
./.venv/Scripts/python.exe -m pytest demo_agent/tests -q     # integration test auto-skips w/o server
./.venv/Scripts/python.exe -m ruff check sdk demo_agent

# Dashboard (from dashboard/, PATH-prefixed)
export PATH="/c/Program Files/nodejs:$PATH"
cd dashboard && npm test && npm run build && npm run lint

# Full stack + demo
docker compose up -d
python -m demo_agent run --scenario all --mode replay --export   # open the dashboard
```

## 8. Pointers

- Phase 6 spec: `docs/design/2026-06-23-demo-agent-design.md`
- Phase 6 plan: `.claude/plans/2026-06-23-phase-6-demo-agent.md`
- End-to-end narrative: `docs/walkthrough.md`
- Demo agent: `demo_agent/` · SDK: `sdk/` · server: `server/` · dashboard: `dashboard/`
- Previous handover: `docs/handover-phase-6.md`
- Memory (auto-loaded each session): `phase-6-next` (now "complete — merged + tagged").
