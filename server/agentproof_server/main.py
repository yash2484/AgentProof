"""
FastAPI application entrypoint for the AgentProof server.

Wires up CORS, the lifespan (which creates tables on startup), a health
check, and the trace-storage API router under ``/api/v1``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentproof_server.api.evals import router as evals_router
from agentproof_server.api.traces import router as traces_router
from agentproof_server.config import settings
from agentproof_server.db.session import create_tables

logger = logging.getLogger("agentproof_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup, log shutdown."""
    logger.info("Starting %s — initializing database...", settings.project_name)
    await create_tables()
    logger.info("Database ready.")
    yield
    logger.info("Shutting down %s.", settings.project_name)


app = FastAPI(
    title=settings.project_name,
    description="Eval, observability, and security harness for multi-agent systems",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    """Liveness/readiness probe."""
    return {"status": "ok", "version": "0.1.0"}


app.include_router(traces_router, prefix="/api/v1", tags=["traces"])
app.include_router(evals_router, prefix="/api/v1", tags=["evals"])
