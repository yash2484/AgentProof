"""Measure what instrumenting an agent with AgentProof actually costs.

Run:  python sdk/benchmarks/bench_instrumentation.py

Instrumentation overhead is a buying objection for observability tooling, so
this exists to answer it with numbers rather than adjectives. Three things get
measured, because they are three different claims:

1. ``enqueue`` -- handing a finished trace to the exporter. This is the
   "fire-and-forget async exporter" claim: the agent must not wait on export.
2. ``span``    -- opening and closing one instrumented span. This is what an
   agent pays per LLM call or tool use.
3. ``trace``   -- a whole 4-span trace, built and enqueued, end to end.

What is NOT measured: the network export itself. That happens on a background
daemon thread and never blocks the caller, which is the entire point -- timing
it would measure the server and the network, not the SDK. A NullExporter is
used for (2) and (3) so no HTTP or disk work contaminates the numbers.

Percentiles, not means: a mean hides the tail, and the tail is what stalls an
agent. p99 is the number that matters.
"""

from __future__ import annotations

import logging
import platform
import statistics
import sys
import time
from pathlib import Path

# The full-buffer path logs a warning per dropped trace. Silence it so the
# console stays readable; the emit cost is still paid and still measured.
logging.getLogger("agentproof.exporter").setLevel(logging.CRITICAL)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agentproof.client import AgentProof  # noqa: E402
from agentproof.exporters import AsyncExporter  # noqa: E402
from agentproof.spans import SpanType, Trace  # noqa: E402

WARMUP = 1_000
ITERATIONS = 10_000

# Unroutable by design: the exporter thread must never actually connect. Its
# failures are irrelevant here because export happens off the caller's thread.
_DEAD_URL = "http://127.0.0.1:1"


class NullExporter:
    """Duck-typed sink that does nothing, so we time the SDK and not the sink."""

    def __init__(self) -> None:
        self.count = 0

    def enqueue(self, trace) -> None:  # noqa: ANN001
        self.count += 1

    def shutdown(self, timeout: float = 10.0) -> None:
        pass

    @property
    def stats(self) -> dict:
        return {"sent": self.count, "dropped": 0, "buffered": 0}


def _percentiles(samples_ns: list[int]) -> dict[str, float]:
    ordered = sorted(samples_ns)
    n = len(ordered)

    def pick(p: float) -> float:
        # Nearest-rank; index clamped so p100 is the max, not an overflow.
        return ordered[min(int(p / 100 * n), n - 1)] / 1_000  # ns -> microseconds

    return {
        "p50": pick(50),
        "p95": pick(95),
        "p99": pick(99),
        "max": ordered[-1] / 1_000,
        "mean": statistics.fmean(ordered) / 1_000,
    }


def bench_enqueue() -> dict[str, float]:
    """Cost of handing a finished trace to the real AsyncExporter.

    Measured below MAX_BUFFER_SIZE, which is the normal case: the flush thread
    drains faster than an agent produces. Sampled in chunks against a fresh
    exporter so the buffer never fills -- a full buffer takes a different code
    path entirely, measured separately by :func:`bench_enqueue_full_buffer`.
    """
    chunk = AsyncExporter.MAX_BUFFER_SIZE - 100  # stay clear of the full path
    trace = Trace(name="bench", project="bench")

    warm = AsyncExporter(server_url=_DEAD_URL)
    for _ in range(min(WARMUP, chunk)):
        warm.enqueue(trace)

    samples: list[int] = []
    while len(samples) < ITERATIONS:
        exporter = AsyncExporter(server_url=_DEAD_URL)  # excluded from timing
        for _ in range(min(chunk, ITERATIONS - len(samples))):
            start = time.perf_counter_ns()
            exporter.enqueue(trace)
            samples.append(time.perf_counter_ns() - start)

    # Deliberately not shut down: a clean shutdown would POST to a dead port and
    # burn the retry backoff. These are daemon threads; they die with the process.
    return _percentiles(samples)


def bench_enqueue_full_buffer() -> dict[str, float]:
    """Cost of enqueueing when the buffer is already full (backpressure).

    The agent still never blocks -- the oldest trace is dropped to make room --
    but the path does more work: a get, a put, and a counter. Worth publishing
    next to the normal number so the degraded case is not a surprise.
    """
    exporter = AsyncExporter(server_url=_DEAD_URL)
    trace = Trace(name="bench", project="bench")

    for _ in range(AsyncExporter.MAX_BUFFER_SIZE + 50):  # fill it
        exporter.enqueue(trace)

    samples: list[int] = []
    for _ in range(ITERATIONS):
        start = time.perf_counter_ns()
        exporter.enqueue(trace)
        samples.append(time.perf_counter_ns() - start)
    return _percentiles(samples)


def bench_span() -> dict[str, float]:
    """Cost of one instrumented span: open, record metadata, close."""
    ap = AgentProof(project="bench", exporter=NullExporter())

    with ap.trace("warmup") as t:
        for _ in range(WARMUP):
            with t.span("step", SpanType.LLM_CALL):
                pass

    samples: list[int] = []
    with ap.trace("bench") as t:
        for _ in range(ITERATIONS):
            start = time.perf_counter_ns()
            with t.span("step", SpanType.LLM_CALL):
                pass
            samples.append(time.perf_counter_ns() - start)
    return _percentiles(samples)


def bench_full_trace() -> dict[str, float]:
    """Cost of a whole 4-span trace, built and enqueued end to end."""
    ap = AgentProof(project="bench", exporter=NullExporter())

    def one() -> None:
        with ap.trace("run") as t:
            for name in ("planner", "retriever", "writer", "fact_checker"):
                with t.span(name, SpanType.LLM_CALL):
                    pass

    for _ in range(WARMUP // 10):
        one()

    samples: list[int] = []
    for _ in range(ITERATIONS // 10):
        start = time.perf_counter_ns()
        one()
        samples.append(time.perf_counter_ns() - start)
    return _percentiles(samples)


def main() -> int:
    print("AgentProof instrumentation benchmark")
    print(f"  python   {platform.python_version()} ({platform.python_implementation()})")
    print(f"  platform {platform.platform()}")
    print(f"  cpu      {platform.processor() or 'unknown'}")
    print(f"  warmup   {WARMUP:,} | iterations {ITERATIONS:,}")
    print()

    results = [
        ("enqueue (normal, buffer not full)", ITERATIONS, bench_enqueue()),
        ("enqueue (buffer full, drops oldest)", ITERATIONS, bench_enqueue_full_buffer()),
        ("span (open + close, 1 span)", ITERATIONS, bench_span()),
        ("full trace (4 spans + enqueue)", ITERATIONS // 10, bench_full_trace()),
    ]

    header = f"{'operation':<36}{'n':>8}{'p50':>10}{'p95':>10}{'p99':>10}{'max':>10}"
    print(header)
    print("-" * len(header))
    for label, n, r in results:
        print(
            f"{label:<36}{n:>8,}"
            f"{r['p50']:>9.2f}µ{r['p95']:>9.2f}µ{r['p99']:>9.2f}µ{r['max']:>9.2f}µ"
        )
    print()
    print("All figures in microseconds (µs). 1,000 µs = 1 ms.")
    print("Network export is excluded by design: it runs on a background daemon")
    print("thread and never blocks the caller.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
