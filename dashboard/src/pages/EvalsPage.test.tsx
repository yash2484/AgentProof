import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { emptyAnalytics, sampleAnalytics } from "../test/fixtures";
import * as api from "../api/client";
import { EvalsPage } from "./EvalsPage";

beforeEach(() => {
  vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(sampleAnalytics);
});
afterEach(() => vi.restoreAllMocks());

describe("EvalsPage", () => {
  it("gives each metric group its own panel", async () => {
    // The page this replaces drew eight metrics as eight lines on one 0–1
    // axis, three of which meant different things by "1.0".
    renderWithProviders(<EvalsPage />, { route: "/evals" });

    await waitFor(() =>
      expect(screen.getByTestId("group-panel-quality")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("group-panel-safety")).toBeInTheDocument();
    expect(screen.getByTestId("group-panel-budgets")).toBeInTheDocument();
  });

  it("puts every metric in the strip as a link to its own page", async () => {
    // Unscoped, so the href carries only the window. A named project rides
    // along too — covered by the deep-link tests on the detail page.
    renderWithProviders(<EvalsPage />, { route: "/evals", project: null });

    await waitFor(() => expect(screen.getByTestId("metric-strip")).toBeInTheDocument());
    // The window rides along, so the detail page cannot silently widen it.
    expect(screen.getByTestId("metric-tile-faithfulness")).toHaveAttribute(
      "href",
      "/evals/faithfulness?days=30",
    );
    expect(screen.getByTestId("metric-tile-cost_budget")).toBeInTheDocument();
  });

  it("shows the scope above every figure it scopes", async () => {
    renderWithProviders(<EvalsPage />, { route: "/evals" });

    await waitFor(() => expect(screen.getByTestId("scope-bar")).toBeInTheDocument());
  });

  it("never draws a single line across all eight metrics", async () => {
    renderWithProviders(<EvalsPage />, { route: "/evals" });

    await waitFor(() => expect(screen.getByTestId("metric-strip")).toBeInTheDocument());
    expect(screen.queryByTestId("score-timeseries")).not.toBeInTheDocument();
  });

  it("says the window is empty rather than drawing empty panels", async () => {
    vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(emptyAnalytics);

    renderWithProviders(<EvalsPage />, { route: "/evals" });

    await waitFor(() =>
      expect(screen.getByText(/No eval results in this window/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("group-panel-quality")).not.toBeInTheDocument();
  });
});
