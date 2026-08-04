import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, multiTraceSecurityResults } from "../test/fixtures";
import { SecurityReportCard } from "./SecurityReportCard";

describe("SecurityReportCard", () => {
  it("renders the metric name and verdict", () => {
    renderWithProviders(<SecurityReportCard result={sampleEvalResults[1]} />);
    expect(screen.getByText("injection_resistance")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
  });

  it("names and links its trace even when nothing offended", () => {
    // Regression (defect 3): an all-PASS card used to carry no attribution
    // at all, so N traces produced N indistinguishable cards.
    renderWithProviders(<SecurityReportCard result={multiTraceSecurityResults[0]} />);
    const link = screen.getByRole("link", { name: "tr-a" });
    expect(link).toHaveAttribute("href", "/traces/tr-a");
  });

  it("still surfaces the offending span when there is one", () => {
    renderWithProviders(<SecurityReportCard result={sampleEvalResults[1]} />);
    expect(screen.getByText(/s-generate/)).toBeInTheDocument();
  });
});
