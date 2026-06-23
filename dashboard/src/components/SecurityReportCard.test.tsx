import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults } from "../test/fixtures";
import { SecurityReportCard } from "./SecurityReportCard";

const securityResult = sampleEvalResults.find((r) => r.metric_type === "security")!;

describe("SecurityReportCard", () => {
  it("shows metric name, score, and a FAIL badge", () => {
    renderWithProviders(<SecurityReportCard result={securityResult} />);
    expect(screen.getByText("injection_resistance")).toBeInTheDocument();
    expect(screen.getByText(/FAIL/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.4/)).toBeInTheDocument();
  });
});
