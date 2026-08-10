import { tokens } from "../theme";
import { Figure } from "./Ledger";

export type Tone = "neutral" | "pass" | "fail" | "warn";

/** The one tone->colour map. Imported by anything that renders a verdict. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: tokens.ink,
  pass: tokens.status.pass,
  fail: tokens.status.fail,
  warn: tokens.status.watch,
};

const FIGURE_TONE = {
  neutral: "neutral",
  pass: "pass",
  fail: "fail",
  warn: "watch",
} as const;

/**
 * One figure and its label.
 *
 * Ledger has no bento tiles: this no longer draws its own box, because the
 * panel it sits in is what says the figure was measured. Drawing a border
 * here as well produced the nested-card look the redesign exists to remove.
 * Put these inside a `FigureRow`.
 */
export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: Tone;
}) {
  return (
    <Figure
      label={label}
      value={value}
      note={sublabel}
      tone={FIGURE_TONE[tone]}
      data-testid="stat-tile"
      valueTestId="stat-tile-value"
      noteTestId="stat-tile-sublabel"
    />
  );
}
