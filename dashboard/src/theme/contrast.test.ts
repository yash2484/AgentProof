import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  relativeLuminance,
  hue,
  hueDistance,
  saturation,
} from "./contrast";
import { tokens } from "./palette";
import { FONT_SERIF, FONT_SANS, FONT_MONO } from "./typography";

/** Body-size text must clear 4.5:1; non-text and large text must clear 3.0:1. */
const BODY_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3.0;

/**
 * Every ground text can land on. Ledger has four rather than the two the
 * dark theme had, and a token that clears on paper can still fail on the
 * rail — which is a real regression this suite exists to catch.
 */
const GROUNDS: Record<string, string> = {
  paper: tokens.paper,
  card: tokens.card,
  data: tokens.data,
  rail: tokens.rail,
};

const BODY_TOKENS: Record<string, string> = {
  ink: tokens.ink,
  ink2: tokens.ink2,
  dim: tokens.dim,
  link: tokens.link,
  "status.pass": tokens.status.pass,
  "status.watch": tokens.status.watch,
  "status.fail": tokens.status.fail,
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

  it("rejects anything that is not a 6-digit hex", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
    expect(() => contrastRatio("#FFF", "#FFFFFF")).toThrow();
  });
});

describe("hue, saturation and hueDistance", () => {
  it("reads the primary hues", () => {
    expect(hue("#FF0000")).toBe(0);
    expect(hue("#00FF00")).toBe(120);
    expect(hue("#0000FF")).toBe(240);
  });

  it("reports zero saturation for grey, where hue means nothing", () => {
    expect(saturation("#808080")).toBe(0);
    expect(saturation("#FFFFFF")).toBe(0);
    expect(saturation("#FF0000")).toBeCloseTo(1, 5);
  });

  it("takes the short way round the wheel", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(0, 200)).toBe(160);
  });
});

describe("palette contrast floors", () => {
  it.each(Object.entries(BODY_TOKENS))(
    "%s clears 4.5:1 on every ground",
    (name, hex) => {
      for (const [ground, bg] of Object.entries(GROUNDS)) {
        expect(contrastRatio(hex, bg), `${name} on ${ground}`).toBeGreaterThanOrEqual(
          BODY_FLOOR,
        );
      }
    },
  );

  it.each(Object.entries(tokens.category))(
    "category.%s clears 4.5:1 on every ground",
    (name, hex) => {
      // Category colours label chart series and legends, so they carry text
      // weight rather than merely being marks.
      for (const [ground, bg] of Object.entries(GROUNDS)) {
        expect(
          contrastRatio(hex, bg),
          `category.${name} on ${ground}`,
        ).toBeGreaterThanOrEqual(BODY_FLOOR);
      }
    },
  );

  it.each(Object.entries(tokens.spanTypes))(
    "a white label on the %s fill clears 4.5:1",
    (_name, hex) => {
      // Waterfall bars carry their label inside the fill. The same hex is
      // therefore both a background and a foreground, and has to clear both.
      expect(contrastRatio(tokens.onFill, hex)).toBeGreaterThanOrEqual(BODY_FLOOR);
    },
  );

  it("steel clears the non-text floor on the data ground it is drawn on", () => {
    // Histogram bars are non-text. Steel is deliberately lighter than any
    // label colour so that the flagged bars stay the only thing in the
    // figure that pulls the eye.
    expect(contrastRatio(tokens.steel, tokens.data)).toBeGreaterThanOrEqual(
      NON_TEXT_FLOOR,
    );
    expect(contrastRatio(tokens.steel, tokens.data)).toBeLessThan(BODY_FLOOR);
  });

  it("hairlines stay below text weight, because a rule is not a word", () => {
    for (const rule of [tokens.hair, tokens.hairStrong]) {
      expect(contrastRatio(rule, tokens.paper)).toBeLessThan(NON_TEXT_FLOOR);
    }
    // ...but the section rule must still be visibly stronger than the row rule.
    expect(contrastRatio(tokens.hairStrong, tokens.paper)).toBeGreaterThan(
      contrastRatio(tokens.hair, tokens.paper),
    );
  });
});

