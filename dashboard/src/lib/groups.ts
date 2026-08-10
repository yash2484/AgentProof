import { tokens } from "../theme";
import type { AnalyticsEvalRun, MetricGroup } from "../types";

/**
 * Metric groups: the taxonomy the pages are organised around.
 *
 * Three metric types, three units, three questions. A judge score is graded
 * 0–1 with a ±0.2 swing; a security verdict is 0/1 per span taken to the
 * trace by `min`; a budget check is binary compliance. Averaging across them
 * produced the defect that started this rework — a −0.15 drift in the judged
 * metrics rendered as a flat line because six metrics pinned at 1.000 diluted
 * it.
 *
 * The server assigns the group (`metric_group` in `api/analytics.py`); this
 * module owns only how it is spoken about and drawn.
 */

/** Reading order, top to bottom, on every page that groups metrics. */
export const GROUP_ORDER: MetricGroup[] = [
  "quality",
  "safety",
  "budgets",
  "other",
];

/**
 * The measured run-to-run swing on a judged metric.
 *
 * Same trace, same frozen fixture, same model: 0.20 on one run and 0.40 on
 * the next. Every judge number is drawn with that band so a mean is never
 * read as a precise value.
 */
export const JUDGE_NOISE = 0.2;

interface GroupCopy {
  label: string;
  /** The question the group answers, for the reader who does not run evals. */
  question: string;
  color: string;
}

const GROUPS: Record<MetricGroup, GroupCopy> = {
  quality: {
    label: "Answer quality",
    question: "Is the agent's output grounded in what it retrieved?",
    color: tokens.category.violet,
  },
  safety: {
    label: "Adversarial safety",
    question: "Did the agent give ground under attack?",
    color: tokens.category.plum,
  },
  budgets: {
    label: "Budgets & contracts",
    question: "Did runs stay inside their limits?",
    color: tokens.category.teal,
  },
  // Reached by `composite` and by any metric type the server adds later. A
  // lookup miss must degrade to a neutral bucket, never blank the page.
  other: {
    label: "Other",
    question: "Metrics outside the three measured groups.",
    color: tokens.category.grey,
  },
};

function copyFor(group: string): GroupCopy {
  return GROUPS[group as MetricGroup] ?? GROUPS.other;
}

export function groupLabel(group: string): string {
  return copyFor(group).label;
}

export function groupQuestion(group: string): string {
  return copyFor(group).question;
}

/**
 * Series and key colours, drawn from the shared categorical band on purpose.
 *
 * Those hues stay at least 25° clear of green (150°), amber (37°) and red
 * (3°) precisely so a category never reads as a pass/fail verdict, and a
 * metric group is a category. `contrast.test.ts` asserts the separation.
 * Colour is never the only channel — every series carries its label.
 */
export function groupColor(group: string): string {
  return copyFor(group).color;
}

/** Only judged scores carry the ±0.2 band; a latency budget is measured. */
export function groupHasJudgeNoise(group: string): boolean {
  return group === "quality";
}

/**
 * Groups a set of runs actually scored, in reading order.
 *
 * The server emits a key for every group seen anywhere in the window, so an
 * all-null series is what a group nobody measured looks like — and drawing it
 * would put an empty line in the legend claiming a measurement that was never
 * taken.
 */
export function presentGroups(
  runs: Pick<AnalyticsEvalRun, "group_means">[],
): MetricGroup[] {
  const scored = new Set<string>();
  for (const run of runs) {
    for (const [group, mean] of Object.entries(run.group_means ?? {})) {
      if (mean !== null && mean !== undefined) scored.add(group);
    }
  }
  return GROUP_ORDER.filter((g) => scored.has(g));
}
