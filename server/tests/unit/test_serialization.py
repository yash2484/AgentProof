# server/tests/unit/test_serialization.py
"""Unit tests for the shared trace/span serialization helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from agentproof_server.api.serialization import _parse_dt


def test_parse_dt_handles_none():
    assert _parse_dt(None) is None


def test_parse_dt_passes_through_datetime():
    now = datetime.now(UTC)
    assert _parse_dt(now) is now


def test_parse_dt_parses_iso_string():
    parsed = _parse_dt("2026-06-14T12:00:00+00:00")
    assert parsed.year == 2026 and parsed.month == 6 and parsed.day == 14
