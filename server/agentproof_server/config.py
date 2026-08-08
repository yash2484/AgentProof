"""
Application configuration for the AgentProof server.

Settings are loaded from environment variables (and an optional ``.env``
file) via pydantic-settings. A module-level ``settings`` singleton is
provided for convenient import throughout the server package.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode

# The repo-root ``.env``, resolved from this file rather than the working
# directory. The eval CLI is run from ``server/`` (that is what CI does), and a
# CWD-relative ``.env`` is simply not found from there -- which silently costs
# you the API key and scores every judge metric 0.0 for no visible reason.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Server configuration, populated from the environment / ``.env``."""

    database_url: str = (
        "postgresql+asyncpg://agentproof:agentproof@localhost:5432/agentproof"
    )
    database_url_sync: str = (
        "postgresql://agentproof:agentproof@localhost:5432/agentproof"
    )
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    project_name: str = "AgentProof"
    # Path to the active eval config, resolved relative to the repo root.
    eval_config_path: str = "agentproof.yaml"
    # NoDecode: skip pydantic-settings' JSON decoding so the validator below
    # can accept a comma-separated string from ``.env``.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    model_config = {
        # Repo root first, then a CWD-local .env so a local one still wins.
        "env_file": (_REPO_ROOT_ENV, ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        """Allow CORS origins to be given as a comma-separated string.

        pydantic-settings expects JSON for ``list`` fields, but ``.env``
        files commonly use ``a,b,c``. Accept either form.
        """
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped.startswith("["):
                return [o.strip() for o in stripped.split(",") if o.strip()]
        return value


settings = Settings()
