import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleTraces } from "../test/fixtures";
import * as api from "../api/client";
import { TracesPage } from "./TracesPage";

beforeEach(() => {
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 50, offset: 0,
  });
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
    await waitFor(() => expect(screen.getByText(/no traces/i)).toBeInTheDocument());
  });
});
