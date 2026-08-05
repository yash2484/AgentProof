# AgentProof — Progress

**Current phase:** Phase 8 — dashboard redesign (complete, pending review/merge)
**Branch:** `phase-8-dashboard-redesign`
**Last updated:** 2026-08-05

## Last verified working

Full verification sweep run 2026-08-05 against a live stack (`docker compose up -d`).

| Check | Result | How verified |
|---|---|---|
| Dashboard suite | 139 passed / 22 files | `npx vitest run` |
| Server suite (host) | 142 passed, 10 skipped | `pytest tests/` from `server/` |
| Server DB-backed tests | 7 passed | `pytest ... -o asyncio_mode=auto` inside the `server` container |
| SDK suite | 43 passed | `pytest tests/` from `sdk/` |
| demo_agent suite | 38 passed | `pytest tests/` from `demo_agent/` |
| `tsc -b` | exit 0 | dashboard |
| `eslint . --ext ts,tsx` | exit 0 | dashboard |
| `ruff check sdk/ server/` | All checks passed | repo root |
| No raw hex outside `theme/` | clean | recursive grep over `dashboard/src` |
| Playwright sweep | PASS | 4 routes × 2 viewports, real Chromium |

The 10 skipped server tests are the DB-backed and API-key-gated integration
tests; they skip on the host because a native `postgres.exe` shares port 5432
with Docker (see Known issues). They were run separately inside the container
and pass — see the row above.

## Built & verified

- [x] **Token system** (`dashboard/src/theme/`) — Graphite & Magenta. Every colour, type step and spacing value is a named token. A contrast test recomputes WCAG 2.1 ratios for every token against both page backgrounds and fails the build on regression. *Verified: 22 contrast assertions pass; all 8 spec ratios reproduce exactly.*
- [x] **`GET /api/v1/evals/summary`** — read-only per-metric aggregates computed in SQL, project-scoped via the traces join. *Verified: 11 unit tests + 3 DB-backed tests against real Postgres, including a project-isolation test.*
- [x] **Bento Overview page** at `/` — security verdict leads at 2×2, gate / p99 / pass-rate as small tiles, latest-trace mini waterfall full width. *Verified: renders live against the stack at 1440px and 375px.*
- [x] **Persistent left rail**, collapsing to a drawer below 768px. *Verified in-browser: permanent at 1440px, collapsed behind a menu button at 375px.*
- [x] **Defect 1 — waterfall unreadable at sub-ms durations.** Root cause: a missing `start_time` was coerced to `0`, dragging the window origin to the Unix epoch. *Verified: regression test proven to fail against the reintroduced bug.*
- [x] **Defect 2 — eval x-axis spanning ~4 seconds.** Now plots run index; timestamp moved to the tooltip. *Verified: regression test proven to fail under a per-metric-axis regression.*
- [x] **Defect 3 — duplicate unattributed security cards.** Attribution is now unconditional. *Verified: N traces produce N distinct linked cards.*
- [x] **Defect 4 — nav click blocked by the span panel.** *Verified in a real browser: a pointer click on the rail navigates with the panel open. This is the only proof that exists — jsdom cannot reproduce it.*
- [x] **Trace delete 500** (out-of-plan fix) — `eval_results.trace_id` had no `ondelete` rule, so deleting any evaluated trace returned HTTP 500 and the dashboard's Delete button failed. *Verified end-to-end: 500 → 204, trace and its 8 eval rows removed, other traces untouched.*
- [x] **`test-dashboard` CI job** — the dashboard's tests, typecheck and lint now run on every PR. They previously ran nowhere.

## Known issues

1. **Docker image staleness after a dashboard dependency change.** `docker-compose.yml` masks `node_modules` with an anonymous volume, which survives `docker compose up --build`. After adding a dashboard dependency you must run `docker compose rm -sfv dashboard` before `up -d`, or Vite fails to resolve the import and serves a blank page. **Never use `docker compose down -v`** — that destroys the `pgdata` volume.
2. **Port 5432 is shared** between Docker's Postgres and a native `postgres.exe`. Host-side `pytest` reaches the wrong database, so DB-backed tests skip there. Run them inside the `server` container with `-o asyncio_mode=auto` (the container has only `server/pyproject.toml`, not the repo-root file that sets `asyncio_mode`).
3. **The full server suite cannot run inside the container** — the SDK is not installed there, so `test_trace_pipeline.py` fails to collect. Host for the full suite, container for the DB tests.
4. **The span panel is invisible to screen readers' navigation.** MUI's Modal sets `aria-hidden="true"` on `#root` while the panel is open, so the nav rail is unreachable in the accessibility tree even though it is fully clickable with a mouse. Not a regression — inherent to `variant="temporary"`. A `variant="persistent"` panel would avoid it.
5. **`sdk/tests` and `demo_agent/tests` cannot be collected in one pytest run** — both name their test package `tests`. Run them separately.
6. **Replay-mode screenshots stay weak** because span durations really are near-zero. The waterfall fix makes them legible, not interesting. Shooting the demo in `--mode live` needs an Anthropic API key.

## Open decisions

- **Anthropic API key.** `.env` still holds a placeholder, so `faithfulness` and `relevance` fail closed at 0.0 and `--mode live` is unavailable. `openai_api_key` in `server/config.py` and `OPENAI_API_KEY` in `docker-compose.yml` are dead settings — nothing reads them.
- **Overview bento layout has a visual hole** at 1440px: the pass-rate tile sits alone on row 3, leaving two columns empty before the latest-trace strip. Functional, but a showpiece frame deserves better balance.
- **Phase 9 scope** — unscoped. Launch items (tags, `v1.0.0`, PyPI, README status line) remain from the Phase 7 handover.

## Next up

1. Whole-branch code review, then merge `phase-8-dashboard-redesign`.
2. Decide the Overview layout balance question above.
3. Scope Phase 9.
