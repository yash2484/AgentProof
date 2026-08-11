# Review later

Things deliberately deferred, assumed, or capped during the analytics-depth
rework. Each entry says what it is, why it was left, and what reviewing it
would involve — so none of it survives as an unexamined default.

`PROGRESS.md` holds the "Known gaps" list (defects in shipped behaviour). This
file holds **decisions and deferrals**: work that was consciously not done, and
judgement calls someone other than the author should sign off on.

Status key: **OPEN** needs a decision · **QUEUED** decided, not yet built ·
**CLOSED** resolved (kept for the trail).

---

## Cross-cutting

### R1. Metric copy is the author's wording, not a reviewed spec — OPEN
`dashboard/src/lib/metricCopy.ts` states, for each metric, what it measures,
**how it is computed**, and what it catches. The "how" sentences make concrete
claims about mechanism (worst-span `min`, which fields are compared, how the
allowlist is differenced). They were written from reading the evaluators, and
they are the sentences a reader will trust most.

**Review:** read each `computed` string against its evaluator in
`server/agentproof_server/eval_engine/`. A wrong mechanism sentence is worse
than no sentence, because it invites a reader to reason from a false model.

### R2. "No applicable spans" still scores 1.0 — OPEN
Unchanged from before this rework and larger than it looks. An evaluator that
finds no span to judge returns a perfect score, so a trace nobody could measure
is indistinguishable from a trace that passed. The analytics layer now
separates *degraded* (judge broke) from *failed*, but it cannot separate
*unmeasurable* from *passed*, because that distinction is destroyed at write
time.

**Review:** decide whether "no applicable spans" should write `None` instead of
`1.0`. That changes stored scores and every mean computed from them, so it is a
deliberate migration, not a patch.

---

## Phase A — Overview corrections

### R3. The Overview's visual design and theme — CLOSED (2026-08-10)
The user could not read the metric-health distribution bar or tell what to take
from it: *"its hard for me as someone making the project"*.

**Resolved by deletion, not redesign.** `MetricDistribution` and
`MetricHealthPanel` are gone; `/evals` and `/evals/:metric` already rendered
the same data correctly. Full diagnosis and decisions in
`docs/overview-redesign-brief.md`. The measured defect worth remembering: bar
height was normalised by the tallest bin, so `data_exfiltration`'s single
breach rendered **0.45px tall in a 46px track** — rare events were invisible in
proportion to their rarity, in a product whose job is catching rare failures.

The Overview is now a triage page: verdict → what changed → what you can trust
→ where to look. Three server defects surfaced on the way and are fixed
(negative `pending`, undercounted `scored`, `degraded` labelled "failed").

### R16. The landing project points at the generated corpus — CLOSED (2026-08-10)
`DEFAULT_PROJECT` in `context/ProjectContext.tsx` was `synthetic-showcase`,
set at the user's request because it was the only corpus dense enough to read
the design against (300 traces, 8 runs, against the measured project's 31 and
4). It cut against R5, and with a job-application screenshot as the stated
goal it was the one open item that could actually do damage.

Closed with the Ledger work: the constant is `demo-research-agent`, and the
fix is no longer one line of trust. `scripts/demo_check.py` walks all six
routes and **fails** if the app lands anywhere but the measured corpus, or if
a generated-data marker appears anywhere a screenshot could catch it. Run it
before any capture.

One detail worth keeping: the check deliberately does not flag the bare word
"generated". The judge's real reasoning contains phrases like *"agents
generate false or fabricated information"*, and flagging that would be
flagging the evidence rather than the fabrication. It matches the badge text
and the generated project's id instead.

### R17. Provenance is a hard-coded set, not a property of the data — OPEN
`server/agentproof_server/provenance.py` holds `GENERATED_PROJECTS` as a
frozenset of names, because there is no working migration path in this repo
(`versions/` is empty) and no column to put it in.

A corpus generated under a different name would be treated as measured, with no
warning anywhere. The evidence for a better rule already exists —
`synthetic-showcase` has `raw_judge_output IS NULL` on all 2400 rows while the
measured project has a payload on all 296 — but inferring provenance from
missing data is fragile in its own way.

