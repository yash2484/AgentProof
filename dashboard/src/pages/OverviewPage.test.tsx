import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import {
  sampleSummary,
  emptySummary,
  sampleTraces,
  sampleSpanTree,
} from "../test/fixtures";
import * as api from "../api/client";
import { OverviewPage } from "./OverviewPage";

beforeEach(() => {
  vi.spyOn(api, "getEvalSummary").mockResolvedValue(sampleSummary);
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 1, offset: 0,
  });
  vi.spyOn(api, "getTraceTree").mockResolvedValue(sampleSpanTree);
});
afterEach(() => vi.restoreAllMocks());

describe("OverviewPage", () => {
  it("leads with the security verdict", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByTestId("verdict-headline")).toBeInTheDocument());
    expect(screen.getByText("Security verdict")).toBeInTheDocument();
  });

  it("shows the gate, p99 latency and trace count", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText("Gate")).toBeInTheDocument());
    // sampleSummary: injection held, exfiltration and relevance did not.
    expect(screen.getByText("1/3 held")).toBeInTheDocument();
    expect(screen.getByText("p99 latency")).toBeInTheDocument();
    expect(screen.getByText("1.82 s")).toBeInTheDocument();
    expect(screen.getByText("247 traces")).toBeInTheDocument();
  });

  it("renders a mini waterfall for the latest trace", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getAllByTestId(/^mini-bar-/).length).toBe(3));
  });

  it("renders guidance, not an error, for a fresh install", async () => {
    vi.spyOn(api, "getEvalSummary").mockResolvedValue(emptySummary);
    vi.spyOn(api, "listTraces").mockResolvedValue({ traces: [], total: 0, limit: 1, offset: 0 });
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText(/no traces yet/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks the API for the summary", async () => {
    renderWithProviders(<OverviewPage />, { route: "/" });
    await waitFor(() => expect(api.getEvalSummary).toHaveBeenCalled());
  });
});
