import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleEvalResults, sampleMetrics, multiTraceSecurityResults } from "../test/fixtures";
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

describe("SecurityPage — per-trace attribution (regression: defect 3)", () => {
  it("renders one distinct, linked card per trace", async () => {
    vi.spyOn(api, "listEvalResults").mockResolvedValue({
      results: multiTraceSecurityResults, limit: 200, offset: 0,
    });
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "tr-a" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "tr-b" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tr-c" })).toBeInTheDocument();

    // Three traces, three cards — no collapsing, no duplicates.
    expect(screen.getAllByTestId("security-report-card")).toHaveLength(3);
    for (const id of ["tr-a", "tr-b", "tr-c"]) {
      expect(screen.getByRole("link", { name: id })).toHaveAttribute(
        "href", `/traces/${id}`,
      );
    }
  });
});