**Review:** decide between a `projects` table with a provenance column (needs a
migration path) and keeping the explicit list. The list is honest and obvious;
it just does not scale past corpora someone remembered to add.

### R4. The variance chart truncates its y-axis — OPEN
`axisFloor` drops the axis to the tenth below the lowest point so a real drift
is visible, and the panel declares it (*"Axis starts at 0.70, not 0."*).
Truncated axes exaggerate movement; that is the trade taken, disclosed rather
than hidden.

**Review:** confirm disclosure is enough for this audience, or switch to a full
0→1 axis with a zoomed inset.

---

## Phase B — synthetic corpus

### R5. `synthetic-showcase` must never be treated as evidence — OPEN
300 fabricated traces. It is labelled `GENERATED DATA` in the switcher, the
scope bar and the metric detail page, and the README says so. It is never
baselined and never gated.

**Review before any external use:** no screenshot, benchmark, or resume claim
may draw on this project. If a figure could be mistaken for measured
behaviour, it must come from `demo-research-agent`.

### R6. Corpus fidelity is only as good as the shapes it mirrors — QUEUED
The generator now writes the real `details` key names (fixed in gap #7) and
score-consistent judge prose. Both were wrong initially and both were only
caught when the data reached a screen.

**Review:** when an evaluator's `details` shape changes, the generator has to
change with it, or the corpus quietly stops being a valid stand-in. Worth a
test that diffs the key sets between the two projects.

---

## Phase C — Evals rebuild

### R7. The Budgets panel admits a gap it cannot yet fill — QUEUED
It says a compliance rate hides the margin, then cannot show the margin. The
underlying quantity now has an accessor (`measured_quantity` in
`eval_engine/details.py`, reading both key spellings), so this is unblocked.

**Build:** aggregate value-vs-limit per budget metric and chart utilisation —
p50/p99 of `latency_ms` and `cost_usd` against their limits. Spec §7.

### R8. Judge prose is rendered with a two-line markdown parser — OPEN
`renderEmphasis` handles `**bold**` and nothing else, deliberately: a full
markdown renderer is a dependency and an injection surface for a string that
came back from a model. Every fragment stays text, so markup cannot execute.

**Review:** if judges start emitting lists or code blocks, decide between a
sanitising renderer and leaving the raw markers visible.

---

## Phase D — Security rebuild

### R9. The findings list is capped at 50 with no disclosure — OPEN
`GET /security/analytics` takes `findings` (default 50, max 200) and the page
renders whatever it gets. With more than 50 breaches the page shows 50 and says
nothing, which reads as completeness. Neither project currently exceeds the cap
(14 findings on the synthetic corpus, 1 on the demo), so it is latent.

**Fix:** return the true total alongside the page of findings and say *"showing
50 of 137"*. A silent truncation is the one failure mode this whole rework
exists to remove.

### R10. Only `injection_resistance` records an attempt signal — OPEN
`data_exfiltration` and `tool_misuse` never write `injection_attempted`, so
their posture rows read *"no attempt signal recorded — this control cannot say
whether it was ever tested"*. That is honest, and it is also a gap in the
evaluators rather than in the page.

**Review:** decide whether those two should record an equivalent — was a
payload with secrets present? was a dangerous tool even available? Without it,
their clean scores cannot be distinguished from never having been tested.

### R11. Breach severity is undifferentiated — OPEN
Every failing security row is listed with equal weight. A leaked credential and
a tool called slightly outside its allowlist are both "a breach".

**Review:** decide whether security metrics need a severity field, or whether
the metric name carries enough for a reader to triage.

---

## Phase E — Traces rebuild

### R12. "Row expansion" is a side panel, because the free grid has no detail API — OPEN
The spec asked for inline row expansion. `getDetailPanelContent` is a
DataGridPro feature and this project uses the free `@mui/x-data-grid`. Rather
than pay for it or hand-roll a table and lose server-side pagination, the
selected trace opens in a panel beside the list — sticky at ≥1200px, stacked
below on narrow. Selection lives in the URL (`?trace=…`), so it survives a
reload and the back button, and nothing is trapped behind a modal.

**Review:** confirm the side panel serves the intent ("see a trace's
measurements without leaving the list"), or decide the inline form is worth a
Pro licence or a custom table.

### R13. The outcome column cannot be sorted — OPEN
`sortable: false` on both new columns. Sorting them means ordering by a joined
aggregate, which needs the sort pushed into the same subquery the filter uses;
the grid currently sorts only on columns the traces table owns.

**Review:** worth doing if readers start asking "show me the worst traces
first" — the filter answers most of that need today.

### R14. Ties on "worst metric" are arbitrary — OPEN
`array_agg(metric_name ORDER BY score)` takes the first element, so when two
metrics tie at the same low score the one named is whichever Postgres ordered
first. Common in practice, because most metrics sit at exactly 1.000.

**Review:** decide a tiebreak (blocking metrics first? alphabetical?) or accept
that the column names *a* worst metric rather than *the* worst metric, and say
so in the header tooltip.

### R15. The delete confirmation types a fixed word, not the trace name — OPEN
Typing `delete` arms the button. Typing the trace's own name is stricter and is
the convention users know from GitHub, but trace names here are scenario labels
repeated across hundreds of rows (`tool-assisted-lookup`), so requiring the
name would be a weaker guarantee, not a stronger one — you could be looking at
the wrong row and still type it correctly.

**Review:** if trace names become unique and meaningful, switch to the name.

---

## Ledger theme rework — opened 2026-08-10, built 2026-08-10

Specced in `docs/design/2026-08-10-ledger-design-system.md` and now
implemented. These are decisions the spec makes that someone other than the
author should sign off on.

### R18. Light-only, with no dark variant — QUEUED (owner, 2026-08-10)
A dark mode was considered and deliberately dropped. The reasoning: this is a CI
product read once per run, not a monitoring surface watched all day, so the
usual eye-strain argument does not apply; and one theme executed exactly beats
two executed adequately.

**Review:** if real users ask for dark, it gets *designed* — a second palette
built for a dark ground, contrast re-verified independently. Never derived by
inverting Ledger, which is how the "dark mode that looks wrong" failure happens.

### R19. Serif in a product UI is a bet — OPEN
`impeccable`'s product register warns that display faces in UI are a bans-list
item, and the editorial-serif look is itself a saturated AI default. The bet
here is that the serif is confined to *prose* — verdicts, judge reasoning,
explanations — and never reaches labels, buttons, data or navigation, which is
the distinction the ban is actually about.

**Review:** if the serif starts appearing on controls or in table cells, the bet
has been lost and it should retreat to prose-only or be dropped entirely. The
tell to watch for is a serif column header.

### R20. Contrast tests must be re-pointed, not deleted — CLOSED (2026-08-10)
`theme/contrast.ts` and its 26 tests encoded dark-ground ratios; under Ledger
every pair changed. They were re-pointed rather than deleted, and gained four
guards the light ground needed:

- no ground is warm, asserted by **hue** (the banned cream band), and the
  grounds stay ordered card > paper > data > rail in lightness;
- no category hue sits within 25° of a verdict hue, and magenta stays retired
  — by hue distance, not a hex allowlist, which is what let the old group
  test pass while the palette moved underneath it;
- every step of every group's series ramp clears 3:1 on all three grounds
  (this is the guard that caught the lighten-toward-white ramp);
- every font stack is valid CSS (see R21).

They demonstrably fail on a bad pair: the group-colour test failed on the
first hue re-pick, and the ramp test failed on the dark-ground ramp. Both
were real defects, caught by these tests rather than by eye.

### R21. A font stack can fail silently, and did — CLOSED (2026-08-10)
`Source Serif 4 Variable` unquoted is invalid CSS: a font-family is a sequence
of identifiers and an identifier may not begin with a digit, so the browser
discards the **entire** declaration. Every heading rendered at the correct
size, weight and tracking in the wrong face, and nothing appeared in the
console. It survived a full green test run and a visual pass before being
found by reading `getComputedStyle` in the browser.

Closed by quoting all three stacks, with a unit test asserting any family
needing quotes has them.

**Worth generalising:** a test suite cannot see a font, a colour that was
discarded, or an element pushed off-screen. `scripts/ui_audit.py` exists
because of this class of defect and should be run whenever the theme changes,
not only at the end.

### R22. The vitest worker pool is bounded to 6 — OPEN
`vite.config.ts` caps `maxThreads` at 6 and raises `testTimeout` to 20s. One
worker per core oversubscribed 12 cores while Docker was up, and a DataGrid
test that takes 1.2s alone took 26s in the full run — a scheduling artefact
reported as a test failure.

**Review:** these numbers are tuned to one developer machine. On CI, measure
before keeping them; the timeout in particular should come down if the
hardware is not contended, because a 20s ceiling hides a genuinely slow test.

---

## Positioning and audience — opened 2026-08-10

Raised while preparing the branch for an external audience. These are
**judgement calls, not measurements**, and they are recorded here rather than
in `PROGRESS.md` precisely because none of them has been validated with a
user. Treat every claim below as a hypothesis with an owner, not a finding.

### R23. The product is positioned as a CI regression gate — OPEN
The stated best-case use case: **a regression gate for a team shipping an
agent as a product.** A fixed eval set runs in CI against a pinned baseline;
the verdict carries a p-value and an effect size, and the tool declines to
conclude when the sample cannot support one.

Three properties support that positioning, and all three are verified in the
code rather than asserted:

- the ±0.2 judge swing is measured (same trace, same fixture, same model:
  0.20 then 0.40) and is rendered on every judged figure, so a move smaller
  than the noise floor is labelled as not evidence;
- degraded is never folded into failed — the 12 auth-failed judge calls in
  `demo-research-agent` are excluded from every score rather than counted
  against the agent;
- a metric that never varied is reported as unexercised, not passing.

**Explicitly not positioned as** observability or monitoring. The evaluation
path is after-the-fact and batch, there is no live ingest, and the design
spec says so directly: *"This is not a monitoring product. It runs in CI and
produces a verdict per run."* Competing on that ground against LangSmith or
Langfuse would be competing on the axis where this is weakest.

**Review:** the ICP has not been tested against a single real user. It is
inferred from what the code does well. Before it goes on a CV or a landing
page, at minimum sanity-check it against two or three people who actually
ship an agent, because the failure mode is a well-built tool aimed at a
group that does not feel the pain.

### R24. The "normal coder using an LLM CLI" story is structurally weak — OPEN
Tempting audience, and the honest assessment is that the direct version does
not hold up. Three structural reasons, in order of severity:

1. **No baseline is possible.** The regression detector compares a candidate
   against a pinned baseline over a *fixed* eval set. Every ad-hoc coding
   session is a different task, so there is nothing to hold constant and the
   core machinery has nothing to bite on.
2. **The metrics do not transfer.** Of the eight configured: `faithfulness`
   needs retrieval context and a coding session is not RAG; `tool_allowlist`
   duplicates the CLI's own permission system; the three security checks are
   content heuristics whose meaning on coding transcripts is untested. That
   leaves `latency_budget`, `cost_budget` and a stretched `relevance`, and
   token/cost dashboards already exist upstream.
3. **They are using an agent, not building one.** No control over prompts,
   model routing or tools means no change of their own to regress against.

**Do not build a demo on this framing.** A technical reviewer reaches reason
1 within a minute of seeing it.

**The one variant that does work** — see R25.

### R25. Fixed-task self-benchmarking is the bridge to CLI users — QUEUED
The narrow version of R24 that survives its own objections: fix a set of
coding tasks, pin that run as the baseline, then change something the user
*does* control — `CLAUDE.md`, the installed skill set, model tier, MCP
configuration — and re-run the same set.

This restores the fixed input the detector requires, and it answers a
question CLI users currently answer by feel: *did rewriting my CLAUDE.md
actually change anything, or am I inside the noise?*

**Enabled by a capability that already exists and is unused.** Claude Code
writes every session to `~/.claude/projects/<project>/<session>.jsonl`.
Inspected 2026-08-10; each assistant record carries `message.model`,
`message.usage` (input / output / cache-read / cache-creation tokens),
`timestamp`, `tool_use` and `tool_result` blocks, full prompt and completion
content, and `parentUuid` — which is already a parent-child chain and maps
directly onto the span DAG. `sdk/agentproof/pricing.py` converts the token
counts to cost.

So the transcripts contain everything the SDK records. The missing piece is
an importer, not a capability.

**Before building it, decide the metric set.** Importing sessions and
scoring them with the current `agentproof.yaml` would produce figures that
look authoritative and mean very little, which is the one failure mode this
whole product exists to prevent. A coding-specific config comes first.

### R26. Who the CI-gate positioning is aimed at — OPEN
Recorded 2026-08-10 for the launch post and demo. Same status as R23:
**reasoned from what the code does well, validated with nobody.** Ranked by
how much pain the group feels today.

**Tier 1 — the bullseye.** Small teams (2–15 engineers) shipping an LLM agent
as a *core product feature*, with a CI pipeline already running. Customer
support, contract and document analysis, research assistants, coding agents,
healthcare intake, financial reporting. The test is whether the agent's output
quality *is* the product rather than a convenience on top of it.

Why this group and not a larger one:

- they ship weekly and change prompts constantly, so every release is an
  untested regression risk;
- the GitHub Action drops into a pipeline that already exists, so there is no
  new habit to form;
- they either have a fixed eval set or feel guilty about not having one,
  which is the fixed input the detector requires;
- they cannot justify a dedicated evals engineer, so the statistical rigour is
  exactly the part they would otherwise skip;
- their failures are public — a fabricated answer reaches a customer.

*Sharpest sub-segment:* teams whose agent output is regulated or
high-consequence (health, legal, financial). "Unexercised, not proven" is a
compliance artefact for them, not only good taste — someone will eventually
ask them to show a control was actually exercised.

**Tier 2 — real, harder to reach.** Platform/ML engineers at 50–500-person
companies building an internal eval harness for several product teams. The
most sophisticated users, and they will read the effect-size guard correctly
on sight — but they tend to build in-house, so the pitch becomes "do not
build this yourself", which is a harder argument. Also: maintainers of agent
frameworks and templates who must show a refactor did not degrade behaviour.

**Tier 3 — do not spend effort here.** Individual developers using an LLM CLI
(see R24 — structurally wrong, and large and loud enough to generate
attention that will not convert). Enterprise AI governance and risk teams —
the epistemic honesty is aimed squarely at them and they would want it, but
they buy through procurement and need SOC2, SSO, audit logs and a vendor
entity. Wrong stage, not wrong audience.

**Communities, by signal-to-noise for this specific product:**

| Where | Why |
|---|---|
| LangChain / LangGraph Discord and forum | the SDK already ships a LangGraph adapter, so integration cost is one line, and "did my prompt change break it" is universal there. **Start here.** |
| AI Engineer / Latent Space community | explicitly identifies as "engineers shipping LLM products" — closest audience-to-ICP match that exists |
| MLOps Community Slack, evals channel | practitioners with CI who are actively arguing about this problem |
| r/LLMDevs, builder threads in r/LocalLLaMA | builders rather than users; r/MachineLearning is too research-facing |
| Show HN | the "declines to conclude" argument is HN-shaped, but it is one shot — spend it only after a second real corpus exists |
| LangSmith / Langfuse issue trackers and adjacent threads | people already frustrated with eval tooling, self-identified |

**The strategic problem, stated plainly.** Tier 1 is also the segment
LangSmith owns by default, because it ships with the framework those teams
already use. This will not win on tracing or on breadth, and should not try.

The wedge that is not taken is **statistical honesty in CI**: other tools
report that a number moved; this one reports whether it moved further than
the measured noise, and refuses to answer when the sample cannot support an
answer. Narrow, defensible, and the only claim worth leading with.

**Implication for the demo** (relevant when the post is drafted): the opening
frame should not be the dashboard. It should be **a CI run that blocks a
merge with the p-value visible**, ideally followed by a second run that
*declines* to block and says why. The dashboard is the evidence for the
claim, not the claim.

**Review:** every tier and every ranking here is a hypothesis. Before the
post goes out, sanity-check Tier 1 against two or three people who actually
ship an agent — the failure mode is a well-built tool aimed at a group that
does not feel the pain.
