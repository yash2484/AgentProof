import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree, replaySpanTree } from "../test/fixtures";
import { MiniWaterfall } from "./MiniWaterfall";

describe("MiniWaterfall", () => {
  it("draws one bar per span on a single track", () => {
    renderWithProviders(<MiniWaterfall roots={sampleSpanTree} />);
    expect(screen.getAllByTestId(/^mini-bar-/)).toHaveLength(3);
  });

  it("lists the span names beneath the track", () => {
    renderWithProviders(<MiniWaterfall roots={sampleSpanTree} />);
    expect(screen.getByText("orchestrator")).toBeInTheDocument();
    expect(screen.getByText("retrieve")).toBeInTheDocument();
    expect(screen.getByText("generate")).toBeInTheDocument();
  });

  it("stays readable for a sub-millisecond replay trace", () => {
    renderWithProviders(<MiniWaterfall roots={replaySpanTree} />);
    const bars = screen.getAllByTestId(/^mini-bar-/);
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar).toHaveStyle({ minWidth: "3px" });
  });

  it("renders nothing for a trace with no spans", () => {
    const { container } = renderWithProviders(<MiniWaterfall roots={[]} />);
    expect(container.querySelectorAll('[data-testid^="mini-bar-"]')).toHaveLength(0);
  });
});
