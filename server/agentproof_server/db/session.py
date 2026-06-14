"""
Async database session management.

Provides the SQLAlchemy async engine, a session factory, a FastAPI
dependency (``get_db``) that yields a transactional session, and helpers
to create/drop tables (the latter is intended for test setup/teardown).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from agentproof_server.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional session.

    Commits on successful completion of the request handler; rolls back and
    re-raises if the handler raises.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    """Create all tables defined on the declarative ``Base`` metadata."""
    from agentproof_server.db.models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_tables() -> None:
    """Drop all tables (for test teardown)."""
    from agentproof_server.db.models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
