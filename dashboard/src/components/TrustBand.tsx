import { Box } from "@mui/material";
import { tokens, SPACE } from "../theme";
import { provenanceOf, provenanceSentence } from "../lib/provenance";
import { SectionHeading, Figure, FigureRow, NoteBlock, Prose } from "./Ledger";
import type { EvalAnalytics } from "../types";

/**
 * Band 3 — can these numbers be trusted?
 *
 * Replaces the old Measurement Health card, which rendered
 * `75 scored · 15 failed · -6 pending`: a negative count, `degraded` labelled
 * "failed" (the one thing that card existed to prevent), and `scored`
 * undercounting because traces holding both a good measurement and a broken
 * one were counted wholly as degraded.
 *
 * Three questions, in the order a sceptic asks them: how much of the corpus
 * was measured at all, what kind of numbers are these, and what did the
 * measurement itself get wrong.
 *
 * Every figure here is neutral ink — never red, amber or green. This band
 * reports on the *harness*, not on the agent, and colouring a harness
 * problem with severity would put it in the same visual language as a
 * finding. The one exception is the provenance note, where the rule marks a
 * statement about the data's standing rather than about a metric.
 */

/**
 * The coverage bar: measured / broken-only / never measured.
 *
 * A bar rather than three numbers because the question is proportion — "how
 * much of this corpus has anything been said about" — and because the three
 * segments provably fill it: the server computes them as a partition, so a
 * gap in this bar would be a bug rather than a rounding artefact.
 */
function CoverageBar({
  scored,
  unmeasurable,
  pending,
  traces,
}: {
  scored: number;
  unmeasurable: number;
  pending: number;
  traces: number;
}) {
  // At full coverage every segment but the first is zero-width, so the bar
  // renders as one solid slab — indistinguishable from a divider or a
  // scrollbar, and carrying no information a reader could act on. A chart
  // with nothing to compare is chrome.
  if (traces === 0 || unmeasurable + pending === 0) return null;
  const pct = (n: number) => `${(n / traces) * 100}%`;

  return (
    <Box
      data-testid="coverage-bar"
      role="img"
      aria-label={`${scored} of ${traces} traces measured, ${unmeasurable} unmeasurable, ${pending} never evaluated`}
      sx={{
        display: "flex",
        height: 6,
        borderRadius: "2px",
        overflow: "hidden",
        // The track is the unmeasured remainder, so it has to be visible
        // against the panel rather than the page.
        bgcolor: tokens.hair,
        mt: `${SPACE.sm}px`,
      }}
    >
      <Box sx={{ width: pct(scored), bgcolor: tokens.steel }} />
      <Box
        sx={{
          width: pct(unmeasurable),
          // Hatched rather than filled: "we tried and it broke" is not a
          // quantity of the same kind as "we measured it".
          backgroundImage: `repeating-linear-gradient(45deg, ${tokens.steel} 0 2px, transparent 2px 5px)`,
        }}
      />
      <Box sx={{ width: pct(pending) }} />
    </Box>
  );
}

export function TrustBand({ analytics }: { analytics: EvalAnalytics | undefined }) {
  const totals = analytics?.totals;
  const traces = totals?.traces ?? 0;
  const scored = totals?.scored ?? 0;
  const unmeasurable = totals?.unmeasurable ?? 0;
  const pending = totals?.pending ?? 0;
  const degradedTraces = totals?.degraded_traces ?? 0;

  const metrics = analytics?.metric_health ?? [];
  const unexercised = metrics.filter((m) => !m.has_variance);
  // Kept from the deleted gate card. "No baseline" is not a null state — it
  // is the reason the page cannot make any claim about change, and that
  // belongs with the other limits on what these numbers can support.
  const comparable = (analytics?.gate ?? []).filter((g) => g.comparable).length;
  const generated = analytics?.generated ?? false;
  const provenance = provenanceOf({ metrics, generated });

  return (
    <Box component="section" aria-label="What you can trust" data-testid="trust-band">
      <SectionHeading>What you can trust</SectionHeading>

      <FigureRow>
        <Figure
          value={`${scored} of ${traces}`}
          label="traces measured"
          note={
            pending > 0
              ? `${pending} never evaluated — not passing, unmeasured`
              : "every trace in this window has been evaluated"
          }
        />
        <Figure
          value={String(degradedTraces)}
          label={`${degradedTraces === 1 ? "trace" : "traces"} with a broken measurement`}
          note={
            degradedTraces > 0
              ? "a judge call errored or refused — excluded, never counted as a failure"
              : "no judge call errored or refused"
          }
        />
        <Figure
          value={`${unexercised.length} of ${metrics.length}`}
          label="metrics never moved"
          note={
            unexercised.length > 0
              ? "nothing stressed them — unexercised, not proven"
              : "every metric varied in this window"
          }
        />
        <Figure
          value={comparable > 0 ? `${comparable} of ${metrics.length}` : "None"}
          label="metrics have a baseline"
          note={
            comparable > 0
              ? "the rest can report a state, but not a change"
              : "nothing is pinned, so no regression verdict is possible"
          }
        />
      </FigureRow>

      <CoverageBar
        scored={scored}
        unmeasurable={unmeasurable}
        pending={pending}
        traces={traces}
      />

      {/* A generated corpus gets a ruled note rather than a footnote: the
        * disclosure is load-bearing when the view points at fabricated data,
        * and a footnote is what people skip. When the data is real the same
        * sentence is a quiet statement of provenance and reads as one. */}
      {generated ? (
        <NoteBlock
          tone="watch"
          data-testid="provenance-sentence"
          sx={{ mt: `${SPACE.md}px`, maxWidth: "82ch" }}
        >
          {provenanceSentence(provenance)}
        </NoteBlock>
      ) : (
        <Prose
          data-testid="provenance-sentence"
          sx={{ mt: `${SPACE.md}px`, fontSize: 14.5, color: tokens.dim, maxWidth: "82ch" }}
        >
          {provenanceSentence(provenance)}
        </Prose>
      )}
    </Box>
  );
}
