"""
AgentProof client — the main entry point for SDK users.

Usage:
    from agentproof import AgentProof, SpanType

    ap = AgentProof(server_url="http://localhost:8000", project="my-agent")

    with ap.trace("research-task") as t:
        with t.span("search", span_type=SpanType.RETRIEVAL) as s:
            ...
"""

from __future__ import annotations

import atexit
import functools
import inspect
import logging
from collections.abc import Callable
from typing import Any

from agentproof.context import TraceContext
from agentproof.exporters import AsyncExporter
from agentproof.spans import SpanType

logger = logging.getLogger("agentproof")


class AgentProof:
    """Main SDK client.

    Initializes the async exporter and provides the ``trace()`` context
    manager and ``trace_function()`` decorator for instrumentation.
    """

    def __init__(
        self,
        server_url: str = "http://localhost:8000",
        project: str = "default",
        api_key: str | None = None,
    ) -> None:
        self._server_url = server_url
        self._project = project
        self._exporter = AsyncExporter(server_url=server_url, api_key=api_key)

        # Flush buffered traces on interpreter exit.
        atexit.register(self._exporter.shutdown)

        logger.info(
            "AgentProof initialized — project='%s', server='%s'",
            project,
            server_url,
        )

    def trace(
        self,
        name: str,
        tags: dict[str, str] | None = None,
    ) -> TraceContext:
        """Create a new trace context manager.

        Usage:
            with ap.trace("my-run") as t:
                with t.span("step1", SpanType.LLM_CALL) as s:
                    ...
        """
        return TraceContext(
            name=name,
            project=self._project,
            exporter=self._exporter,
            tags=tags,
        )

    def trace_function(
        self,
        span_type: SpanType,
        name: str | None = None,
    ) -> Callable:
        """Decorator that wraps a function in a single-span trace.

        The wrapped function may accept a ``_span`` keyword argument to record
        type-specific metadata. If it doesn't, the span captures timing only.

        Usage:
            @ap.trace_function(SpanType.TOOL_USE, name="web-search")
            def search(query: str, _span=None):
                results = do_search(query)
                if _span:
                    _span.record_tool_use(
                        tool_name="web_search",
                        tool_input={"query": query},
                        tool_output=results,
                    )
                return results
        """

        def decorator(fn: Callable) -> Callable:
            # Inspect the real signature (not co_varnames, which also includes
            # local variables) to decide whether to inject the span handle.
            try:
                wants_span = "_span" in inspect.signature(fn).parameters
            except (TypeError, ValueError):
                wants_span = False

            @functools.wraps(fn)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                fn_name = name or fn.__name__
                with self.trace(fn_name) as t:
                    span = t.span(fn_name, span_type)
                    with span:
                        if wants_span:
                            kwargs["_span"] = span
                        result = fn(*args, **kwargs)
                        # Ensure a span is always recordable even if the
                        # function didn't call a record_* method itself.
                        if span._metadata is None and span_type == SpanType.TOOL_USE:
                            span.record_tool_use(
                                tool_name=fn_name,
                                tool_input={
                                    "args": [repr(a) for a in args],
                                    "kwargs": {k: repr(v) for k, v in kwargs.items() if k != "_span"},
                                },
                                tool_output=repr(result),
                            )
                        return result

            return wrapper

        return decorator

    @property
    def stats(self) -> dict:
        """Exporter stats (sent / dropped / buffered) for debugging."""
        return self._exporter.stats

    def shutdown(self) -> None:
        """Flush and stop the background exporter."""
        self._exporter.shutdown()
