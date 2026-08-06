# AgentProof — Handover: judge provider abstraction

**Date:** 2026-08-06
**Prepared:** mid-brainstorm, before the design doc was written.
**Audience:** the next session picking this up cold.

## 1. Where the project stands

Phase 8 (dashboard redesign) is **complete and merged**. `main` is at `1477e33`
(merge of PR #8). Working tree clean. Docker down, `agentproof_pgdata` intact.

Test state on `main`: dashboard 140, server 142 passed / 10 skipped (plus 7
DB-backed tests that only run with the stack up), sdk 43, demo_agent 38.
`tsc`, `eslint`, `ruff` clean. Six CI jobs, all green — including the new
`test-dashboard` job that gates the dashboard's tests for the first time.

`PROGRESS.md` on `main` carries the verification record, known issues and
environment gotchas. Read it before touching anything.

## 2. What this next piece is

Two of eight metrics — `faithfulness` and `relevance` — are `llm_judge` type and
score **0.0** without a working Anthropic key. The user's Anthropic billing is
not working. They chose to **build an OpenAI adapter** rather than wait or
switch clouds, because it also delivers the provider abstraction their
engineering standards already call for ("abstract providers behind one client
interface so a third is a drop-in") and which was never built.

The other six metrics (3 deterministic, 3 security) run key-free and are
unaffected.

## 3. Decisions locked during brainstorming

Do not relitigate these without cause. The user chose each explicitly.

| Decision | Choice |
|---|---|
| Provider selection | **Infer from the model name** — `claude-*` → Anthropic, `gpt-*`/`o*` → OpenAI. No new config keys. |
| Unknown model prefix | **Fail loudly.** Never guess or default — a wrong guess yields plausible scores from the wrong grader, which is worse than a crash. |
| Baseline provenance | **Record the judge model on baselines**; the regression detector refuses to compare across a change and says re-pin required, instead of reporting a false regression. |
| Adapter shape | **Approach A — normalize behind a `JudgeClient` protocol.** Rejected: an Anthropic-shaped shim (dishonest, doesn't deliver the claim) and a provider registry (YAGNI for two providers). |

## 4. Design presented so far, and where it stopped

**Section 1 (the seam and provider resolution) was presented and is awaiting
the user's approval.** Sections 2 and 3 were not presented.

Section 1 as presented:

- New `eval_engine/judge_client.py` holding a `JudgeCall` result model
  (`parsed`, `refusal`, `error`, `input_tokens`, `output_tokens`) and a
  one-method `JudgeClient` Protocol:
  `complete_structured(*, model, system, prompt, schema) -> JudgeCall`.
- `run_structured_judge` keeps its name, signature and never-raises contract,
  but its body becomes provider-neutral: call `complete_structured`, map the
  result into the existing record dict. `_JUDGE_SEMAPHORE` stays wrapping the
  call. Nothing above it moves.
- Two implementations, `AnthropicJudgeClient` (near-lift of today's body) and
  `OpenAIJudgeClient`, each owning only "structured request → `JudgeCall`".
- `resolve_judge_client(model) -> JudgeClient`, with clients **cached per
  model** so a 200-trace batch doesn't build 200 SDK clients.

**Still to design (sections 2 and 3):**

- Baseline provenance: where `judge_model` lives on the Pydantic `Baseline`,
  how the detector reports a mismatch, and what "unknown provenance" means for
  the two already-committed baseline files.
- Error handling, dependency policy (is `openai` a hard dep or an extra?),
  and the test strategy for reworking the judge tests.

Then: write the spec to `docs/superpowers/specs/`, self-review it, get user
review, and only then invoke `superpowers:writing-plans`. **Do not skip to
implementation** — the brainstorming skill gates on an approved written spec.

## 5. Load-bearing facts about the current code

Gathered this session. Verifying them again is cheap; assuming them is not.

**The seam already exists.** `LLMJudgeEvaluator.__init__(config, judge_model,
client=None)` only constructs `anthropic.Anthropic()` when nothing is injected
(`llm_judge.py:106-109`). That dependency injection is why an adapter is small
work rather than a refactor.

**`run_structured_judge(client, model, system, prompt, schema)`** is a free
function — the natural abstraction point. It calls `client.messages.parse(...)`
and reads `response.parsed_output`, `response.stop_reason == "refusal"`, and
`response.usage.input_tokens` / `.output_tokens`. It never raises; on failure it
returns `(None, {"error": ...})` or `(None, {"refusal": True})`.

**`JudgeResponse`** is `reasoning: str, score: float` — reasoning first *so it
is generated first*. Preserve that ordering in any adapter; it is a prompting
decision, not cosmetic.

**~20 tests in `server/tests/unit/test_llm_judge.py`** inject a `MagicMock`
shaped like Anthropic's client and assert on
`client.messages.parse.call_args.kwargs`. These are the tests Approach A
reworks — they should end up asserting against the protocol, which makes them
less brittle.

**Baselines are file-based, not a DB table.** The regression detector uses the
**Pydantic** `Baseline` at `eval_engine/models.py:106`, serialized to
`baselines/*.json`. Its own docstring says the DB columns are not modelled
"because Phase 4 is file-based". The ORM `Baseline` table in `db/models.py` is
not used by this path.

**So adding `judge_model` needs no migration** — which matters, because this
project has no working migration path (see Known issues).

**The field must be optional.** The two committed baseline files
(`baselines/demo-research-agent.json`, `baselines/demo-agent-replay.json`) have
keys `project, metric_name, scores, mean, std, sample_size, created_at` and no
`judge_model`. Baselines also exist for *deterministic* metrics such as
`latency_budget`, which have no judge at all. A required field breaks the CI
regression gate on the first run.

**Both API-key config settings are dead.** `openai_api_key`
(`server/config.py:27`) has **zero** readers outside its declaration.
`anthropic_api_key` likewise — the Anthropic SDK reads `ANTHROPIC_API_KEY`
straight from the environment. Decide whether to wire or delete them; leaving
them implies support that does not exist.

**Config today:** `agentproof.yaml` sets `judge_model: claude-sonnet-4-6` with a
per-metric override `judge_model: claude-haiku-4-5` on one metric (deliberate
cost tiering — preserve it). Server deps include `anthropic>=0.40.0`; there is
no `openai` dependency yet.

**`.env` is gitignored** (`.gitignore:20`) and has never been committed. It is
a safe place for a key. Never print or commit one.

## 6. What is left for v1 beyond this

From the whole-branch review and a packaging check this session:

- **PyPI is ready.** The SDK builds and `twine check` **PASSES** both wheel and
  sdist. Publishing is a `twine upload` away.
- **Tags stop at `phase-6`** — no `phase-7`, no `phase-8`, no `v1.0.0`. All four
  packages are still `0.1.0`.
- **README has no badges** (CI, licence, PyPI). 180 lines. LICENSE (MIT) exists.
- **Alembic gap.** The model declares `ondelete="CASCADE"` on
  `eval_results.trace_id` but `versions/` is empty and there is no
  `alembic_version` table, so the deployed schema lacks it. `delete_trace`
  removes eval rows explicitly to cover old databases — but CI's fresh Postgres
  builds the constraint *with* cascade, so that explicit delete is never
  actually the thing under test. **This is the highest-value follow-up.**
- **Shape tokens drifted.** Bento tiles render at 25px, `MuiPaper` surfaces at
  10px. The Phase 8 plan bound colour and type with mechanical greppable rules
  and left shape unconstrained; shape drifted as a direct result.
- **Three disagreeing breakpoints:** 768 (rail), 900 (`SecurityPage`),
  768/1024 (Overview grid).
- **Span panel a11y.** MUI's Modal sets `aria-hidden="true"` on `#root`, so the
  whole trace detail page leaves the accessibility tree while the panel is open,
  and `disableEnforceFocus` leaves focus inside that hidden subtree.
- **`docs/` leads with three handover files** (including this one). Scaffolding,
  not product docs — a v1 repo should not open with them.

## 7. Environment gotchas that cost real time

- **Port 5432 is shared** between Docker's Postgres and a native `postgres.exe`
  (PID varies). Host-side `pytest` reaches the wrong database, so DB-backed
  tests **skip** there. Run them inside the `server` container.
- **Inside the container you must pass `-o asyncio_mode=auto`** — the container
  only has `server/pyproject.toml`, not the repo-root file that sets it. Without
  it every async fixture errors with a pytest-internal
  `assert not self._finalizers`, which looks like broken tests.
- **The container has no pytest by default** after a rebuild;
  `pip install pytest pytest-asyncio` inside it.
- **The full server suite cannot run in the container** — the SDK is not
  installed there, so `test_trace_pipeline.py` fails to collect. Host for the
  full suite, container for the DB tests.
- **`docker-compose.yml` masks `node_modules` with an anonymous volume** that
  survives `up --build` *and* container recreation. After adding a dashboard
  dependency you must `docker compose rm -sfv dashboard` then `up -d`, or Vite
  cannot resolve the import and serves a blank page.
- **Never `docker compose down -v`** — it destroys `pgdata`.
- **PowerShell 5.1 has no `&&`.** Use `;` with `if ($?)`, or the Bash tool.
- **Tell subagents to run tests in the foreground** with `--reporter=basic`.
  Agents that background `npm test` stall waiting for a notification that never
  arrives inside a subagent.

## 8. Process notes worth carrying forward

- **Prove regression tests discriminate.** Three times this plan shipped a test
  that passed against the un-fixed code. The fix each time was to reintroduce
  the bug minimally and watch the test fail. It also caught an *inert*
  accessibility fix that a green test would have hidden.
- **Never put AI attribution in git.** No "Generated with Claude Code" footer,
  no `Co-Authored-By: Claude` trailer, in commits, PR bodies or merge text. The
  user reviewed the 84 existing commits that carry the trailer and chose
  **going-forward-only** — no rewrite, no force-push. Do not re-offer.
- **Use the custom subagents** (`frontend-developer`, `frontend-reviewer`, etc.)
  rather than generic ones where they fit.
