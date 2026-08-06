import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/utils";
import { tokens } from "../theme";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders the label, value and sublabel", () => {
    renderWithProviders(
      <StatTile label="p99 latency" value="1.82 s" sublabel="247 traces" />,
    );
    expect(screen.getByText("p99 latency")).toBeInTheDocument();
    expect(screen.getByText("1.82 s")).toBeInTheDocument();
    expect(screen.getByText("247 traces")).toBeInTheDocument();
  });

  it("omits the sublabel element when none is given", () => {
    renderWithProviders(<StatTile label="Gate" value="PASS" />);
    expect(screen.queryByTestId("stat-tile-sublabel")).not.toBeInTheDocument();
  });

  it("colours the value by tone", () => {
    renderWithProviders(<StatTile label="Gate" value="PASS" tone="pass" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      color: tokens.status.pass,
    });
  });

  it("uses ink for the neutral tone", () => {
    renderWithProviders(<StatTile label="Traces" value="247" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      color: tokens.ink,
    });
  });

  it("renders the value with tabular numerals", () => {
    renderWithProviders(<StatTile label="Traces" value="247" />);
    expect(screen.getByTestId("stat-tile-value")).toHaveStyle({
      fontVariantNumeric: "tabular-nums",
    });
  });
});
