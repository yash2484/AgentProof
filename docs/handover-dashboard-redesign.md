# AgentProof — Handover: Dashboard Redesign

**Date:** 2026-08-02
**Prepared after:** brainstorming completed and the design spec approved.
**Audience:** the next session picking up the dashboard redesign from a cold start.

## 1. Start here

Read [`docs/superpowers/specs/2026-08-02-dashboard-redesign-design.md`](superpowers/specs/2026-08-02-dashboard-redesign-design.md).
It is the approved spec and the single source of truth for this work.

**The immediate next step is to invoke `superpowers:writing-plans` against that spec.**
Brainstorming is finished; do not re-run it. Do not start writing components before the
plan exists.

The user has asked that `ui-ux-pro-max`, `impeccable`, `karpathy-guidelines` and
`context-mode` all be used during implementation. `context-mode` should route any command
whose output could exceed ~20 lines.

## 2. What was decided, and why

| Decision | Choice |
|---|---|
| Layout | **D** — bento overview page, control-room density on the working pages |
| Palette | **Graphite & Magenta** (`#141317` bg, `#1D1B22` surface, `#D6409F` brand) |
| Framework | **Stay on MUI 6** — no migration |
| Aggregates | **New read-only server endpoint** `GET /api/v1/evals/summary` |

Two pieces of reasoning are load-bearing and should not be relitigated without cause:

**The brand hue is constrained by semantics.** This is a pass/fail product, so green, red
and amber must mean metric-held, metric-regressed, and near-threshold. The palette
originally proposed (Tailwind slate `#0F172A` + emerald `#22C55E`) is broken on this point,
not merely clichéd: its brand accent *is* the PASS colour. Magenta was chosen because it
sits furthest from every semantic band.

**The dashboard did not look templated because of MUI.** It looked templated because
`dashboard/src/theme.ts` was two lines. Migrating frameworks would have discarded 41
passing tests to fix something the theme file causes.

## 3. Where the project stands

`main` HEAD is `db30713` (Phase 6). Current branch is `phase-7-agent-ci-gate`.

**PR #7 is open, mergeable, and all five checks pass** — `agent-gate`, `fixture-gate`,
`test-server`, `test-sdk`, `lint`. It carries the agent CI gate, the `min_sample_size` fix,
the `docker-compose` mount that makes the README's headline command work, and the pricing
fix. It has not been merged; that is the user's call.

Working tree at handover: `.gitignore` modified (added `.superpowers/`), and
`docs/superpowers/` newly added. Both are committed alongside this handover.

Docker is **down** — `docker compose down` was run without `-v`, so the `pgdata` volume
and all existing traces survive. `docker compose up -d` restores the stack.

## 4. Verified defects the redesign must fix

These were found by running the stack and driving it with Playwright, not by reading code.
Each needs a regression test.

1. **Waterfall unreadable in replay mode.** Spans are 0–1 ms and collapse to specks;
   `fact_checker` does not render at all.
2. **Eval timeseries x-axis spans about four seconds** — every trace in a batch export
   lands in the same instant and the axis plots raw timestamps.
3. **Security page shows duplicate all-PASS cards** with no indication of which trace each
   came from.
4. **Nav link click times out while the span-detail panel is open** — the panel intercepts
   pointer events.

## 5. Environment gotchas

**The SDK and demo_agent test suites cannot be collected in one pytest run.** Both packages
name their test package `tests`, producing 6 collection errors. Run them separately:
`pytest sdk/tests`, then `pytest demo_agent/tests`. Pre-existing, unrelated to this work.

**PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or use the Bash tool.

**Node may not be on the PATH npm's child processes inherit.** Prefix with
`export PATH="/c/Program Files/nodejs:$PATH"` if npm can't find it.

**The brainstorming companion server times out after 4 hours idle** and writes a
`server-stopped` marker. Restarting creates a *new* session directory with an empty
`content/` folder — mockups from the previous session must be copied across. Mockups from
this session are under `.superpowers/brainstorm/*/content/` (gitignored):
`visual-direction.html`, `layout-directions.html`, `palettes.html`.

**Playwright is not a project dependency.** It was installed into a throwaway venv at
`<scratchpad>/pwvenv` rather than polluting project deps. Recreate if needed.

## 6. Palette contrast — already measured

Ratios against surface `#1D1B22`, WCAG 2.1. **Two tokens fail at body size and are split
into solid and text variants.** Do not use the solid values for body copy.

| Token | Hex | Ratio | Note |
|---|---|---|---|
| ink | `#F2F0F5` | 15.06 | |
| muted | `#918C9C` | 5.22 | |
| brand.solid | `#D6409F` | 4.13 | fills/bars/borders only |
| brand.text | `#E255AC` | 4.97 | body-size brand text |
| status.pass | `#3FCF8E` | 8.54 | |
| status.fail.solid | `#E5484D` | 4.35 | fills/bars only |
| status.fail.text | `#EC5F63` | 5.18 | body-size failure text |
| status.warn | `#E2A336` | 7.73 | |

The spec calls for a test that recomputes these and fails the build on regression.

The magenta is used **flat — never as a gradient.** A magenta gradient is its own cliché
and would defeat the reason for choosing the colour.

## 7. Open items outside this work

- **Anthropic API key.** `.env` holds the placeholder `sk-ant-your-key-here`. Without a
  real key, `faithfulness` and `relevance` fail closed at 0.0, and `--mode live` is
  unavailable. The user reported being unable to add funds at console.anthropic.com;
  options discussed were fixing billing, Claude via Vertex/Bedrock (structured outputs is
  GA on both), or adding an OpenAI judge adapter. `openai_api_key` in
  `server/agentproof_server/config.py` and `OPENAI_API_KEY` in `docker-compose.yml` are
  currently **dead settings** — nothing reads them.
- **Merging PR #7.**
- **Phase 7 launch scoping** — tags, `v1.0.0`, PyPI, README status line. Still unscoped.
- **Replay-mode screenshots stay weak** even after the waterfall fix, because the
  durations really are near-zero. Shooting the demo in `--mode live` is the real fix and
  depends on the key.
