# Detector sensitivity

How small a regression does the CI gate actually catch? Measured, not asserted.

> **Partly superseded, 2026-08-12.** Everything below was measured against the
> *unpaired* two-sample detector, which was the only one that existed at the
> time. The gate now compares each scenario against itself where the corpus
> carries scenario identity, and the judge figures in Part 2 are the ones that
> change most.
>
> **Part 1 still stands.** The fixture corpus is deliberately untagged, so
> `fixture-gate` still runs exactly the unpaired path swept here, and that job
> is what keeps the fallback covered in CI.
>
> **Part 2's conclusion was an incomplete diagnosis.** It attributed the judge
> gate's deafness entirely to partial credit. Partial credit is real, but the
> larger cause was the detector's noise model: it treated per-scenario
> difficulty as measurement noise, inflating sigma roughly sixfold. See
> "Why the judge gate is deafer", rewritten below, and the README section
> "The gate failed its own test".
>
> The current, enforced figures live in
> [`test_regression_calibration.py`](../server/tests/unit/test_regression_calibration.py):
> the smallest faithfulness drop the gate resolves is **0.116 unpaired** and
> **0.050 paired**, measured by bisection against the shipped baseline. The
> judge sweep below has not been re-run under pairing.

Measured twice, because the answer differs by metric kind:

| metric kind | example | fires at | reproduce |
|---|---|---|---|
| heuristic (noise-free) | `data_exfiltration` | **4 of 12 (33%)** | `cd server && python -m pytest tests/unit/test_detector_sensitivity.py -s` |
| LLM judge (noisy) | `faithfulness` | **6 of 13 (46%)** | `python scripts/judge_sensitivity_sweep.py` (needs a key) |

The judge-backed gate measured about 1.4x deafer here. §"Why the judge gate is
deafer" originally attributed that to the metric alone; it has two causes, and
the larger one was a defect in the detector's noise model. Read that section
before quoting this table.

---

# Part 1 — heuristic metric (`data_exfiltration`)

## Method

Take the pinned 12-trace corpus, break `k` traces so the agent discloses PII in
its answer, and ask the detector for a verdict at every `k` from 0 to 12. The
baseline is the committed one; the rule is the shipped one (one-sided Welch's
t-test at alpha=0.05, plus a Cohen's *d* >= 0.5 effect-size guard, plus an
absolute-drop floor below `min_sample_size`).

Faults are applied to recorded traces, not to a model, so the sweep is
deterministic, key-free and free to run.

## Result

Metric: `data_exfiltration`. Corpus: 12 traces. Baseline mean 0.917.

| broken | candidate mean | verdict | reason |
|---:|---:|---|---|
| 0 | 0.917 | ok | no drop |
| 1 | 0.833 | ok | p=0.2790, d=0.243 |
| 2 | 0.750 | ok | p=0.1478, d=0.439 |
| 3 | 0.667 | ok | p=0.0734, d=0.619 |
| **4** | **0.583** | **REGRESSION** | **p=0.0334, d=0.799** |
| 5 | 0.500 | REGRESSION | p=0.0135, d=0.988 |
| 6 | 0.417 | REGRESSION | p=0.0046, d=1.198 |
| 7 | 0.333 | REGRESSION | p=0.0012, d=1.445 |
| 8 | 0.250 | REGRESSION | p=0.0002, d=1.757 |
| 9 | 0.167 | REGRESSION | p<0.0001, d=2.189 |
| 10 | 0.083 | REGRESSION | p<0.0001, d=2.887 |
| 11 | 0.083 | REGRESSION | p<0.0001, d=2.887 |
| 12 | 0.000 | REGRESSION | p<0.0001, d=4.491 |

**The gate fires from 4 broken traces in 12 — a 33% degradation — at p=0.033
with an effect size of 0.80.**

## Reading it

**Both guards must agree, and that matters at k=3.** The effect size has already
cleared its threshold (d=0.619 >= 0.5) but significance has not (p=0.073 >=
0.05), so the detector holds back. Either guard alone would behave worse: the
t-test alone flags statistically-real-but-trivial drops, and the effect size
alone flags large-looking drops that twelve samples cannot support.

**Not firing at k=1 and k=2 is a feature.** One bad run in twelve is inside
normal variation for most agents. A gate that flags it cries wolf, and a CI gate
that cries wolf gets switched off — which is the real failure mode.

**Rows 10 and 11 are identical** because one trace in the corpus already fails
this metric in the baseline. Breaking an already-broken trace changes nothing,
which is the arithmetic working correctly.

**Detection is monotonic** — once the gate fires, more damage never un-fires it.
Asserted in the test, because a non-monotonic detector would be a genuine bug.

The 4-in-12 figure is pinned as an assertion in the test, so a future change
that makes the gate deafer fails there rather than passing unnoticed.

---

# Part 2 — LLM judge metric (`faithfulness`)

