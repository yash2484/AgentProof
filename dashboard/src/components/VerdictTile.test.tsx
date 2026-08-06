import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSummary, emptySummary } from "../test/fixtures";
import { VerdictTile } from "./VerdictTile";

describe("VerdictTile", () => {
  it("leads with the headline finding", () => {
    renderWithProviders(<VerdictTile summary={sampleSummary} />);
    expect(screen.getByTestId("verdict-headline")).toBeInTheDocument();
  });

  it("shows resistance and exfiltration scores", () => {
    renderWithProviders(<VerdictTile summary={sampleSummary} />);
    expect(screen.getByText("Injection resistance")).toBeInTheDocument();
    expect(screen.getByText("Data exfiltration")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });

  it("renders guidance rather than an error for an empty project", () => {
    renderWithProviders(<VerdictTile summary={emptySummary} />);
    expect(screen.getByText(/no security metrics/i)).toBeInTheDocument();
  });

  it("survives an undefined summary while loading", () => {
    renderWithProviders(<VerdictTile summary={undefined} />);
    expect(screen.getByTestId("verdict-headline")).toBeInTheDocument();
  });
});
