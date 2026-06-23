# Phase 5 — Dashboard Design

**Date:** 2026-06-22
**Status:** Approved (design); pending implementation plan
**Branch:** (to be created off `main`, e.g. `phase-5-dashboard`)

## 1. Goal & Scope

A read-mostly React dashboard that makes AgentProof's data legible. It lets a
user browse traces, inspect a span **waterfall**, view **eval score
timeseries**, and read a focused **security report**, plus a small set of
interactions (trigger an eval, filter, refresh, delete a trace).

The dashboard talks to the existing FastAPI server over its current REST API.
CORS is already enabled and already defaults to allowing the dashboard origin
(`http://localhost:5173`, see `server/agentproof_server/config.py`).

> **Scope update (post-review):** one additive backend change was made — an
> optional `?project=` filter on `GET /evals/results` (scopes results via the
> owning trace) — to support the top-bar **project switcher** across the Evals
> and Security views. This relaxes the original "no backend changes" constraint
> by a single, backward-compatible query parameter.

### Scope (this milestone): "MVP + interactions"

- Three read views: trace waterfall, eval timeseries, security report.
- Interactions: trigger an eval (`POST /evals/run`), filter/refresh lists,
  delete a trace.

### Out of scope (YAGNI — deferred to later phases)

Auth, websockets / live push, saved views, export/share, multi-project RBAC,
production build/serving optimization.

## 2. Stack

- **Vite + React + TypeScript** (base; already implied by `dashboard/Dockerfile`
  and the `dashboard` service in `docker-compose.yml`).
- **MUI** component library + **MUI X Charts** (timeseries) + **MUI X DataGrid**
  (trace/results tables).
- **TanStack Query** for data fetching/caching/invalidation.
- **React Router** for routing.
- **Vitest + React Testing Library**; `fetch` mocked with static fixtures.
- Reads `VITE_API_URL` (already provided to the container as
  `http://localhost:8000`).

### API typing — hand-written domain types (single source of truth)

The FastAPI routes currently return bare `-> dict` / `-> list[dict]`, so the
server's OpenAPI schema does **not** describe the trace/span/eval response
bodies — `openapi-typescript` would only generate request-param types, not the
response shapes we actually render. Generating types therefore buys little here.

Instead, the dashboard keeps **hand-written domain types** in `src/types/` that
mirror the data contract in §10, used as the single source of truth by the
`src/api/` client and all components. To keep them honest against the real API,
the `api/` client tests assert the fixture shapes match these types, and the
seed script + live API exercise the same shapes end-to-end during dev.

> **Future improvement (out of scope for Phase 5):** add Pydantic
> `response_model`s to the FastAPI endpoints so the OpenAPI schema becomes rich;
> at that point we can switch `src/types/` to generated types via
> `openapi-typescript`.

## 3. Views (routes)

| Route | View | Key API |
|-------|------|---------|
| `/traces` | Trace list: DataGrid (name, project, status, latency, tokens, cost, time), filters (project / status / date range), pagination, row → detail, delete action | `GET /traces`, `DELETE /traces/{id}` |
| `/traces/:id` | **Waterfall** of the span DAG + side panel for the selected span + that trace's eval results + a **"Run eval"** button | `GET /traces/:id/tree`, `GET /evals/results/{id}`, `POST /evals/run` |
| `/evals` | **Score timeseries** — line chart of `score` over `evaluated_at` grouped by `metric_name`, with a threshold reference line; metric / project filter | `GET /evals/results`, `GET /evals/metrics` |
| `/security` | **Security report** — one card per security metric (`injection_resistance`, `data_exfiltration`, `tool_misuse`): pass/fail, score vs threshold, explanation, links to offending spans | `GET /evals/results?metric_name=…`, `GET /evals/metrics` |

App shell: MUI sidebar nav (Traces / Evals / Security) + a top bar with a
project switcher.

## 4. The Waterfall (the one nontrivial component)

`GET /traces/:id/tree` returns the span DAG as nested root nodes with `children`.
Each span carries `start_time`, `end_time`, `latency_ms`, `span_type`, `status`,
`error_message`, `metadata`, `tags`.

Rendering approach — a Gantt-style waterfall:

- A **pure layout function** (`src/lib/waterfall.ts`) maps each span to
  `{ offsetPct, widthPct, depth }` relative to the trace window
  `[min(start_time), max(end_time)]`. Pure and React-free so it is unit-tested
  in isolation.
