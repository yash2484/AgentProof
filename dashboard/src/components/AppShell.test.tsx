import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material";
import { theme } from "../theme";
import { ProjectProvider } from "../context/ProjectContext";
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

/** Stub matchMedia so useMediaQuery can be driven deterministically. */
function setViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  );
}

describe("AppShell responsive rail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the rail and no menu button on a wide viewport", async () => {
    setViewport(false); // not narrow
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open navigation/i })).not.toBeInTheDocument();
    await waitFor(() => expect(api.listTraces).toHaveBeenCalled());
  });

  it("exposes a navigation landmark at both viewport sizes", () => {
    setViewport(false); // wide
    const { unmount } = renderWithProviders(
      <AppShell><div>content</div></AppShell>, { route: "/traces" },
    );
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    unmount();

    // Narrow: the drawer's paper carries the landmark, but while the drawer
    // is closed the paper sits behind an aria-hidden Modal wrapper with
    // visibility:hidden -- role queries correctly exclude it, same as the
    // "hides the rail..." test below documents for links. That's accurate:
    // there's nothing on screen to navigate yet. Open it first, which is
    // the only way a user (or assistive tech) reaches the rail at this
    // width, and assert the landmark is there once revealed.
    setViewport(true); // narrow
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("hides the rail behind a menu button on a narrow viewport", () => {
    setViewport(true); // narrow
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
    // The temporary drawer is closed initially, so nav links are not rendered.
    // ModalProps={{ keepMounted: true }} keeps railContent mounted while closed,
    // but MUI's Modal applies inline `visibility: hidden`, which Testing
    // Library's role queries treat as inaccessible and exclude by default --
    // that's what makes this assertion (rather than a "not in the DOM" check)
    // a valid guard.
    expect(screen.queryByRole("link", { name: "Traces" })).not.toBeInTheDocument();
  });

  it("opens the drawer when the menu button is clicked", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });

  it("closes the drawer after following a link", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    fireEvent.click(screen.getByRole("link", { name: "Evals" }));
    // Navigating must not leave the overlay covering the page.
    expect(screen.queryByRole("link", { name: "Evals" })).not.toBeInTheDocument();
  });

  it("keeps the project switcher reachable on a narrow viewport", () => {
    setViewport(true);
    renderWithProviders(<AppShell><div>content</div></AppShell>, { route: "/traces" });
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
  });

  it("does not reopen the drawer after the viewport widens and narrows again", () => {
    // renderWithProviders wraps `ui` inside its own provider tree before
    // calling RTL's render(), so its `rerender` only replaces `ui` -- it
    // can't be handed a bare <AppShell> here because that would drop the
    // Router/Query/Project providers rendered around it and throw. Mirror
    // the same wrapper locally so `rerender` keeps the same AppShell
    // instance (and its state) across viewport flips.
    //
    // Each call below builds a fresh element tree rather than reusing one
    // reference: React bails out of re-rendering a subtree whose top-level
    // element is referentially unchanged, which would silently stop
    // useMediaQuery from ever re-reading the re-stubbed matchMedia.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const buildTree = () => (
      <QueryClientProvider client={client}>
        <ThemeProvider theme={theme}>
          <ProjectProvider>
            <MemoryRouter initialEntries={["/traces"]}>
              <AppShell><div>content</div></AppShell>
            </MemoryRouter>
          </ProjectProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );

    setViewport(true); // narrow
    const { rerender } = render(buildTree());
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();

    setViewport(false); // widen past the breakpoint
    rerender(buildTree());

    setViewport(true); // and back to narrow
    rerender(buildTree());

    // The drawer must be closed again, not popped open by stale state.
    expect(screen.queryByRole("link", { name: "Traces" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });
});
