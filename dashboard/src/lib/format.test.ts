import { describe, it, expect } from "vitest";
import { formatDuration, formatCost, formatTokens, spanColor, SPAN_TYPE_COLORS } from "./format";

describe("formatters", () => {
  it("formats duration", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(2000)).toBe("2.00 s");
  });
  it("formats cost", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.012)).toBe("$0.0120");
  });
  it("formats tokens", () => {
    expect(formatTokens(null)).toBe("—");
    expect(formatTokens(1500)).toBe("1,500");
  });
  it("maps span colors with a fallback", () => {
    expect(spanColor("llm_call")).toBe(SPAN_TYPE_COLORS.llm_call);
    expect(spanColor("unknown_type")).toMatch(/^#/);
  });
});