- Rows are indented by DAG depth. The schema allows **multiple parents**; a span
  reachable by several paths is placed at its **deepest** path (max depth) and
  rendered once.
- Bars are colored by `span_type` (single shared color map, see §5); a span with
  `status == "error"` gets a red marker.
- Clicking a bar opens a **side panel** (`SpanDetailPanel`) showing the span's
  `metadata` (LLM prompt/completion, tool args, retrieval sources), latency,
  tokens, status, and error message.

Edge cases the layout function must handle: zero-duration spans (render a
minimum-width sliver), a single span, error spans, and multi-parent spans.

## 5. Code Structure

```
dashboard/
  package.json, vite.config.ts, tsconfig.json, .eslintrc, index.html
  src/
    api/         thin typed fetch client (one fn per endpoint), typed via src/types
    hooks/       TanStack Query hooks: useTraces, useTrace, useTraceTree,
                 useEvalResults, useMetrics, useRunEval, useDeleteTrace
    pages/       TracesPage, TraceDetailPage, EvalsPage, SecurityPage
    components/  Waterfall, SpanDetailPanel, ScoreTimeseries, SecurityReportCard,
                 Filters, AppShell, QueryBoundary
    lib/         waterfall layout fn; formatters (formatDuration/formatCost/formatTokens);
                 SPAN_TYPE_COLORS map (single source of truth, used by waterfall, legend, panel)
    types/       hand-written domain types mirroring the §10 data contract (single source of truth)
    test/        fixtures + setup
```

## 6. Data / Dev / Demo

A Python **seed script** (`scripts/seed_dashboard.py`) provides dev and demo
data and is reusable in Phase 6:

- Builds a handful of realistic multi-span trace DAGs mixing `llm_call`,
  `tool_use`, `retrieval`, and `agent_handoff` spans — including **one trace with
  an error span** and **one trace that produces a security finding**.
- Posts them via `POST /traces/batch`, then calls `POST /evals/run-batch` to
  generate eval + security results.

The dashboard is developed against the **live API** (`docker compose up`).
Frontend unit/component tests use **static fixtures with mocked `fetch`**, not
the live server.

## 7. Error / Loading / Empty States

- TanStack Query `isLoading` → MUI `Skeleton` placeholders.
- Query errors → MUI `Alert` with a retry action.
- Empty result sets → an empty state that points the user at the seed script.
- A small reusable `<QueryBoundary>` wraps these three states so pages stay lean.
- After a successful **"Run eval"** POST, `invalidateQueries` for that trace's
  eval results so the panel refreshes automatically (no manual reload).

## 8. Testing

- `lib/waterfall` layout math — pure-function tests covering multi-parent,
  zero-duration, single-span, and error-span cases.
- `api/` client — URL/query-string construction and error mapping, with mocked
  `fetch`.
- hooks / pages — loading / error / data render paths via RTL + fixtures.
- One smoke test per page (`/traces`, `/traces/:id`, `/evals`, `/security`).

## 9. Backend Notes

- CORS already enabled (`main.py`) and `cors_origins` already defaults to
  `["http://localhost:5173"]` (`config.py`). Confirm only.
- One additive change (post-review, see §1): `GET /evals/results` gained an
  optional `?project=` query param that filters via the owning trace.
- All other required endpoints already exist:
  - Traces: `GET /traces`, `GET /traces/{id}`, `GET /traces/{id}/tree`,
    `DELETE /traces/{id}`.
  - Evals: `POST /evals/run`, `POST /evals/run-batch`, `GET /evals/results`,
    `GET /evals/results/{trace_id}`, `GET /evals/metrics`.

## 10. Data Contract (reference)

**Trace** (`GET /traces` item): `trace_id`, `project`, `name`, `start_time`,
`end_time`, `total_latency_ms`, `total_tokens`, `total_cost_usd`, `status`,
`tags`, `created_at`.

**Span** (`tree` node / trace `spans[]`): `span_id`, `trace_id`,
`parent_span_ids[]`, `span_type`, `name`, `start_time`, `end_time`,
`latency_ms`, `status`, `error_message`, `metadata`, `tags` (+ `children[]` in
the tree response).

**Eval result** (`GET /evals/results*` item): `trace_id`, `span_id`,
`metric_name`, `metric_type`, `score`, `explanation`, `threshold`, `passed`,
`details`, `raw_judge_output`, `baseline_id`, `evaluated_at`.

**Metrics** (`GET /evals/metrics`): `project`, `judge_model`,
`metrics[{ name, type, applies_to, threshold }]`.
