import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree, replaySpanTree } from "../test/fixtures";
import { Waterfall } from "./Waterfall";

describe("Waterfall", () => {
  it("renders one bar per span", () => {
    renderWithProviders(<Waterfall roots={sampleSpanTree} onSelect={() => {}} />);
    expect(screen.getByText("orchestrator")).toBeInTheDocument();
    expect(screen.getByText("retrieve")).toBeInTheDocument();
    expect(screen.getByText("generate")).toBeInTheDocument();
  });

  it("calls onSelect with the span when a bar is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Waterfall roots={sampleSpanTree} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("generate"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ span_id: "s-generate" }));
  });
});

describe("Waterfall — replay-mode traces (regression: defect 1)", () => {
  it("renders all four spans, fact_checker included", () => {
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={() => {}} />);
    expect(screen.getByText("orchestrator")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("summarize")).toBeInTheDocument();
    expect(screen.getByText("fact_checker")).toBeInTheDocument();
  });

  it("gives every bar a 3px minimum rendered width", () => {
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={() => {}} />);
    for (const id of ["r-root", "r-search", "r-summarize", "r-fact-checker"]) {
      expect(screen.getByTestId(`waterfall-bar-${id}`)).toHaveStyle({
        minWidth: "3px",
      });
    }
  });

  it("keeps a near-zero span clickable", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Waterfall roots={replaySpanTree} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("fact_checker"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ span_id: "r-fact-checker" }),
    );
  });
});
