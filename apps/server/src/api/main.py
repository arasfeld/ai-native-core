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

from .agent_factory import AgentFactory
from .config import settings
from .logging import configure_logging
from .rbac import seed_rbac
from .repositories.session_repository import SessionRepository
from .routers import admin, auth, billing, chat, health, ingest, jobs, media, rbac
from .services.chat_service import ChatService
from .services.context_service import ContextService

configure_logging(
    json_logs=settings.log_format == "json",
    log_level=settings.log_level,
)
log = structlog.get_logger()

_CREATE_TENANTS = """
CREATE TABLE IF NOT EXISTS tenants (
    id                      TEXT        PRIMARY KEY,
    name                    TEXT        NOT NULL,
    plan                    TEXT        NOT NULL DEFAULT 'free',
    token_limit             INTEGER     NOT NULL DEFAULT 100000,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_CREATE_RBAC = """
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS permissions (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_roles_unique UNIQUE NULLS NOT DISTINCT (user_id, role_id, org_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles (user_id);

CREATE TABLE IF NOT EXISTS user_permissions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  org_id        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_permissions_unique UNIQUE NULLS NOT DISTINCT (user_id, permission_id, org_id)
);

CREATE INDEX IF NOT EXISTS user_permissions_user_idx ON user_permissions (user_id);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(settings.database_url)

    # Ensure all tables exist (order matters for FK constraints)
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TENANTS)
        await conn.execute(_CREATE_RBAC)

    # Load runtime AI config from DB (populated by migration 0002)
    try:
        config_rows = await pool.fetch("SELECT * FROM ai_feature_configs")
        ai_config = {
            row["feature"]: {
                "feature": row["feature"],
                "provider": row["provider"],
                "model": row["model"],
                "enabled": row["enabled"],
            }
            for row in config_rows
        }
    except Exception:
        ai_config = {}
    app.state.ai_config = ai_config

    store = SessionStore(pool=pool)
    await store.ensure_table()

    await seed_rbac(pool)

    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
    await retriever.ensure_table()

    episodic = EpisodicStore(llm=llm, pool=pool, embedding_dim=settings.embedding_dim)
    await episodic.ensure_table()

    extractor = MemoryExtractor(llm=llm, episodic=episodic)
    compressor = SummaryCompressor(llm=llm)

    session_repo = SessionRepository(
        store=store, pool=pool, default_limit=settings.session_token_budget
    )
    context_service = ContextService(
        session_repo=session_repo, compressor=compressor, episodic=episodic
    )
    agent_factory = AgentFactory(retriever=retriever, ai_config=ai_config)
    chat_service = ChatService(
        context_service=context_service,
        agent_factory=agent_factory,
        session_repo=session_repo,
        extractor=extractor,
    )

    try:
        arq = await arq_create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.arq = arq
        log.info("api.redis.connected", url=settings.redis_url)
    except Exception as exc:
        app.state.arq = None
        log.warning("api.redis.unavailable", error=str(exc), detail="POST /jobs will return 503")

    app.state.db_pool = pool
    app.state.chat_service = chat_service
    app.state.retriever = retriever   # still used by ingest router

    log.info("api.startup", provider=settings.llm_provider, port=settings.port)
    yield

    if app.state.arq:
        await app.state.arq.close()
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
app.include_router(media.router)
app.include_router(admin.router)
app.include_router(rbac.router)
