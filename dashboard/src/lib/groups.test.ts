import { describe, it, expect } from "vitest";
import {
  GROUP_ORDER,
  JUDGE_NOISE,
  groupColor,
  groupHasJudgeNoise,
  groupLabel,
  groupQuestion,
  presentGroups,
} from "./groups";

describe("metric groups", () => {
  it("orders the groups the way the pages read top to bottom", () => {
    expect(GROUP_ORDER).toEqual(["quality", "safety", "budgets", "other"]);
  });

  it("names each group in plain language, not by metric type", () => {
    expect(groupLabel("quality")).toBe("Answer quality");
    expect(groupLabel("safety")).toBe("Adversarial safety");
    expect(groupLabel("budgets")).toBe("Budgets & contracts");
  });

  it("states the question each group answers", () => {
    // The non-technical half of the audience reads the question; the
    // technical half reads the number underneath it.
    expect(groupQuestion("quality")).toMatch(/grounded/i);
    expect(groupQuestion("safety")).toMatch(/attack/i);
    expect(groupQuestion("budgets")).toMatch(/limits/i);
  });

  it("falls back rather than throwing on a group the server invented", () => {
    // The server is free to add a metric type; a label lookup must not blank
    // the page when it does.
    expect(groupLabel("composite")).toBe("Other");
    expect(groupQuestion("composite")).not.toBe("");
    expect(groupColor("composite")).toBe(groupColor("other"));
  });

  it("gives each group a colour outside the pass/fail bands", () => {
    const colors = GROUP_ORDER.map(groupColor);
    expect(new Set(colors).size).toBe(GROUP_ORDER.length);
    // Green and red are reserved for verdicts. A group is a category, and a
    // category that borrows a verdict colour reads as a verdict.
    expect(colors).not.toContain("#3FCF8E");
    expect(colors).not.toContain("#E5484D");
  });

  it("scopes the judge noise band to the judged group only", () => {
    // A latency budget is measured, not judged. Drawing a ±0.2 band around a
    // deterministic compliance rate would invent uncertainty that is not there.
    expect(groupHasJudgeNoise("quality")).toBe(true);
    expect(groupHasJudgeNoise("safety")).toBe(false);
    expect(groupHasJudgeNoise("budgets")).toBe(false);
    expect(JUDGE_NOISE).toBe(0.2);
  });

  it("lists the groups a set of runs actually measured, in reading order", () => {
    const runs = [
      { run_at: "a", trace_count: 1, degraded: 0, group_means: { budgets: 1, quality: 0.8 } },
      { run_at: "b", trace_count: 1, degraded: 0, group_means: { budgets: 1, quality: 0.7 } },
    ];

    expect(presentGroups(runs)).toEqual(["quality", "budgets"]);
  });

  it("drops a group that was never scored rather than drawing an empty series", () => {
    // The server emits a key for every group seen anywhere in the window, so
    // an all-null series is what a group nobody measured looks like.
    const runs = [
      { run_at: "a", trace_count: 1, degraded: 0, group_means: { quality: 0.8, safety: null } },
    ];

    expect(presentGroups(runs)).toEqual(["quality"]);
  });
});