A regex metric is noise-free: the same input always yields the same score. A
judge is not, so the detector has to separate a real degradation from the
judge's own run-to-run variance. That is the harder case and it deserves its own
measurement.

## Method

Judge each of the 13 corpus traces twice — once as recorded, once with a
fabricated claim spliced into the writer's answer — then sweep `k` from 0 to 13,
building each candidate from `k` fabricated scores plus the rest clean.

That costs 13 judge calls rather than 13 × 14, because judging one trace is
independent of the others. The fabrication is a confident, specific claim the
sources never make, introduced with the language of citation:

> " Based on the provided context, this approach reduces end-to-end latency by
> 43% and is mandated by the ISO 24089 multi-agent standard."

## Result

Baseline: mean 0.911, std 0.218, n=13.

| degraded | candidate mean | verdict | reason |
|---:|---:|---|---|
| 0 | 0.922 | ok | no drop |
| 1–2 | 0.883 | ok | p=0.3676, d=0.134 |
| 3 | 0.852 | ok | p=0.2480, d=0.271 |
| 4 | 0.822 | ok | p=0.1581, d=0.401 |
| 5 | 0.783 | ok | p=0.0864, d=0.551 |
| **6** | **0.738** | **REGRESSION** | **p=0.0394, d=0.721** |
| 8 | 0.659 | REGRESSION | p=0.0068, d=1.048 |
| 13 | 0.468 | REGRESSION | p<0.0001, d=2.171 |

**Fires from 6 degraded traces in 13 — 46%.**

## Why the judge gate is deafer

*Rewritten 2026-08-12. The original version of this section is the paragraph
marked below; it was right about the mechanism and wrong about it being the
whole story.*

Two causes, and the original text named only the smaller one.

**Partial credit — real, and the original explanation.** The regex metric scores
a leaking trace **0.0**: a full 1.0 drop per trace. The judge scores a
fabricating trace **0.35–0.55**, because the rest of the answer is still
grounded. That is roughly half the signal per degraded trace, so it takes about
1.4x as many to clear the same bar. This part is a property of the metric, not a
defect in the detector, and partial credit is the right behaviour for a
groundedness judge — an answer that is four-fifths grounded is genuinely not as
bad as one that leaks an SSN.

**The noise model — larger, and missed entirely.** The original section closed
by concluding this was "a property of the metric, not a defect in the detector."
That conclusion did not survive being tested. On 2026-08-11 a real 0.109
faithfulness drop was introduced and the gate passed it at p=0.0939. The cause
was not partial credit: the detector was treating thirteen per-scenario scores
as thirteen draws from one distribution, so the spread it called noise was
really the difference in difficulty *between* scenarios. On that baseline, 86.6%
of the variance came from one hard scenario, putting sigma at 0.218 against a
per-scenario run-to-run variation of 0.034 measured directly — about six times
too large.

The judge gate was deafer partly because judges award partial credit, and mostly
because the detector was measuring the wrong thing. Pairing each scenario
against itself removes the second cause; the first remains and is legitimate.

The practical consequence for anyone reading this doc for guidance: judge-backed
gates do need more samples than heuristic ones, but check your noise model
before you conclude that sample size is the constraint. Ours was not.

## Two things this exposed

**Judge scores drift between runs.** `partially_covered` scored 0.20 when the
baseline was pinned, 0.40 on this sweep, and 0.35 when the baseline was re-pinned
on 2026-08-12 — the same trace, the same frozen fixture, the same model, three
different numbers. That is the concrete argument for the effect-size guard:
without it, ordinary judge noise on a small corpus would trip the gate on its
own.

Drift has since been measured properly rather than anecdotally, by evaluating a
byte-identical corpus twice: `faithfulness` moves with a per-scenario standard
deviation of 0.034, `relevance` with 0.144, and the six measured metrics with
0.000. Those numbers are what the practical-significance floors are now sized
against.

**A trace with no writer span is immune.** The `error` scenario's retriever
fails before the writer runs, so there is nothing to judge and the metric scores
1.0 for "no applicable spans". It scores 1.0 clean *and* fabricated, which is
why `k=1` and `k=2` produce identical means. Defensible — a trace that produced
no answer cannot produce an unfaithful one — but it means one trace in thirteen
carries no faithfulness signal at all.

## Limits

- One corpus, one fault shape, one judge model. A different rubric or a
  different model will sit elsewhere.
- 12–13 samples is near the floor (`min_sample_size` is 9), so the t-test path
  is engaged but not comfortably. A larger corpus would tighten both thresholds.
- The judge sweep is a **script, not a test**. Pinning a nondeterministic
  threshold as an assertion would flake; it is a characterisation to re-run and
  record, not an invariant.
- Neither figure says the judge is *correct* — only that the gate reacts to it.
  Whether the judge agrees with a human is a separate question, and the honest
  way to answer it is agreement against hand-labelled traces.
