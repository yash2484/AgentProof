"""
Async trace exporter.

Design:
- Traces are enqueued into a thread-safe buffer (queue.Queue).
- A background daemon thread flushes the buffer periodically (every
  FLUSH_INTERVAL_SEC) or when it reaches BATCH_SIZE, whichever comes first.
- If the server is unreachable, the batch is retried with exponential backoff.
- If the buffer overflows (MAX_BUFFER_SIZE), the oldest trace is dropped and
  a counter is incremented so data-loss is observable.
- The agent NEVER blocks waiting for export.

This is fire-and-forget by design: losing a trace is acceptable; slowing
down the agent is not.
"""

from __future__ import annotations

import logging
import queue
import threading

import httpx

from agentproof.spans import Trace

logger = logging.getLogger("agentproof.exporter")


class AsyncExporter:
    """Background exporter that ships traces to the AgentProof server."""

    FLUSH_INTERVAL_SEC = 5.0
    BATCH_SIZE = 10
    MAX_BUFFER_SIZE = 500
    MAX_RETRIES = 3
    RETRY_BACKOFF_SEC = 1.0
    REQUEST_TIMEOUT_SEC = 10.0

    def __init__(self, server_url: str, api_key: str | None = None) -> None:
        self._server_url = server_url.rstrip("/")
        self._api_key = api_key
        self._buffer: queue.Queue[Trace] = queue.Queue(maxsize=self.MAX_BUFFER_SIZE)
        self._dropped_count = 0
        self._sent_count = 0
        self._shutdown = threading.Event()

        self._thread = threading.Thread(
            target=self._flush_loop,
            daemon=True,  # Dies when the main thread exits.
            name="agentproof-exporter",
        )
        self._thread.start()

    # -- public API ---------------------------------------------------------

    def enqueue(self, trace: Trace) -> None:
        """Add a trace to the export buffer. Non-blocking.

        If the buffer is full, the oldest trace is dropped to make room.
        """
        try:
            self._buffer.put_nowait(trace)
        except queue.Full:
            try:
                self._buffer.get_nowait()
                self._dropped_count += 1
                logger.warning(
                    "Export buffer full — dropped oldest trace. Total dropped: %d",
                    self._dropped_count,
                )
                self._buffer.put_nowait(trace)
            except queue.Empty:  # pragma: no cover - race only
                pass

    def shutdown(self, timeout: float = 10.0) -> None:
        """Signal the flush thread to stop and flush any remaining traces.

        Idempotent: safe to call explicitly and again via the atexit hook.
        """
        if self._shutdown.is_set():
            return
        self._shutdown.set()
        if self._thread.is_alive():
            self._thread.join(timeout=timeout)
        # One last drain in case the thread already exited.
        self._flush_batch()

    @property
    def stats(self) -> dict:
        return {
            "sent": self._sent_count,
            "dropped": self._dropped_count,
            "buffered": self._buffer.qsize(),
        }

    # -- internals ----------------------------------------------------------

    def _flush_loop(self) -> None:
        while not self._shutdown.is_set():
            self._flush_batch()
            self._shutdown.wait(timeout=self.FLUSH_INTERVAL_SEC)
        # Final flush on shutdown.
        self._flush_batch()

    def _flush_batch(self) -> None:
        batch: list[Trace] = []
        while len(batch) < self.BATCH_SIZE:
            try:
                batch.append(self._buffer.get_nowait())
            except queue.Empty:
                break

        if not batch:
            return

        payload = [trace.model_dump(mode="json") for trace in batch]
        if self._send_with_retry(payload):
            self._sent_count += len(batch)
        else:
            # Drop on permanent failure rather than re-buffer. _send_with_retry
            # already exhausted MAX_RETRIES with backoff; re-buffering would
            # churn the queue and displace fresh traces indefinitely while the
            # server is down. Fire-and-forget: losing traces is acceptable.
            self._dropped_count += len(batch)
            logger.error(
                "Dropped %d traces after failed export. Total dropped: %d",
                len(batch),
                self._dropped_count,
            )

    def _send_with_retry(self, payload: list[dict]) -> bool:
        url = f"{self._server_url}/api/v1/traces/batch"
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        for attempt in range(self.MAX_RETRIES):
            try:
                with httpx.Client(timeout=self.REQUEST_TIMEOUT_SEC) as client:
                    response = client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                logger.debug("Exported %d traces successfully", len(payload))
                return True
            except (httpx.HTTPError, httpx.ConnectError) as exc:
                wait = self.RETRY_BACKOFF_SEC * (2**attempt)
                logger.warning(
                    "Export attempt %d/%d failed: %s. Retrying in %ss...",
                    attempt + 1,
                    self.MAX_RETRIES,
                    exc,
                    wait,
                )
                if self._shutdown.wait(timeout=wait):
                    break
        logger.error("Failed to export %d traces after retries.", len(payload))
        return False
