import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import {
  AttackSurface,
  BreachTimeline,
  FindingsList,
  PostureStrip,
  attemptCopy,
} from "./SecurityPosture";
import type { SecurityFinding, SecurityMetricPosture } from "../types";

const metric = (o: Partial<SecurityMetricPosture> = {}): SecurityMetricPosture => ({
  metric_name: "injection_resistance",
  measured: 36,
  breached: 0,
  degraded: 0,
  attempted: 5,
  attempt_signal: true,
  has_variance: true,
  ...o,
});

describe("attemptCopy", () => {
  it("states the attempted denominator when there is one", () => {
    expect(attemptCopy(metric({ attempted: 5, measured: 36 }))).toMatch(
      /5 of 36 .*attack/i,
    );
  });

  it("distinguishes never attacked from never checked", () => {
    // The whole reason the field is tri-state. "0 of 34 attempted" is a
    // measurement; "nobody checked" is the absence of one.
    const checked = attemptCopy(metric({ attempted: 0 }));
    const unchecked = attemptCopy(metric({ attempted: null, attempt_signal: false }));

    expect(checked).toMatch(/no attack.*attempted|0 of/i);
    expect(unchecked).toMatch(/no attempt signal|not recorded|never checked/i);
    expect(checked).not.toBe(unchecked);
  });
});

describe("PostureStrip", () => {
  it("leads with breaches as a count against a denominator", () => {
    renderWithProviders(<PostureStrip metrics={[metric({ breached: 2 })]} />);

    const row = screen.getByTestId("posture-injection_resistance");
    expect(row).toHaveTextContent("2 of 36");
  });

  it("says clean rather than showing a bare zero", () => {
    renderWithProviders(<PostureStrip metrics={[metric({ breached: 0 })]} />);

    expect(screen.getByTestId("posture-injection_resistance")).toHaveTextContent(
      /no breaches/i,
    );
  });

  it("never expresses a security posture as a percentage", () => {
    // "97% safe" is not a sentence anyone should be comfortable saying.
    const { container } = renderWithProviders(
      <PostureStrip metrics={[metric({ breached: 1 })]} />,
    );

    expect(container.textContent).not.toContain("%");
  });

  it("flags a control that never varied and was never attacked as unexercised", () => {
    renderWithProviders(
      <PostureStrip
        metrics={[
          metric({ breached: 0, has_variance: false, attempted: null, attempt_signal: false }),
        ]}
      />,
    );

    expect(screen.getByTestId("posture-injection_resistance")).toHaveTextContent(
      /unexercised control, not a passing one/i,
    );
  });

  it("credits a control that was attacked and held, rather than calling it unexercised", () => {
    // The honesty rule cuts both ways. A flat score with five recorded
    // attacks behind it is evidence of resistance, not an absence of
    // evidence — understating that is as wrong as overstating the other.
    renderWithProviders(
      <PostureStrip
        metrics={[
          metric({ breached: 0, has_variance: false, attempted: 5, attempt_signal: true }),
        ]}
      />,
    );

    const row = screen.getByTestId("posture-injection_resistance");
    expect(row).toHaveTextContent(/resisted every recorded attack/i);
    expect(row).not.toHaveTextContent(/unexercised/i);
  });

  it("still says unexercised when the attempt signal exists but nothing attacked", () => {
    renderWithProviders(
      <PostureStrip
        metrics={[
          metric({ breached: 0, has_variance: false, attempted: 0, attempt_signal: true }),
        ]}
      />,
    );

    expect(screen.getByTestId("posture-injection_resistance")).toHaveTextContent(
      /unexercised control, not a passing one/i,
    );
  });

  it("counts degraded measurements apart from breaches", () => {
    renderWithProviders(
      <PostureStrip metrics={[metric({ breached: 0, degraded: 1 })]} />,
    );

    expect(screen.getByTestId("posture-injection_resistance")).toHaveTextContent(
      /1 unmeasurable|1 degraded/i,
    );
  });
});

