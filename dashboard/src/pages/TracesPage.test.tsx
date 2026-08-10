import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { sampleTraces } from "../test/fixtures";
import * as api from "../api/client";
import { TracesPage } from "./TracesPage";
import type { EvalOutcome } from "../types";

const outcome = (o: Partial<EvalOutcome> = {}): EvalOutcome => ({
  total: 8, passed: 8, failed: 0, degraded: 0,
  worst_metric: "cost_budget", worst_score: 1, outcome: "passed", ...o,
});

/** The first trace failed something, the second was never measured. */
const withOutcomes = [
  { ...sampleTraces[0], eval_outcome: outcome({ failed: 2, passed: 6, worst_metric: "faithfulness", worst_score: 0.35, outcome: "failed" }) },
  { ...sampleTraces[1], eval_outcome: outcome({ total: 0, passed: 0, worst_metric: null, worst_score: null, outcome: "not_evaluated" }) },
];

beforeEach(() => {
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: withOutcomes, total: withOutcomes.length, limit: 50, offset: 0,
  });
  vi.spyOn(api, "getEvalResultsForTrace").mockResolvedValue({ results: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("TracesPage", () => {
  it("renders trace rows from the API", async () => {
    renderWithProviders(<TracesPage />, { route: "/traces" });
    await waitFor(() => expect(screen.getByText("research-task")).toBeInTheDocument());
    expect(screen.getByText("failing-task")).toBeInTheDocument();
  });

  it("shows the empty state when there are no traces", async () => {
    vi.spyOn(api, "listTraces").mockResolvedValue({ traces: [], total: 0, limit: 50, offset: 0 });
    renderWithProviders(<TracesPage />, { route: "/traces" });
    await waitFor(() => expect(screen.getByText(/no traces match/i)).toBeInTheDocument());
  });

  // ---------------------------------------------------------------------
  // The columns the page exists for
  // ---------------------------------------------------------------------

  it("says what each trace's measurements did", async () => {
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() =>
      expect(screen.getByTestId(`outcome-${withOutcomes[0].trace_id}`)).toHaveTextContent(
        "2 of 8 failed",
      ),
    );
  });

  it("never renders an unmeasured trace as a pass", async () => {
    // "0/0" reads as a pass at a glance. It is not one.
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() =>
      expect(screen.getByTestId(`outcome-${withOutcomes[1].trace_id}`)).toHaveTextContent(
        "not evaluated",
      ),
    );
  });

  it("names the worst metric, which is what makes the grid scannable", async () => {
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() =>
      expect(screen.getByText("Faithfulness 0.350")).toBeInTheDocument(),
    );
  });

  it("exposes the outcome filter by its visible label", async () => {
    // An aria-label passed through inputProps lands on MUI's hidden input,
    // not the combobox the user operates, leaving the control unreachable by
    // name for keyboard and screen-reader users.
    const user = userEvent.setup();
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() => expect(screen.getByLabelText("Outcome")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Outcome"));
    expect(
      await screen.findByRole("option", { name: "Failed something" }),
    ).toBeInTheDocument();
  });

  it("asks the server for the outcome filter rather than trimming the page", async () => {
    // Filtering client-side would return short pages and a wrong total.
    renderWithProviders(<TracesPage />, { route: "/traces?outcome=failed" });

    await waitFor(() =>
      expect(api.listTraces).toHaveBeenCalledWith(
        expect.objectContaining({ eval_outcome: "failed" }),
      ),
    );
  });

  it("keeps the selected trace in the URL so the back button works", async () => {
    renderWithProviders(<TracesPage />, {
      route: `/traces?trace=${withOutcomes[0].trace_id}`,
    });

    await waitFor(() => expect(screen.getByTestId("trace-strip")).toBeInTheDocument());
    expect(screen.getByTestId("trace-strip")).toHaveTextContent(
      withOutcomes[0].trace_id,
    );
  });

  it("holds the panel slot before anything is selected", async () => {
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() =>
      expect(screen.getByTestId("trace-strip-empty")).toBeInTheDocument(),
    );
  });

  it("no longer puts delete on every row", async () => {
    // It sat one mis-click from destroying a recording.
    renderWithProviders(<TracesPage />, { route: "/traces" });

    await waitFor(() => expect(screen.getByText("research-task")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("requires the word to be typed before deletion is possible", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TracesPage />, {
      route: `/traces?trace=${withOutcomes[0].trace_id}`,
    });

    await waitFor(() => expect(screen.getByTestId("delete-start")).toBeInTheDocument());
    await user.click(screen.getByTestId("delete-start"));

    expect(screen.getByTestId("delete-commit")).toBeDisabled();
    await user.type(screen.getByLabelText(/type "delete" to confirm/i), "delete");
    expect(screen.getByTestId("delete-commit")).toBeEnabled();
  });
});
