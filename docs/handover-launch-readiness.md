# Handover — findings, and what to do before posting

**Written:** 2026-08-11 · **Branch:** `overview-analytics`, head `81112b9`
**For:** the session that prepares AgentProof for a public post, a demo
recording, and a job application.

The build work is done and verified. What remains is almost entirely
**presentation and sequencing**, plus one repository problem that would
undo the rest of it.

Read §4 first if you read nothing else. It contains the one thing that must
happen before anything is posted.

---

## 1. Where things stand

Ledger is implemented across all six routes, the app lands on the measured
corpus, and the branch is 30 commits ahead of `main`.

| Suite | Result | Command |
|---|---|---|
| dashboard | 383 passed, 32 files | `npx vitest run` from `dashboard/` |
| server unit | 355 passed | `python -m pytest tests/unit -q` from `server/` |
| server DB | 35 passed, **1 intermittent** | see Known issues #12 in `PROGRESS.md` |
| lint | clean | `ruff check .` from repo root |
| types + lint | exit 0 | `npx tsc --noEmit`, `npx eslint src --max-warnings 0` |
| build | 4 latin woff2, 191 kB | `npx vite build` |
| browser | 12/12 clean | `python scripts/ui_audit.py` |
| demo readiness | passes | `python scripts/demo_check.py` |

Two scripts now carry the visual gate and should be run whenever the theme
or the landing project changes:

- **`scripts/ui_audit.py`** — overflow with the responsible element named,
  console errors, the font families actually resolved, and a WCAG AA sweep
  per text node. Six routes at 1440px and 390px. Reports, does not gate.
- **`scripts/demo_check.py`** — **fails** if the app lands anywhere but the
  measured corpus, or if a generated-data marker appears anywhere a
  screenshot could catch it. Run before any capture.

---

## 2. What the build turned up

Four defects that a green test suite could not have caught. They are worth
knowing because they say something about what to verify in future.

1. **The serif was invisible, silently.** `Source Serif 4 Variable` unquoted
   is invalid CSS — a font-family identifier may not begin with a digit — so
   browsers discarded the entire declaration. Headings rendered at the right
   size, weight and tracking in the wrong face, with nothing in the console.
   It survived a full green suite and a visual pass.
2. **The chart series ramp was still dark-ground logic.** It lightened each
   sibling series toward white, which on paper walks series 2–4 into the
   background. Only one lightening step clears 3:1 on a light ground.
3. **The scope bar asserted a falsehood.** Given no run data it printed
   "0 runs · never evaluated" above a page listing 300 traces. Absent is not
   zero — the product committing the exact laundering it exists to prevent.
4. **The verdict lede leaked a developer diagnostic.** On the measured corpus
   the largest sentence in the product read `Small sample -> absolute-drop
   floor: drop 1.000 >= 0.05..`.

**The lesson, generalised:** a test suite cannot see a font, a colour that was
discarded, or an element pushed off-screen. That is why `ui_audit.py` exists.

Deliberately **not** built: the spec's `⌘K` affordance. There is no command
palette, and advertising a shortcut that does nothing is worse than silence.

---

## 3. The corpus, after the live re-run

Re-ran `demo_agent --mode live` on 2026-08-10 against a working key.

| | Before | Now |
|---|---|---|
| traces | 32 | **45** |
| measurements | 312 | **520** |
| computed by code | 195 | **390** |
| genuine judge verdicts, with reasoning | 60 | **108** |
| judge calls that failed auth | 12 | **12** (all historical) |

Cost to date: **$0.128** across 37,800 tokens. The 12 `401` rows are kept
deliberately — they are the live demonstration that a broken measurement is
excluded rather than counted as a failure.

**The re-run removed the regression, and this changes the demo.** All 8
metrics are now comparable and none regressed; `faithfulness` improved from
0.911 to 0.925. What replaced it is the restraint case:

```
relevance   base=0.931  cand=0.908   p=0.3877 >= alpha=0.05,  d=0.113 < 0.5
```

An effect exists, neither guard clears, and the product declines to call it.
That sentence is the strongest thing the product says, and almost nothing
else in this category prints it.

---

## 4. What to do, ranked

### P0 — blocks posting. Do these first.

**1. Merge `overview-analytics` into `main`.**

`main` currently holds the **pre-Ledger dark dashboard** — verified:
`bg: #141317`, `<meta name="color-scheme" content="dark">`. Anyone who clicks
through from a post lands on the old product. Every claim in the post is
undermined by one click, and founders click through.

All gates are green on the branch. There is nothing half-finished on it.
This is the single highest-value action available and it is mostly mechanical.

**2. Rewrite the README for someone who arrived from a post.**

It currently has **no screenshots at all** — four badges and 330 lines of
prose. A visitor sees no product. It also predates Ledger and the analytics
rework, so it describes an older thing.

Minimum: the new dashboard captures (already at 1440px / `dsf=2` in the
session scratchpad), the positioning sentence from §5, and an honest
statement of what the corpus is. The README is the landing page for
everything the post drives.

### P1 — decides whether the post lands

**3. Decide and build the demo opening.**

There is currently **no regression on the demo corpus**, so the "CI blocks a
merge" frame has no data behind it. Two honest routes:

