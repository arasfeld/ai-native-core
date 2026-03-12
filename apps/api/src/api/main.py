from contextlib import asynccontextmanager

import asyncpg
import structlog
from ai import get_llm
from arq.connections import RedisSettings
from arq.connections import create_pool as arq_create_pool
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from memory import EpisodicStore, MemoryExtractor, SessionStore, SummaryCompressor
from rag import PgVectorRetriever

from .config import settings
from .logging import configure_logging
from .routers import auth, billing, chat, health, ingest, jobs

configure_logging(
    json_logs=settings.log_format == "json",
    log_level=settings.log_level,
)
log = structlog.get_logger()

_CREATE_TENANTS = """
CREATE TABLE IF NOT EXISTS tenants (
    id                      BIGSERIAL   PRIMARY KEY,
    name                    TEXT        NOT NULL,
    plan                    TEXT        NOT NULL DEFAULT 'free',
    token_limit             INTEGER     NOT NULL DEFAULT 100000,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL   PRIMARY KEY,
    tenant_id   BIGINT      NOT NULL REFERENCES tenants(id),
    email       TEXT        NOT NULL UNIQUE,
    password    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(settings.database_url)

    # Ensure all tables exist (order matters for FK constraints)
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TENANTS)
        await conn.execute(_CREATE_USERS)

    store = SessionStore(pool=pool)
    await store.ensure_table()

    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm, embedding_dim=settings.embedding_dim)
    await retriever.ensure_table()

    episodic = EpisodicStore(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
    await episodic.ensure_table()

    try:
        arq = await arq_create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.arq = arq
        log.info("api.redis.connected", url=settings.redis_url)
    except Exception as exc:
        app.state.arq = None
        log.warning("api.redis.unavailable", error=str(exc), detail="POST /jobs will return 503")

    app.state.db_pool = pool
    app.state.session_store = store
    app.state.compressor = SummaryCompressor(llm=llm)
    app.state.retriever = retriever
    app.state.episodic = episodic
    app.state.extractor = MemoryExtractor(llm=llm, episodic=episodic)

    log.info("api.startup", provider=settings.llm_provider, port=settings.port)
    yield

    await arq.close()
    await pool.close()
    log.info("api.shutdown")


app = FastAPI(
    title="AI Native Core API",
    version="0.1.0",
    description="FastAPI AI orchestration server with LangGraph agents",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(billing.router)