describe("AttackSurface", () => {
  const surface = { traces: 300, attacked: 69, unattacked: 231 };

  it("shows the split as a proportion and as raw counts", () => {
    // A pie relies on colour alone, so the counts and percentages are always
    // in text beside it rather than only in the slices.
    renderWithProviders(<AttackSurface surface={surface} />);

    const panel = screen.getByTestId("attack-surface");
    expect(panel).toHaveTextContent("69");
    expect(panel).toHaveTextContent("231");
    expect(panel).toHaveTextContent("23.0%");
  });

  it("says nothing was probed rather than drawing an empty ring", () => {
    renderWithProviders(
      <AttackSurface surface={{ traces: 40, attacked: 0, unattacked: 40 }} />,
    );

    expect(screen.getByTestId("attack-surface")).toHaveTextContent(
      /no attack was attempted/i,
    );
  });

  it("holds the slot when nothing has been measured at all", () => {
    renderWithProviders(
      <AttackSurface surface={{ traces: 0, attacked: 0, unattacked: 0 }} />,
    );

    expect(screen.getByTestId("attack-surface-empty")).toBeInTheDocument();
  });
});

describe("BreachTimeline", () => {
  const runs = [
    { run_at: "2026-03-02T00:00:00.000Z", measured: 102, breached: 2, attempted: 9 },
    { run_at: "2026-03-22T00:00:00.000Z", measured: 99, breached: 0, attempted: 5 },
  ];

  it("draws breaches per run", () => {
    renderWithProviders(<BreachTimeline runs={runs} />);

    expect(screen.getByTestId("breach-timeline")).toBeInTheDocument();
  });

  it("calls an empty timeline good news, explicitly", () => {
    // Empty is a legitimate and desirable state; a blank frame reads as
    // broken rather than clean.
    renderWithProviders(
      <BreachTimeline runs={runs.map((r) => ({ ...r, breached: 0 }))} />,
    );

    expect(screen.getByTestId("breach-timeline")).toHaveTextContent(
      /no breaches recorded/i,
    );
  });

  it("holds the slot before anything has run", () => {
    renderWithProviders(<BreachTimeline runs={[]} />);

    expect(screen.getByTestId("breach-timeline-empty")).toBeInTheDocument();
  });
});

describe("FindingsList", () => {
  const finding: SecurityFinding = {
    trace_id: "tr-breach",
    span_id: "sp-1",
    metric_name: "injection_resistance",
    score: 0,
    evaluated_at: "2026-08-08T00:00:00.000Z",
    explanation: "Injected instruction was obeyed.",
    attempted: true,
    reasoning: [{ span_id: "sp-1", score: 0, reasoning: "The model followed it." }],
  };

  it("enumerates only failures, with a link into the trace", () => {
    renderWithProviders(<FindingsList findings={[finding]} />);

    expect(screen.getByTestId("finding-tr-breach")).toHaveTextContent(
      "Injected instruction was obeyed.",
    );
    expect(screen.getByTestId("finding-link-tr-breach")).toHaveAttribute(
      "href",
      "/traces/tr-breach",
    );
  });

  it("shows the detector's own words", () => {
    renderWithProviders(<FindingsList findings={[finding]} />);

    expect(screen.getByTestId("finding-tr-breach")).toHaveTextContent(
      "The model followed it.",
    );
  });

  it("says whether the trace was actually under attack", () => {
    renderWithProviders(<FindingsList findings={[finding]} />);

    expect(screen.getByTestId("finding-tr-breach")).toHaveTextContent(
      /under attack|attack attempted/i,
    );
  });

  it("celebrates nothing when the list is empty, it just says so", () => {
    renderWithProviders(<FindingsList findings={[]} />);

    expect(screen.getByTestId("findings-empty")).toHaveTextContent(
      /no security failure/i,
    );
  });
});
