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

describe("AppShell left rail", () => {
  it("shows Overview first in the rail", async () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/" });
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
  });

  it("marks Overview current only on the index route", () => {
    const { unmount } = renderWithProviders(
      <AppShell><div>content</div></AppShell>, { route: "/" },
    );
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current", "page",
    );
    unmount();

    // "/" is a prefix of every path — a startsWith match would light it up
    // on /traces too.
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Traces" })).toHaveAttribute(
      "aria-current", "page",
    );
  });

  it("keeps the project switcher reachable from the rail", async () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
  });
});
