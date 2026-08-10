import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { sampleAnalytics, emptyAnalytics } from "../test/fixtures";
import { DEFAULT_PROJECT } from "../context/ProjectContext";
import * as api from "../api/client";
import { OverviewPage } from "./OverviewPage";

/**
 * The Overview as a triage page.
 *
 * These tests replace a suite that described a different page: one that
 * rendered every metric's distribution inline. That panel duplicated
 * `/evals` and `/evals/:metric` and did it worse — a 46px track carrying a
 * histogram, a threshold, a mean and a ±0.2 band with no legend, in which a
 * single breach rendered 0.45px tall. It is deleted, so the tests for it are
 * too, and these pin what replaced it.
 */

beforeEach(() => {
  vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(sampleAnalytics);
});
afterEach(() => vi.restoreAllMocks());

async function renderPage() {
  renderWithProviders(<OverviewPage />, { route: "/" });
  await waitFor(() =>
    expect(screen.getByTestId("verdict-band")).toBeInTheDocument(),
  );
}

describe("OverviewPage", () => {
  it("puts the scope above every figure it scopes", async () => {
    await renderPage();
    expect(screen.getByTestId("scope-bar")).toBeInTheDocument();
    expect(screen.getByTestId("scope-runs")).toHaveTextContent("4 runs");
  });

  it("renders the four bands in triage order", async () => {
    await renderPage();
    const bands = ["verdict-band", "variance-panel", "trust-band", "findings-feed"];
    for (const id of bands) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }

    // Order is the argument: conclusion, then what changed, then whether it
    // can be trusted, then where to go. Assert it rather than trusting JSX.
    const positions = bands.map((id) =>
      Array.prototype.indexOf.call(
        document.querySelectorAll("[data-testid]"),
        screen.getByTestId(id),
      ),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("leads with a conclusion, not with a number", async () => {
    await renderPage();
    // The old page's largest type was a count. The largest type here is a
    // sentence saying what to take from the page.
    expect(screen.getByTestId("verdict-headline").textContent).toMatch(/[a-z]{4,}/i);
  });

  it("no longer renders the per-metric distribution strip", async () => {
    await renderPage();
    expect(screen.queryByTestId("metric-health")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ceiling-strip")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("distribution-faithfulness"),
    ).not.toBeInTheDocument();
  });

  it("keeps degraded measurements out of the failing count", async () => {
    await renderPage();
    const trust = screen.getByTestId("trust-band");
    // Named as broken measurement, never as a failure.
    expect(trust).toHaveTextContent(/broken measurement/i);
    expect(trust).toHaveTextContent(/never counted as a failure/i);
  });

  it("states measured coverage with a denominator", async () => {
    await renderPage();
    // 13 of 25 traces scored; 3 never evaluated.
    expect(screen.getByTestId("trust-band")).toHaveTextContent("13 of 25");
  });

  it("never renders a negative count", async () => {
    // The defect this band replaces rendered "-6 pending" on the live corpus,
    // by subtracting two differently-scoped counts.
    await renderPage();
    expect(screen.getByTestId("trust-band").textContent).not.toMatch(/-\d/);
  });

  it("says which metrics were never exercised", async () => {
    await renderPage();
    // The one insight worth keeping from the deleted panel: a metric pinned at
    // 1.000 is unexercised, not proven.
    expect(screen.getByTestId("trust-band")).toHaveTextContent(
      /never moved|unexercised/i,
    );
  });

  it("names what kind of numbers these are", async () => {
    await renderPage();
    expect(screen.getByTestId("provenance-sentence")).toBeInTheDocument();
  });

  it("never renders the old unqualified security verdict", async () => {
    // "injection_resistance regressed — the agent gave ground under attack",
    // rendered from one failing row with no denominator, is the reason this
    // page was rebuilt.
    const { container } = renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() =>
      expect(screen.getByTestId("verdict-band")).toBeInTheDocument(),
    );
    expect(container.textContent).not.toMatch(/gave ground/i);
  });

  it("refetches when the window changes rather than relabelling stale figures", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() =>
      expect(api.getEvalAnalytics).toHaveBeenCalledWith({
        project: DEFAULT_PROJECT,
        days: 7,
      }),
    );
  });

  it("asks for all history when the window is All", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(api.getEvalAnalytics).toHaveBeenCalledWith({
        project: DEFAULT_PROJECT,
        days: 0,
      }),
    );
  });

  it("renders guidance, not an error, for a fresh install", async () => {
    vi.spyOn(api, "getEvalAnalytics").mockResolvedValue(emptyAnalytics);
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() =>
      expect(screen.getByText(/no traces in this window/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes with the totals behind every figure above", async () => {
    await renderPage();
    expect(
      screen.getByText(/257 passed · 5 failed · 18 degraded measurements/),
    ).toBeInTheDocument();
  });
});

describe("OverviewPage — a generated corpus", () => {
  it("says every figure was authored, in the body rather than a footnote", async () => {
    vi.spyOn(api, "getEvalAnalytics").mockResolvedValue({
      ...sampleAnalytics,
      project: "synthetic-showcase",
      generated: true,
    });
    await renderPage();

    const sentence = screen.getByTestId("provenance-sentence");
    expect(sentence).toHaveTextContent(/generated by a script/i);
    expect(sentence).toHaveTextContent(/not evidence/i);
    // Never described as measured — that is the whole point of the split.
    expect(sentence.textContent?.toLowerCase()).not.toMatch(/\bmeasured\b/);
  });
});