describe("the ground is biased blue, and stays that way", () => {
  // Warm cream is the single most saturated AI-generated default there is.
  // The spec bans the whole warm-neutral band by name; this is the guard
  // that makes a future edit warming the ground fail rather than ship.
  const WARM_BAND: [number, number] = [40, 100];
  const TINTED = {
    paper: tokens.paper,
    data: tokens.data,
    rail: tokens.rail,
    hair: tokens.hair,
    hairStrong: tokens.hairStrong,
  };

  it.each(Object.entries(TINTED))("%s is cool, never warm", (name, hex) => {
    const h = hue(hex);
    expect(h >= WARM_BAND[0] && h <= WARM_BAND[1], `${name} is hue ${h}`).toBe(false);
    // Cool means the blue quadrant, not merely "not warm".
    expect(h, `${name} is hue ${h}`).toBeGreaterThan(180);
    expect(h, `${name} is hue ${h}`).toBeLessThan(260);
  });

  it("leaves the card surface a true neutral", () => {
    expect(saturation(tokens.card)).toBe(0);
  });

  it("keeps the grounds ordered card > paper > data > rail in lightness", () => {
    // The tint that means "measured" only reads if the data surface is
    // actually a step down from the page it sits on.
    expect(relativeLuminance(tokens.card)).toBeGreaterThan(
      relativeLuminance(tokens.paper),
    );
    expect(relativeLuminance(tokens.paper)).toBeGreaterThan(
      relativeLuminance(tokens.data),
    );
    expect(relativeLuminance(tokens.data)).toBeGreaterThan(
      relativeLuminance(tokens.rail),
    );
  });
});

