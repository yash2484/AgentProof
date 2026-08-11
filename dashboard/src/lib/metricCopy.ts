/**
 * What each metric means, in the reader's language.
 *
 * Three sentences per metric, in a fixed order that answers the questions a
 * reader actually asks, in the order they ask them:
 *
 *   1. **measures** — what is this a measurement of?
 *   2. **computed** — how was the number produced? The actual mechanism:
 *      which aggregation, which comparison. A reader who cannot reproduce the
 *      number cannot argue with it, and a metric you cannot argue with is a
 *      metric you have to take on faith.
 *   3. **matters** — what failure does it catch? Stated as the failure, not
 *      as a virtue, because "improves quality" tells nobody anything.
 *
 * Keyed by metric name with a fallback by `metric_type`, so a metric added to
 * `agentproof.yaml` still renders something sensible rather than a blank.
 */

export interface MetricCopy {
  title: string;
  measures: string;
  computed: string;
  matters: string;
}

type CopyEntry = Omit<MetricCopy, "title">;

export const METRIC_COPY: Record<string, CopyEntry> = {
  faithfulness: {
    measures:
      "Whether every claim in the agent's answer is supported by the context it actually retrieved.",
    computed:
      "A judge model scores each applicable span from 0 to 1 against a rubric; the trace takes the worst span (min), so one unsupported passage cannot be averaged away by good ones.",
    matters:
      "Catches fabrication — the agent stating things its sources never said, fluently and with confidence.",
  },
  relevance: {
    measures:
      "Whether the answer addresses the question that was actually asked.",
    computed:
      "The same judge and the same worst-span aggregation as faithfulness, against a relevance rubric.",
    matters:
      "Catches a confident, well-sourced answer to a different question — which reads as correct and is useless.",
  },
  injection_resistance: {
    measures:
      "Whether the agent obeyed instructions hidden inside retrieved content or tool output.",
    computed:
      "Pattern families and, in llm or dual mode, a security judge score each span; the worst span becomes the trace score. In dual mode the heuristic and judge legs are combined with min.",
    matters:
      "A prompt injection that lands turns your agent into the attacker's agent, using your credentials.",
  },
  data_exfiltration: {
    measures:
      "Whether secrets, credentials or personal data appear in what the agent emitted.",
    computed:
      "Category patterns (keys, tokens, PII shapes) are matched per span; any hit fails the span, and the worst span becomes the trace score.",
    matters:
      "One leaked key is a breach. There is no partial credit and no averaging your way out of it.",
  },
  tool_misuse: {
    measures:
      "Whether tools were called outside their purpose or with dangerous arguments.",
    computed:
      "Each tool_use span is checked against a dangerous-tool and dangerous-argument list; the worst span becomes the trace score.",
    matters:
      "The gap between an agent that can read files and one that reads the wrong file is a single argument.",
  },
  latency_budget: {
    measures: "Whether the run finished inside its time limit.",
    computed:
      "The trace's total latency in milliseconds is compared against the configured limit. Binary: inside or outside.",
    matters:
      "A pass rate hides how close the passing runs ran to the edge — which is where the next regression lands first.",
  },
  cost_budget: {
    measures: "Whether the run stayed inside its spend limit.",
    computed:
      "The trace's total cost in USD is compared against the configured limit. Binary: inside or outside.",
    matters:
      "Token cost scales with traffic. A margin that looks comfortable at demo volume is a bill at production volume.",
  },
  tool_allowlist: {
    measures: "Whether the agent called only the tools it is permitted to call.",
    computed:
      "The set of tools used is differenced against the configured allowlist; any tool outside it is a violation.",
    matters:
      "Catches capability drift — an agent reaching for a tool nobody authorised, usually long before it does damage with it.",
  },
};

const BY_TYPE: Record<string, CopyEntry> = {
  llm_judge: {
    measures: "A graded quality judgement of the agent's output.",
    computed:
      "A judge model scores each applicable span from 0 to 1 against a rubric; the trace takes the worst span.",
    matters:
      "Judged scores carry a ±0.2 run-to-run swing on identical input, so read the distribution rather than the mean.",
  },
  security: {
    measures: "Whether the agent held its ground against an adversarial input.",
    computed:
      "Each applicable span is checked and the worst span becomes the trace score, so one compromised span fails the trace.",
    matters:
      "Security metrics are prevalence questions: what matters is how many runs were breached, and how many were even attacked.",
  },
  deterministic: {
    measures: "Whether the run stayed inside a configured limit.",
    computed:
      "A measured quantity is compared against its limit. Binary: inside or outside.",
    matters:
      "Deterministic checks have no judge noise — a failure here is a fact, not an estimate.",
  },
};

const UNKNOWN: CopyEntry = {
  measures: "No explanation is registered for this metric yet.",
  computed:
    "See the metric's entry in agentproof.yaml for its type, threshold and scope.",
  matters:
    "Add it to the metric registry in lib/metricCopy.ts so this page can explain itself.",
};

/** `injection_resistance` → `Injection resistance`. */
export function metricTitle(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function metricCopy(name: string, metricType: string): MetricCopy {
  const entry = METRIC_COPY[name] ?? BY_TYPE[metricType] ?? UNKNOWN;
  return { title: metricTitle(name), ...entry };
}
