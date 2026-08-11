import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { emptySecurityAnalytics, sampleSecurityAnalytics } from "../test/fixtures";
import * as api from "../api/client";
import { SecurityPage } from "./SecurityPage";

beforeEach(() => {
  vi.spyOn(api, "getSecurityAnalytics").mockResolvedValue(sampleSecurityAnalytics);
});
afterEach(() => vi.restoreAllMocks());

describe("SecurityPage", () => {
  it("leads with posture and attack surface, not with a wall of cards", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("posture-strip")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("attack-surface")).toBeInTheDocument();
    expect(screen.getByTestId("breach-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("security-findings")).toBeInTheDocument();
  });

  it("gives every breach count a denominator", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("posture-data_exfiltration")).toHaveTextContent(
        "1 of 37 measurements breached",
      ),
    );
  });

  it("distinguishes a control that was attacked from one nobody probed", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("posture-injection_resistance")).toHaveTextContent(
        "5 of 36 measurements were under attack",
      ),
    );
    expect(screen.getByTestId("posture-tool_misuse")).toHaveTextContent(
      /no attempt signal recorded/i,
    );
  });

  it("does not present a passing control as proven when it never varied", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("posture-tool_misuse")).toHaveTextContent(
        /unexercised control, not a passing one/i,
      ),
    );
  });

  it("shows the scope above every figure it scopes", async () => {
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() => expect(screen.getByTestId("scope-bar")).toBeInTheDocument());
  });

  it("counts the runs it actually has rather than reporting none", async () => {
    // The bar took a whole eval-analytics payload, which this page does not
    // have, so it read "0 runs · never evaluated" above two runs of data.
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("scope-runs")).toHaveTextContent("2 runs"),
    );
    expect(screen.getByTestId("scope-runs")).not.toHaveTextContent("never evaluated");
  });

  it("says the window is empty rather than drawing empty panels", async () => {
    vi.spyOn(api, "getSecurityAnalytics").mockResolvedValue(emptySecurityAnalytics);

    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByText(/No security evals in this window/i)).toBeInTheDocument(),
    );
  });
});

describe("SecurityPage — per-trace attribution (regression: defect 3)", () => {
  it("keeps one distinct, linked finding per trace", async () => {
    // Carried over from the card-wall page this replaced. The layout changed
    // completely; the defect it guards against did not — three breaching
    // traces must stay three findings, each linked to its own trace, with no
    // collapsing and no duplicates.
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("finding-tr-a")).toBeInTheDocument(),
    );

    for (const id of ["tr-a", "tr-b", "tr-c"]) {
      expect(screen.getByTestId(`finding-link-${id}`)).toHaveAttribute(
        "href",
        `/traces/${id}`,
      );
    }
    expect(screen.getAllByTestId(/^finding-tr-/)).toHaveLength(3);
  });

  it("never enumerates a passing row", async () => {
    // 110 measurements, 1 breach. The old page rendered a card per row.
    renderWithProviders(<SecurityPage />, { route: "/security" });

    await waitFor(() =>
      expect(screen.getByTestId("security-findings")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId(/^finding-tr-/)).toHaveLength(3);
  });
});
