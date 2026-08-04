import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree } from "../test/fixtures";
import { SpanDetailPanel } from "./SpanDetailPanel";

const span = sampleSpanTree[0].children[1]; // s-generate

describe("SpanDetailPanel", () => {
  it("renders the span's detail when open", () => {
    renderWithProviders(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText("generate")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("renders nothing when no span is selected", () => {
    renderWithProviders(<SpanDetailPanel span={null} onClose={() => {}} />);
    expect(screen.queryByText("Metadata")).not.toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    renderWithProviders(<SpanDetailPanel span={span} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onClose).toHaveBeenCalled();
  });

  describe("pointer interception (regression: defect 4)", () => {
    // jsdom performs no hit-testing, so a click on a rail link succeeds here
    // whether or not a backdrop covers it. These assert the mechanism that
    // makes the real browser behave; Playwright proves the behaviour.
    it("renders no backdrop", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      expect(baseElement.querySelector(".MuiBackdrop-root")).toBeNull();
    });

    it("does not intercept pointer events outside its own bounds", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      const root = baseElement.querySelector(".MuiModal-root") as HTMLElement;
      expect(root).not.toBeNull();
      expect(root).toHaveStyle({ pointerEvents: "none" });
    });

    it("still accepts pointer events inside the panel", () => {
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      const paper = baseElement.querySelector(".MuiDrawer-paper") as HTMLElement;
      expect(paper).toHaveStyle({ pointerEvents: "auto" });
    });
  });
});
