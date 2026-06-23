import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "../test/utils";
import { sampleSpanTree, sampleEvalResults } from "../test/fixtures";
import * as api from "../api/client";
import { TraceDetailPage } from "./TraceDetailPage";

beforeEach(() => {
  vi.spyOn(api, "getTraceTree").mockResolvedValue(sampleSpanTree);
  vi.spyOn(api, "getEvalResultsForTrace").mockResolvedValue({ trace_id: "tr-1", results: sampleEvalResults });
  vi.spyOn(api, "runEval").mockResolvedValue({ results: sampleEvalResults });
});
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/traces/:traceId" element={<TraceDetailPage />} />
    </Routes>,
    { route: "/traces/tr-1" },
  );
}

describe("TraceDetailPage", () => {
  it("renders the waterfall and eval results", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("orchestrator")).toBeInTheDocument());
    expect(screen.getByText(/answer_relevance/)).toBeInTheDocument();
  });

  it("triggers a run-eval on button click", async () => {
    renderPage();
    await waitFor(() => screen.getByText("orchestrator"));
    fireEvent.click(screen.getByRole("button", { name: /run eval/i }));
    await waitFor(() => expect(api.runEval).toHaveBeenCalledWith("tr-1"));
  });

  it("refetches eval results after a successful run-eval", async () => {
    renderPage();
    await waitFor(() => expect(api.getEvalResultsForTrace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /run eval/i }));
    // useRunEval onSuccess invalidates the trace's eval-results query -> refetch.
    await waitFor(() => expect((api.getEvalResultsForTrace as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
  });

  it("opens the span panel when a bar is clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("generate"));
    fireEvent.click(screen.getByText("generate"));
    await waitFor(() => expect(screen.getByText("Metadata")).toBeInTheDocument());
  });
});
