import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import { ScopeBar } from "./ScopeBar";

describe("ScopeBar", () => {
  it("names the page and the project it is scoped to", () => {
    renderWithProviders(<ScopeBar title="Overview" project="demo-research-agent" />);

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("demo-research-agent")).toBeInTheDocument();
  });

  it("says so when no project is selected rather than leaving scope implicit", () => {
    renderWithProviders(<ScopeBar title="Traces" project={undefined} />);

    expect(screen.getByText("all projects")).toBeInTheDocument();
  });

  it("reports the run count and when it last ran", () => {
    renderWithProviders(
      <ScopeBar
        title="Overview"
        project="demo"
        runs={[{ run_at: "2026-08-01T10:00:00Z" }, { run_at: "2026-08-09T10:00:00Z" }]}
      />,
    );

    expect(screen.getByTestId("scope-runs")).toHaveTextContent("2 runs");
    expect(screen.getByTestId("scope-runs")).toHaveTextContent(/last evaluated/);
  });

  it("distinguishes a page with no runs from a page that was never given any", () => {
    // The whole product exists to stop "unmeasured" reading as a verdict.
    // A bar that prints "0 runs · never evaluated" because the prop was
    // omitted makes exactly that claim on a page showing 300 traces.
    const { unmount } = renderWithProviders(
      <ScopeBar title="Traces" project="demo" runs={undefined} />,
    );
    expect(screen.queryByTestId("scope-runs")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<ScopeBar title="Overview" project="demo" runs={[]} />);
    expect(screen.getByTestId("scope-runs")).toHaveTextContent("0 runs");
    expect(screen.getByTestId("scope-runs")).toHaveTextContent("never evaluated");
  });

  it("hides the window control on a page that is not scoped to a window", () => {
    renderWithProviders(<ScopeBar title="Traces" project="demo" />);

    expect(screen.queryByRole("group", { name: "time range" })).not.toBeInTheDocument();
  });

  it("marks the active window and reports a change", async () => {
    const onDaysChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ScopeBar title="Overview" project="demo" days={30} onDaysChange={onDaysChange} runs={[]} />,
    );

    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "7d" }));
    expect(onDaysChange).toHaveBeenCalledWith(7);
  });

  it("flags a generated corpus at the top of the page it scopes", () => {
    renderWithProviders(<ScopeBar title="Overview" project="synthetic-showcase" />);

    expect(screen.getByTestId("synthetic-badge")).toBeInTheDocument();
  });
});
