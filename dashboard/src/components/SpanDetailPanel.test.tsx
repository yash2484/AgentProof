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
      // Baseline assertion, not part of the defect-4 regression proof:
      // "auto" is CSS's initial value for pointer-events, so this holds
      // whether or not the fix is applied. It documents intent, it does not
      // discriminate.
      const { baseElement } = renderWithProviders(
        <SpanDetailPanel span={span} onClose={() => {}} />,
      );
      const paper = baseElement.querySelector(".MuiDrawer-paper") as HTMLElement;
      expect(paper).toHaveStyle({ pointerEvents: "auto" });
    });
  });

  describe("keyboard dismissal", () => {
    it("closes on Escape even when focus has left the panel", () => {
      const onClose = vi.fn();
      renderWithProviders(<SpanDetailPanel span={span} onClose={onClose} />);
      // Focus is on document.body, i.e. outside the modal root -- exactly the
      // state disableEnforceFocus permits and where MUI's own handler is dead.
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not listen for Escape while closed", () => {
      const onClose = vi.fn();
      renderWithProviders(<SpanDetailPanel span={null} onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
