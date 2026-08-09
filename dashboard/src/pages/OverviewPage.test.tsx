import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics, emptyAnalytics } from "../test/fixtures";
import * as api from "../api/client";
import { OverviewPage } from "./OverviewPage";

beforeEach(() => {
  vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(sampleAnalytics);
});
afterEach(() => vi.restoreAllMocks());

async function renderPage() {
  renderWithProviders(<OverviewPage />, { route: "/" });
  await waitFor(() => expect(screen.getByTestId("gate-verdict")).toBeInTheDocument());
}

describe("OverviewPage", () => {
  it("puts the scope above every figure it scopes", async () => {
    await renderPage();
    expect(screen.getByTestId("scope-bar")).toBeInTheDocument();
    expect(screen.getByTestId("scope-runs")).toHaveTextContent("4 runs");
  });

  it("renders all four bands", async () => {
    await renderPage();
    expect(screen.getByTestId("gate-verdict")).toBeInTheDocument();
    expect(screen.getByTestId("metric-health")).toBeInTheDocument();
    expect(screen.getByTestId("variance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("findings-feed")).toBeInTheDocument();
  });

  it("keeps degraded measurements out of the failing count", async () => {
    await renderPage();
    expect(screen.getByTestId("measurement-counts")).toHaveTextContent(
      "13 scored · 9 failed · 3 pending",
    );
    expect(screen.getByTestId("measurement-health")).toHaveTextContent(
      "excluded from every score above",
    );
  });

  it("never renders the old unqualified security verdict", async () => {
    // "injection_resistance regressed — the agent gave ground under attack",
    // rendered from one failing row with no denominator, is the reason this
    // page was rebuilt.
    const { container } = renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByTestId("gate-verdict")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/gave ground/i);
  });

  it("refetches when the window changes rather than relabelling stale figures", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() =>
      expect(api.getEvalAnalytics).toHaveBeenCalledWith({ project: undefined, days: 7 }),
    );
  });

  it("asks for all history when the window is All", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(api.getEvalAnalytics).toHaveBeenCalledWith({ project: undefined, days: 0 }),
    );
  });

  it("renders guidance, not an error, for a fresh install", async () => {
    vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(emptyAnalytics);
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText(/no traces in this window/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes with the totals behind every figure above", async () => {
    await renderPage();
    expect(
      screen.getByText(/257 passed · 5 failed · 18 degraded measurements/),
    ).toBeInTheDocument();
  });
});
