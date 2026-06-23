import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree } from "../test/fixtures";
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
