"""AgentProof SDK — instrument, evaluate, and secure your multi-agent systems."""

from agentproof.client import AgentProof
from agentproof.spans import (
    AgentHandoffMetadata,
    HumanDecisionMetadata,
    LLMCallMetadata,
    RetrievalMetadata,
    Span,
    SpanStatus,
    SpanType,
    ToolUseMetadata,
    Trace,
)

__all__ = [
    "AgentProof",
    "SpanType",
    "SpanStatus",
    "Span",
    "Trace",
    "LLMCallMetadata",
    "ToolUseMetadata",
    "RetrievalMetadata",
    "AgentHandoffMetadata",
    "HumanDecisionMetadata",
]
__version__ = "0.1.0"
