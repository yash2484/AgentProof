import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, sampleMetrics } from "../test/fixtures";
import * as api from "../api/client";
import { EvalsPage } from "./EvalsPage";

beforeEach(() => {
  vi.spyOn(api, "listEvalResults").mockResolvedValue({ results: sampleEvalResults, limit: 200, offset: 0 });
  vi.spyOn(api, "listMetrics").mockResolvedValue(sampleMetrics);
});
afterEach(() => vi.restoreAllMocks());

describe("EvalsPage", () => {
  it("renders the chart from eval results", async () => {
    renderWithProviders(<EvalsPage />, { route: "/evals" });
    await waitFor(() => expect(screen.getByTestId("score-timeseries")).toBeInTheDocument());
  });
});
