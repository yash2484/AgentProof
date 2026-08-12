import { describe, it, expect } from "vitest";
import {
  describeGate,
  effectSizeLabel,
  isSyntheticProject,
  metricRegister,
  metricSeverity,
  severityCopy,
  varianceLabel,
} from "./analytics";
import type { GateVerdict, MetricHealth } from "../types";

function metric(overrides: Partial<MetricHealth> = {}): MetricHealth {
  return {
    metric_name: "faithfulness",
    metric_type: "llm_judge",
    group: "quality",
    ci_block: true,
    mean_score: 0.9,
    std: 0.15,
    pass_rate: 0.9,
    threshold: 0.7,
    count: 20,
    failed: 0,
    degraded: 0,
    has_variance: true,
    ...overrides,
  };
}

function gate(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return {
    metric_name: "faithfulness",
    is_regression: false,
    // The drop here is 0.044, below the 0.05 practical floor, so the server
    // does not flag this as unresolved: a large effect size on a negligible
    // absolute drop is what a tiny variance produces, and we have decided we
    // do not care at that magnitude.
    is_warning: false,
    comparable: true,
    baseline_mean: 0.911,
    candidate_mean: 0.867,
    delta: -0.044,
    p_value: 0.116,
    cohens_d: 0.607,
    t_statistic: -1.52,
    method: "welch",
    cohens_dz: null,
    paired_n: null,
    baseline_n: 9,
    candidate_n: 9,
    reason: "p=0.1161 >= alpha=0.05, d=0.607 >= 0.5.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Generated-data labelling
// ---------------------------------------------------------------------------
//
// The demo corpus is a byte-for-byte recording and the README makes that
// claim load-bearing. The showcase corpus is fabricated. A reader must never
// have to guess which one they are looking at.

describe("isSyntheticProject", () => {
  it("flags the fabricated showcase corpus", () => {
    expect(isSyntheticProject("synthetic-showcase")).toBe(true);
  });

  it("does not flag the real recorded corpus", () => {
    expect(isSyntheticProject("demo-research-agent")).toBe(false);
  });

  it("does not flag the all-projects view, which mixes both", () => {
    // "All projects" spans real and generated data, so a badge there would
    // claim more than it can. The scope bar says so in words instead.
    expect(isSyntheticProject(undefined)).toBe(false);
    expect(isSyntheticProject(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Register assignment
// ---------------------------------------------------------------------------
//
// The single most important honesty requirement on the page. Six of eight
// metrics sit at 1.000 because no scenario stresses them; rendering those as
// green ticks would launder "untested" into "passing".

describe("metricRegister", () => {
  it("routes a metric that moves to the distribution register", () => {
    expect(metricRegister(metric({ has_variance: true }))).toBe("signal");
  });

  it("routes a metric pinned at one value to the ceiling strip", () => {
    expect(metricRegister(metric({ std: 0, has_variance: false }))).toBe("ceiling");
  });

  it("routes a single observation to the ceiling strip", () => {
    // std is null at n=1: cannot tell, which is not evidence of stability.
    expect(metricRegister(metric({ count: 1, std: null, has_variance: false }))).toBe(
      "ceiling",
    );
  });
});

describe("varianceLabel", () => {
  it("says nothing varied, without calling it a fault", () => {
    // No icon and no warning word: this is an absence of evidence.
    expect(varianceLabel(metric({ std: 0, has_variance: false }))).toBe(
      "no variance observed",
    );
  });

  it("distinguishes one observation from a flat run", () => {
    expect(varianceLabel(metric({ count: 1, std: null, has_variance: false }))).toBe(
      "one observation — no variance measurable",
    );
  });

  it("reports the spread when there is one", () => {
    expect(varianceLabel(metric({ std: 0.218 }))).toBe("σ 0.218");
  });
});

// ---------------------------------------------------------------------------
// Severity tiers
// ---------------------------------------------------------------------------

describe("metricSeverity", () => {
  it("is clear when nothing failed", () => {
    expect(metricSeverity(metric({ failed: 0, count: 20 }))).toBe("clear");
  });

  it("is watch for a single failure well below the serious bar", () => {
    expect(metricSeverity(metric({ failed: 1, count: 35 }))).toBe("watch");
  });

  it("is serious at 10% or more with at least two affected on a blocking metric", () => {
    expect(metricSeverity(metric({ failed: 2, count: 20, ci_block: true }))).toBe(
      "serious",
    );
  });

  it("stays at watch when the same rate lands on an advisory metric", () => {
    // ci_block is the difference between "this stops the build" and "noted".
    expect(metricSeverity(metric({ failed: 2, count: 20, ci_block: false }))).toBe(
      "watch",
    );
  });

  it("is serious when everything failed, at any n", () => {
    expect(metricSeverity(metric({ failed: 3, count: 3 }))).toBe("serious");
  });

  it("caps at watch below n=10 even when the rate clears the bar", () => {
    // 2 of 9 is 22%, over the 10% bar with 2 affected — but nine runs cannot
    // carry that claim. Widen the uncertainty; do not escalate.
    expect(metricSeverity(metric({ failed: 2, count: 9 }))).toBe("watch");
  });

  it("still escalates below n=10 when the rate is 100%", () => {
    expect(metricSeverity(metric({ failed: 4, count: 4 }))).toBe("serious");
  });

  it("is serious when the regression gate actually fired", () => {
    // A p-value and an effect size exist, so the claim is earned.
    expect(
      metricSeverity(metric({ failed: 0, count: 20 }), gate({ is_regression: true })),
    ).toBe("serious");
  });

  it("is not escalated by a gate that held back", () => {
    expect(metricSeverity(metric({ failed: 0, count: 20 }), gate())).toBe("clear");
  });

  it("does not call a metric clear while the gate says it could not tell", () => {
    // A drop can be material and still leave every individual score inside its
    // threshold, so `failed === 0` does not settle it. The strip painted such a
    // metric clear while the lede called the same metric unresolved — one
    // screen, two verdicts, on the exact state the warning was added for.
    expect(
      metricSeverity(metric({ failed: 0, count: 20 }), gate({ is_warning: true })),
    ).toBe("watch");
  });

  it("lets a real failure rate outrank the unresolved floor", () => {
    // The floor raises "clear" to "watch"; it must never lower "serious".
    expect(
      metricSeverity(metric({ failed: 4, count: 4 }), gate({ is_warning: true })),
    ).toBe("serious");
  });

  it("is degraded when nothing could be measured", () => {
    expect(metricSeverity(metric({ count: 0, failed: 0, degraded: 3 }))).toBe(
      "degraded",
    );
  });

  it("does not let degraded measurements mask a real failure", () => {
    // Nine broken judge calls alongside a genuine 100% failure rate: the
    // finding is still a finding.
    expect(metricSeverity(metric({ count: 4, failed: 4, degraded: 9 }))).toBe(
      "serious",
    );
  });
});

describe("severityCopy", () => {
  it("always states the fraction, never a bare adjective", () => {
    expect(severityCopy(metric({ failed: 1, count: 31 }))).toBe(
      "1 of 31 measurements flagged",
    );
  });

  it("says zero of n rather than just passing", () => {
    expect(severityCopy(metric({ failed: 0, count: 31 }))).toBe(
      "0 of 31 measurements flagged",
    );
  });

  it("never calls an eval row a run", () => {
    // The scope bar says "9 runs" meaning evaluation runs; this denominator
    // counts eval rows, and a trace evaluated twice contributes twice. On the
    // synthetic corpus the same screen read "9 runs" and "33 of 294 runs
    // flagged" — both true, two different nouns.
    expect(severityCopy(metric({ failed: 33, count: 294 }))).not.toContain("run");
  });

  it("never calls an eval row a trace either", () => {
    // 25 traces produced 35 rows for a deterministic metric. The denominator
    // is measurements, and it has to say so.
    expect(severityCopy(metric({ failed: 1, count: 35 }))).not.toContain("trace");
  });

  it("calls a broken measurement what it is, in its own words", () => {
    expect(severityCopy(metric({ count: 0, failed: 0, degraded: 1 }))).toBe(
      "1 measurement failed — not a finding",
    );
  });

  it("pluralises broken measurements", () => {
    expect(severityCopy(metric({ count: 0, failed: 0, degraded: 3 }))).toBe(
      "3 measurements failed — not a finding",
    );
  });

  it("uses the word regressed only when a baseline backs it", () => {
    const copy = severityCopy(
      metric({ failed: 2, count: 20 }),
      gate({ is_regression: true }),
    );
    expect(copy).toContain("Regressed against baseline");
    expect(copy).toContain("2 of 20 measurements flagged");
  });

  it("never says regressed without one", () => {
    expect(severityCopy(metric({ failed: 20, count: 20 }))).not.toContain("egressed");
  });
});

// ---------------------------------------------------------------------------
// Gate verdict copy
// ---------------------------------------------------------------------------

describe("effectSizeLabel", () => {
  it("uses Cohen's conventions", () => {
    expect(effectSizeLabel(0.9)).toBe("large");
    expect(effectSizeLabel(0.6)).toBe("medium");
    expect(effectSizeLabel(0.3)).toBe("small");
    expect(effectSizeLabel(0.1)).toBe("negligible");
  });

  it("reads the magnitude, so an improvement is not mislabelled", () => {
    expect(effectSizeLabel(-0.9)).toBe("large");
  });
});

describe("describeGate", () => {
  it("explains its silence when the drop was below the practical floor", () => {
    // The restraint case. A system that explains why it stayed quiet is more
    // trustworthy than one that only speaks when alarmed.
    //
    // A large effect size on a 0.044 drop is what tiny variance produces, not
    // a finding. The line reports both numbers and the outcome without naming
    // which guard fell short — that is the server's decision, and naming it
    // here is how the copy came to assert things that were not true.
    const d = describeGate(gate());
    expect(d.severity).toBe("clear");
    expect(d.headline).toBe("Not flagged");
    expect(d.statLine).toBe(
      "medium effect (d=0.61) at p=0.116 — below the level the gate acts on",
    );
  });

  it("never calls a significant p-value insignificant", () => {
    // The copy used to assert "not statistically significant" on every
    // not-flagged verdict. A drop can be significant and still not blocked —
    // p=0.01 with d=0.30 fails the effect-size guard, and a drop under the
    // metric's practical floor fails the floor at any p. Both landed here and
    // both were described with a false clause.
    const d = describeGate(gate({ cohens_d: 0.3, p_value: 0.01 }));
    expect(d.severity).toBe("clear");
    expect(d.statLine).not.toContain("not statistically significant");
    expect(d.statLine).toContain("p=0.010");
  });

  it("says it could not tell when the movement was material but unconfirmed", () => {
    // The state that let a real 0.109 faithfulness drop sit unremarked next to
    // metrics pinned at 1.000 on 2026-08-11. It is not a pass, and the card
    // must not render it as one.
    const d = describeGate(gate({ is_warning: true }));
    expect(d.severity).toBe("watch");
    expect(d.headline).toBe("Could not tell");
    expect(d.statLine).toContain("material, unconfirmed");
    expect(d.statLine).toContain("but not statistically significant");
  });

  it("takes the unresolved state from the server rather than re-deriving it", () => {
    // The client used to infer this by comparing cohens_d against a hardcoded
    // 0.5. That threshold now differs per metric and is a different quantity
    // entirely for paired comparisons, so a client-side copy would drift.
    const large = describeGate(gate({ cohens_d: 0.9, is_warning: false }));
    expect(large.severity).toBe("clear");

    const small = describeGate(gate({ cohens_d: 0.1, is_warning: true }));
    expect(small.severity).toBe("watch");
  });

  it("does not manufacture tension when neither guard was close", () => {
    // Measured on live data: d=0.24 with p=0.163. "small BUT not significant"
    // implies the two disagree; they agree, and the copy should say so.
    const d = describeGate(gate({ cohens_d: 0.239, p_value: 0.1634 }));
    expect(d.statLine).toBe(
      "small effect (d=0.24) at p=0.163 — below the level the gate acts on",
    );
  });

  it("translates the statistics when it fires", () => {
    const d = describeGate(
      gate({ is_regression: true, p_value: 0.033, cohens_d: 0.8 }),
    );
    expect(d.severity).toBe("serious");
    expect(d.headline).toBe("Regression detected");
    expect(d.statLine).toBe("unlikely to be chance (p=0.033) · large effect (d=0.80)");
  });

  it("says so plainly when there was no t-test to run", () => {
    const d = describeGate(
      gate({ p_value: null, cohens_d: null, reason: "No drop (candidate 1.000 >= baseline 1.000)." }),
    );
    expect(d.headline).toBe("Not flagged");
    expect(d.statLine).toBe("No drop (candidate 1.000 >= baseline 1.000).");
  });

  it("does not claim a verdict it could not compute", () => {
    const d = describeGate(gate({ comparable: false, candidate_n: 0 }));
    expect(d.severity).toBe("degraded");
    expect(d.headline).toBe("Not assessed");
  });

  it("has nothing to say without a baseline", () => {
    expect(describeGate(undefined).headline).toBe("No baseline");
    expect(describeGate(undefined).severity).toBe("degraded");
  });
});
