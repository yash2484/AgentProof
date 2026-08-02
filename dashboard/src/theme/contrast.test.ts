import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";
import { tokens } from "./palette";

/** Body-size text must clear 4.5:1; non-text and large text must clear 3.0:1. */
const BODY_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3.0;

/** Both page backgrounds — text sits on each, so each must be checked. */
const BACKGROUNDS = [tokens.bg, tokens.surface];

const BODY_TOKENS: Record<string, string> = {
  ink: tokens.ink,
  muted: tokens.muted,
  "brand.text": tokens.brand.text,
  "status.pass": tokens.status.pass,
  "status.fail.text": tokens.status.fail.text,
  "status.warn": tokens.status.warn,
};

const NON_TEXT_TOKENS: Record<string, string> = {
  "brand.solid": tokens.brand.solid,
  "status.fail.solid": tokens.status.fail.solid,
};

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white and is order-independent", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio(tokens.ink, tokens.ink)).toBeCloseTo(1, 5);
  });
});

describe("palette contrast floors", () => {
  it.each(Object.entries(BODY_TOKENS))(
    "%s clears 4.5:1 on every background",
    (_name, hex) => {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(BODY_FLOOR);
      }
    },
  );

  it.each(Object.entries(NON_TEXT_TOKENS))(
    "%s clears 3.0:1 on every background",
    (_name, hex) => {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      }
    },
  );

  it("keeps solid tokens below the body floor, so the split stays justified", () => {
    // If a solid token ever clears 4.5 the split into solid/text is dead
    // weight and should be removed rather than left to rot.
    expect(contrastRatio(tokens.brand.solid, tokens.surface)).toBeLessThan(BODY_FLOOR);
    expect(contrastRatio(tokens.status.fail.solid, tokens.surface)).toBeLessThan(BODY_FLOOR);
  });
});

describe("span-type fills", () => {
  it("each fill clears 3.0:1 against the surface it sits on", () => {
    for (const hex of Object.values(tokens.spanTypes)) {
      expect(contrastRatio(hex, tokens.surface)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    }
  });

  it("the on-fill label colour clears 4.5:1 against every fill", () => {
    for (const hex of Object.values(tokens.spanTypes)) {
      expect(contrastRatio(tokens.onFill, hex)).toBeGreaterThanOrEqual(BODY_FLOOR);
    }
  });
});

describe("measured ratios match the approved design spec", () => {
  // Exact values from docs/superpowers/specs/2026-08-02-dashboard-redesign-design.md.
  // A change here means the palette moved — update the spec, don't loosen the test.
  const EXPECTED: Array<[string, string, number]> = [
    ["ink", tokens.ink, 15.06],
    ["muted", tokens.muted, 5.22],
    ["brand.solid", tokens.brand.solid, 4.13],
    ["brand.text", tokens.brand.text, 4.97],
    ["status.pass", tokens.status.pass, 8.54],
    ["status.fail.solid", tokens.status.fail.solid, 4.35],
    ["status.fail.text", tokens.status.fail.text, 5.18],
    ["status.warn", tokens.status.warn, 7.73],
  ];

  it.each(EXPECTED)("%s measures %#s against surface", (_name, hex, expected) => {
    expect(contrastRatio(hex, tokens.surface)).toBeCloseTo(expected as number, 1);
  });
});
