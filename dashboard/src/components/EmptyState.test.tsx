import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders guidance rather than an error", () => {
    renderWithProviders(
      <EmptyState
        title="No traces yet"
        body="Run the demo agent to populate this view."
      />,
    );
    expect(screen.getByText("No traces yet")).toBeInTheDocument();
    expect(screen.getByText(/run the demo agent/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders an action when one is given", () => {
    renderWithProviders(
      <EmptyState title="t" body="b" action={<button>Do the thing</button>} />,
    );
    expect(screen.getByRole("button", { name: "Do the thing" })).toBeInTheDocument();
  });
});
