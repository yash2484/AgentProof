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
    // Ledger's wordmark is one serif text node. It used to render as
    // "Agent" + a nested <span>Proof</span>, which RTL could not match with
    // a plain string query because getByText reads an element's own direct
    // text children rather than its textContent — hence the function matcher
    // this replaces. Spending the brand accent on a word nobody clicks was
    // the reason for the split, and it is gone.
    expect(screen.getByText("AgentProof")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });
});
