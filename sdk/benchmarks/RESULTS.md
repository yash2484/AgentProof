# Instrumentation overhead

Measured, not estimated. Reproduce with:

```bash
python sdk/benchmarks/bench_instrumentation.py
```

## Environment

| | |
|---|---|
| Python | 3.11.9 (CPython) |
| Platform | Windows 10.0.26200 |
| CPU | Intel64 Family 6 Model 154 Stepping 4 (12th-gen mobile) |
| Date | 2026-08-08 |
| Warmup / iterations | 1,000 / 10,000 (1,000 for full-trace) |

## Results

All figures in **microseconds**. 1,000 µs = 1 ms.

| Operation | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| `enqueue` — normal, buffer not full | 10,000 | **1.4 µs** | 3.0 µs | **4.8 µs** | 49.2 µs |
| `enqueue` — buffer full, drops oldest | 10,000 | 4.8 µs | 7.9 µs | 12.2 µs | 120.2 µs |
| `span` — open + close, one span | 10,000 | **6.9 µs** | 15.9 µs | **23.5 µs** | 203.6 µs |
| full trace — 4 spans, built and enqueued | 1,000 | **35.3 µs** | 64.5 µs | **112.3 µs** | 252.2 µs |

**A fully instrumented 4-span agent run costs 35 µs at p50 and 112 µs at p99** —
roughly 0.1 ms against LLM calls that take hundreds of milliseconds to seconds.

## What is and isn't measured

**Measured:** everything on the caller's thread — span construction, metadata
validation, trace assembly, and the handoff to the export buffer.

**Not measured:** the network export. It runs on a background daemon thread and
never blocks the caller, which is the design's entire point. Timing it would
report the speed of the server and the network, not the SDK.

The exporter's target is an unroutable address (`127.0.0.1:1`) so no HTTP
succeeds and nothing off-thread contaminates the caller-side numbers. Spans and
traces are benchmarked against a null sink for the same reason.

## Notes on reading these

- **Percentiles, not means.** A mean hides the tail, and the tail is what stalls
  an agent. p99 is the number that matters.
- **Single run on a laptop.** p50 is stable across runs; p99 and max move
  meaningfully with background load — an earlier run put span p99 at 15.5 µs
  against 23.5 µs here. Treat p99 as an order of magnitude, not a constant.
- **The full-buffer row is the degraded path**, not a failure. When the buffer
  hits `MAX_BUFFER_SIZE` (500) the oldest trace is dropped to make room so the
  agent still never blocks; that path does a get, a put, a counter bump and a
  log call, costing ~3x the normal enqueue. Losing a trace is acceptable;
  slowing the agent is not.

## Known follow-up

Under sustained backpressure the exporter emits one `logger.warning` per dropped
trace. That is most of the full-buffer path's extra cost and would be noisy in
production — rate-limiting it, or counting drops and logging periodically, is
the obvious fix.
