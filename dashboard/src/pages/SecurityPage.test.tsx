import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, sampleMetrics } from "../test/fixtures";
import * as api from "../api/client";
import { SecurityPage } from "./SecurityPage";

beforeEach(() => {
  vi.spyOn(api, "listEvalResults").mockResolvedValue({ results: sampleEvalResults, limit: 200, offset: 0 });
  vi.spyOn(api, "listMetrics").mockResolvedValue(sampleMetrics);
});
afterEach(() => vi.restoreAllMocks());

describe("SecurityPage", () => {
  it("renders only security findings", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });
    await waitFor(() => expect(screen.getByText("injection_resistance")).toBeInTheDocument());
    expect(screen.queryByText("answer_relevance")).not.toBeInTheDocument();
  });
});
