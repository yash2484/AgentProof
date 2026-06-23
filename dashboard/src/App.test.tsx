import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/utils";
import App from "./App";

describe("App", () => {
  it("renders the shell and redirects to traces", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByText("AgentProof")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Traces" })).toBeInTheDocument();
  });
});
