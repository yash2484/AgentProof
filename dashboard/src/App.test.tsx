import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/utils";
import { sampleTraces, sampleSummary, sampleSpanTree } from "./test/fixtures";
import * as api from "./api/client";
import App from "./App";

// The index route renders the Overview, which fetches on mount. Without
// these, jsdom attempts real network calls and the suite fills with noise.
beforeEach(() => {
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 200, offset: 0,
  });
  vi.spyOn(api, "getEvalSummary").mockResolvedValue(sampleSummary);
  vi.spyOn(api, "getTraceTree").mockResolvedValue(sampleSpanTree);
});
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("renders the shell and lands on the overview", () => {
    renderWithProviders(<App />, { route: "/" });
    // The brand renders as "Agent" + a nested <span>Proof</span>. RTL's
    // default getByText only reads an element's own direct text-node
    // children (not full textContent), so neither the outer h6 nor the span
    // matches "AgentProof" on its own — a plain string query, or one scoped
    // with `selector`, both report "no match". A function matcher reading
    // textContent directly is the correct fix for text split across
    // elements.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "h6" &&
          element.textContent === "AgentProof",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });
});