describe("a category never wears a verdict's colour", () => {
  /** The reserved bands. Everything else on the wheel is available. */
  const VERDICT_HUES: Record<string, number> = {
    pass: hue(tokens.status.pass),
    watch: hue(tokens.status.watch),
    fail: hue(tokens.status.fail),
  };
  const MIN_SEPARATION = 25;
  /** Below this the colour is a neutral and has no hue to clash with. */
  const CHROMATIC = 0.15;

  it("puts the verdict hues where the spec says they are", () => {
    expect(VERDICT_HUES.pass).toBeGreaterThan(130); // green
    expect(VERDICT_HUES.pass).toBeLessThan(170);
    expect(VERDICT_HUES.watch).toBeGreaterThan(25); // amber
    expect(VERDICT_HUES.watch).toBeLessThan(50);
    expect(VERDICT_HUES.fail).toBeLessThan(15); // red
  });

  it.each(Object.entries(tokens.category))(
    "category.%s stays clear of every verdict band",
    (name, hex) => {
      if (saturation(hex) < CHROMATIC) return;
      for (const [verdict, verdictHue] of Object.entries(VERDICT_HUES)) {
        expect(
          hueDistance(hue(hex), verdictHue),
          `category.${name} vs ${verdict}`,
        ).toBeGreaterThanOrEqual(MIN_SEPARATION);
      }
    },
  );

  it("keeps the chromatic categories separable from each other", () => {
    const chromatic = Object.values(tokens.category)
      .filter((hex) => saturation(hex) >= CHROMATIC)
      .map(hue);
    expect(chromatic.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < chromatic.length; i += 1) {
      for (let j = i + 1; j < chromatic.length; j += 1) {
        expect(hueDistance(chromatic[i], chromatic[j])).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("retires magenta, including as a category", () => {
    // The old brand hue was 322°. Nothing in Ledger may sit in that band —
    // the spec retires it completely, not just as the Answer-quality hue.
    for (const hex of Object.values(tokens.category)) {
      if (saturation(hex) < CHROMATIC) continue;
      expect(hueDistance(hue(hex), 322)).toBeGreaterThanOrEqual(20);
    }
  });

  it("gives every span type a distinct fill", () => {
    const fills = Object.values(tokens.spanTypes);
    expect(new Set(fills).size).toBe(fills.length);
  });
});

describe("measured ratios match the approved design spec", () => {
  // Exact values from docs/design/2026-08-10-ledger-design-system.md, all
  // against `paper`. A change here means the palette moved — update the
  // spec, don't loosen the test.
  const EXPECTED: Array<[string, string, number]> = [
    ["ink", tokens.ink, 16.74],
    ["ink2", tokens.ink2, 8.57],
    ["dim", tokens.dim, 5.08],
    ["link", tokens.link, 6.67],
    ["status.pass", tokens.status.pass, 5.0],
    ["status.watch", tokens.status.watch, 5.57],
    ["status.fail", tokens.status.fail, 6.15],
    ["category.teal", tokens.category.teal, 6.29],
    ["category.blue", tokens.category.blue, 6.26],
    ["category.violet", tokens.category.violet, 6.43],
    ["category.plum", tokens.category.plum, 6.34],
  ];

  it.each(EXPECTED)("%s measures %#s against paper", (_name, hex, expected) => {
    expect(contrastRatio(hex, tokens.paper)).toBeCloseTo(expected as number, 1);
  });
});

describe("filled-chip label contrast", () => {
  // MUI's filled Chip/Button render palette.<tone>.main as the background
  // and contrastText as the label. palette.ts sets contrastText to onFill on
  // every one of these, so each pairing is real and must clear the body floor.
  const FILLED: Array<[string, string]> = [
    ["success", tokens.status.pass],
    ["error", tokens.status.fail],
    ["warning", tokens.status.watch],
    ["primary", tokens.link],
  ];

  it.each(FILLED)("onFill on %s.main clears 4.5:1", (_tone, background) => {
    expect(contrastRatio(tokens.onFill, background)).toBeGreaterThanOrEqual(
      BODY_FLOOR,
    );
  });
});

describe("font stacks are valid CSS", () => {
  // `Source Serif 4 Variable` unquoted is invalid: a CSS font family is a
  // sequence of identifiers and an identifier may not begin with a digit, so
  // the browser drops the whole declaration. The heading then renders at the
  // correct size, weight and tracking in the wrong face, silently — there is
  // no console warning. This test is the only thing that catches it.
  const STACKS: Array<[string, string]> = [
    ["serif", FONT_SERIF],
    ["sans", FONT_SANS],
    ["mono", FONT_MONO],
  ];

  it.each(STACKS)("every %s family that needs quoting has it", (_name, stack) => {
    for (const family of stack.split(",").map((f) => f.trim())) {
      if (family.startsWith('"')) {
        expect(family.endsWith('"')).toBe(true);
        continue;
      }
      // Unquoted: every space-separated identifier must start with a letter,
      // an underscore or a hyphen — never a digit.
      for (const ident of family.split(/\s+/)) {
        expect(/^[A-Za-z_-]/.test(ident), `"${ident}" in ${family}`).toBe(true);
      }
    }
  });

  it("names each of the three faces exactly once, in its own stack", () => {
    expect(FONT_SERIF).toContain("Source Serif 4 Variable");
    expect(FONT_SANS).toContain("Inter Variable");
    expect(FONT_MONO).toContain("JetBrains Mono Variable");
    // A stack that ends in the wrong generic degrades to the wrong shape.
    expect(FONT_SERIF.endsWith("serif")).toBe(true);
    expect(FONT_SANS.endsWith("sans-serif")).toBe(true);
    expect(FONT_MONO.endsWith("monospace")).toBe(true);
  });
});

describe("the compatibility layer holds Ledger values, not dark ones", () => {
  // These aliases exist only until the last consumer migrates. While they
  // exist they must be light — a stray dark hex reaching a page through an
  // alias is exactly the regression this suite is here to prevent.
  it("maps every deprecated alias onto a current token", () => {
    expect(tokens.bg).toBe(tokens.paper);
    expect(tokens.surface).toBe(tokens.card);
    expect(tokens.surfaceRaised).toBe(tokens.data);
    expect(tokens.border).toBe(tokens.hair);
    expect(tokens.muted).toBe(tokens.dim);
    expect(tokens.brand.solid).toBe(tokens.link);
    expect(tokens.brand.text).toBe(tokens.link);
  });
});
