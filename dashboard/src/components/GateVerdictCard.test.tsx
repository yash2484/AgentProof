import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics } from "../test/fixtures";
import { GateVerdictCard, leadVerdict } from "./GateVerdictCard";
import type { GateVerdict } from "../types";

const gate = sampleAnalytics.gate;

function verdict(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return { ...gate[1], ...overrides };
}

describe("leadVerdict", () => {
  it("leads with the metric that actually fired", () => {
    const fired = verdict({ metric_name: "relevance", is_regression: true });
    expect(leadVerdict([gate[0], fired])?.metric_name).toBe("relevance");
  });

  it("otherwise leads with the closest call", () => {
    // The smallest p-value is the verdict most likely to change next run.
    expect(leadVerdict(gate)?.metric_name).toBe("injection_resistance");
  });

  it("has nothing to lead with when no metric has a baseline", () => {
    expect(leadVerdict([])).toBeUndefined();
  });
});

describe("GateVerdictCard", () => {
  it("shows the statistics without being asked", () => {
    // The translation line is never behind the expander: it is the
    // difference between a verdict and an assertion.
    renderWithProviders(<GateVerdictCard gate={gate} />);
    expect(screen.getByTestId("gate-statline")).toHaveTextContent("p=0.163");
    expect(screen.getByTestId("gate-statline")).toHaveTextContent("d=0.24");
  });

  it("explains why it stayed quiet", () => {
    renderWithProviders(<GateVerdictCard gate={gate} />);
    expect(screen.getByTestId("gate-headline")).toHaveTextContent("Not flagged");
    expect(screen.getByTestId("gate-statline")).toHaveTextContent(
      "not statistically significant at this sample size",
    );
  });

  it("says regression detected only when the gate fired", () => {
    renderWithProviders(
      <GateVerdictCard gate={[verdict({ is_regression: true, p_value: 0.03, cohens_d: 0.9 })]} />,
    );
    expect(screen.getByTestId("gate-headline")).toHaveTextContent("Regression detected");
    expect(screen.getByTestId("gate-statline")).toHaveTextContent("unlikely to be chance");
  });

  it("keeps the raw numbers one click away", async () => {
    renderWithProviders(<GateVerdictCard gate={gate} />);
    expect(screen.queryByTestId("gate-details")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /show the numbers/i }));
    const details = screen.getByTestId("gate-details");
    expect(details).toHaveTextContent("t-statistic");
    expect(details).toHaveTextContent("baseline 13");
    expect(details).toHaveTextContent("candidate 26");
    expect(details).toHaveTextContent("p=0.1634 >= alpha=0.05");
  });

  it("claims nothing when there is no baseline", () => {
    renderWithProviders(<GateVerdictCard gate={[]} />);
    expect(screen.getByTestId("gate-headline")).toHaveTextContent("No baseline");
    expect(screen.queryByRole("button", { name: /show the numbers/i })).not.toBeInTheDocument();
  });

  it("says not assessed rather than passing when there were no candidate scores", () => {
    renderWithProviders(
      <GateVerdictCard gate={[verdict({ comparable: false, candidate_n: 0 })]} />,
    );
    expect(screen.getByTestId("gate-headline")).toHaveTextContent("Not assessed");
  });
});
