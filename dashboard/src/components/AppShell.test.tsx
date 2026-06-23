import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { sampleTraces } from "../test/fixtures";
import * as api from "../api/client";
import { AppShell } from "./AppShell";

beforeEach(() => {
  vi.spyOn(api, "listTraces").mockResolvedValue({
    traces: sampleTraces, total: sampleTraces.length, limit: 200, offset: 0,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("AppShell", () => {
  it("renders nav links and a project switcher with fetched projects", async () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Evals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Security" })).toBeInTheDocument();
    // The switcher loads distinct project names from the traces endpoint.
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
    expect(screen.getByText("All projects")).toBeInTheDocument();
  });
});