- **Produce a genuinely degraded agent version** — weaken the writer prompt,
  re-run, let the gate catch it for real. This gives you *both* frames: a real
  block and a real refusal-to-conclude. Recommended, and it is a legitimate
  change rather than a staged one.
- **Open on the restraint case instead**, which is the more distinctive claim.

**Do not re-pin a baseline to manufacture a regression.** That would fabricate
the exact claim this product exists to make honestly, and it is the one thing
that would be genuinely damaging if noticed.

**4. Run the repo audit that was already flagged.**

Noted previously as needed before the Cekura send and never confirmed done.
P0 item 2 overlaps with it; do them together.

### P2 — credibility bugs a visitor could hit

**5. Fix the eval batch timeout in `demo_agent/demo_agent/export.py`.**

`trigger_evals` uses a short HTTP timeout. The batch genuinely takes ~7
minutes for 13 traces. The client gives up, the disconnect cancels the server
handler, and **nothing is written** — it looks like a crash. This is the
first thing a new user runs, and it fails for them.

**6. Known issue #12 — the batch endpoint returns 200 without persisting.**

`test_eval_pipeline_end_to_end` fails intermittently (2 in 4 runs): POST a
batch, get 200, then 404 on the trace, with no rows in Postgres afterwards.
An endpoint that reports success without writing is the same class of defect
as a metric that reports a pass without measuring. Not caused by the frontend
work — `git diff 36b77c2..HEAD` touches zero backend files.

### P3 — real, but not before posting

- **R7** — Budgets panel admits it cannot show the margin. Unblocked by
  `measured_quantity`. Chart p50/p99 of `latency_ms` and `cost_usd`.
- **R9** — findings capped at 50 with no disclosure. Latent, but a silent
  truncation is the one failure mode this product exists to remove.
- **R25** — the Claude Code transcript importer and fixed-task
  self-benchmarking. The most *interesting* item here and the weakest fit for
  a deadline. Read R24 before starting it.

---

## 5. Positioning — use this language

Full reasoning in `review-later.md` R23–R26. **All of it is judgement,
inferred from what the code does well, validated with nobody.** Sanity-check
it against two or three people who actually ship an agent before it goes on a
CV or a landing page.

**What it is:** a **CI regression gate for a team shipping an agent as a
product.** A fixed eval set runs against a pinned baseline and returns a
verdict per run carrying a p-value and an effect size.

**The wedge, and the only claim worth leading with:** other tools report that
a number moved. This one reports whether it moved further than the *measured*
noise, and refuses to answer when the sample cannot support an answer.

**What it is not:** an observability or monitoring product. Evaluation is
after-the-fact and batch; there is no live ingest. Competing with LangSmith
or Langfuse on tracing means competing where this is weakest — and they own
that segment by default, because they ship with the framework those teams
already use.

**Who:** teams of 2–15 shipping an agent as a core product feature, with CI
already running. Sharpest where the output is regulated, because
"unexercised, not proven" is a compliance artefact for them. **Start in the
LangGraph community** — the SDK already ships an adapter, so integration is
one line.

**Who not:** individual developers using an LLM CLI. Structurally wrong (R24:
every ad-hoc session is a different task, so there is no fixed input to pin a
baseline against) and large enough to generate attention that will not
convert.

**For the post:** lead with the stance, not the UI. The screenshot supports
the claim; it is not the claim.

---

## 6. On the external feedback already received

A prior review argued the "GENERATED DATA" stamp was doing serious damage and
that the tool should be run on real data at least once.

**Its premise was already out of date, and the next session should not act on
it as written.** The dashboard landed on `synthetic-showcase` at the time, so
that is all the reviewer could see. It now lands on `demo-research-agent`,
which is a real LangGraph agent with 108 genuine judge verdicts, and
`demo_check.py` fails the build if that ever regresses. No generated-data
marker appears on any route.

What survives from that review, and is correct:

- the epistemic honesty is the differentiator and should not be sanded down;
- the post cannot be a dashboard screenshot;
- the repo must not be the weak link when founders click through — which is
  P0 above.

---

## 7. Environment gotchas that cost real time

Full list in `PROGRESS.md` → *Known issues*. The three that will bite:

1. **Vite serves stale modules to the container after a host edit.** The
   single biggest time sink of the last session. The file is correct on disk
   and in `/app`, HMR misses it, and the browser renders the old build — which
   looks exactly like "my change did nothing" and caused one wrong diagnosis.
   `docker compose restart dashboard` **before** concluding anything from a
   screenshot.
2. **After a dashboard dependency change**, `rm -sfv` is not enough. Use
   `docker compose up -d --force-recreate --renew-anon-volumes dashboard`.
   **Never `docker compose down -v`** — it destroys the only real corpus.
3. **The eval batch takes ~7 minutes.** Anything calling it needs a long
   timeout (see P2 item 5).

---

## 8. House rules

- **No AI attribution in git.** No "Generated with Claude Code" footer, no
  `Co-Authored-By: Claude` trailer, in commits, PR bodies or merge text.
- **Never print or commit `ANTHROPIC_API_KEY`.** It lives in `.env`,
  gitignored. To check it is live, make a 4-token call and print the status
  code — never the key.
- **Evidence before claims.** Every number in this document came from a
  command run in the session that wrote it. Keep that standard; it is the
  same standard the product itself is arguing for.
