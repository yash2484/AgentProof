import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { QueryBoundary } from "./QueryBoundary";

describe("QueryBoundary", () => {
  it("shows a skeleton while loading", () => {
    renderWithProviders(<QueryBoundary isLoading><div>data</div></QueryBoundary>);
    expect(screen.getByTestId("query-loading")).toBeInTheDocument();
  });
  it("shows an error with retry", () => {
    renderWithProviders(<QueryBoundary isError onRetry={() => {}}><div>data</div></QueryBoundary>);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
  it("shows an empty message", () => {
    renderWithProviders(<QueryBoundary isEmpty emptyMessage="No traces yet"><div>data</div></QueryBoundary>);
    expect(screen.getByText("No traces yet")).toBeInTheDocument();
  });
  it("renders children when ready", () => {
    renderWithProviders(<QueryBoundary><div>data</div></QueryBoundary>);
    expect(screen.getByText("data")).toBeInTheDocument();
  });
});
