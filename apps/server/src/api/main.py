from contextlib import asynccontextmanager

import asyncpg
import sentry_sdk
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
from .middleware.rate_limit import RateLimitMiddleware
from .rbac import seed_rbac
from .repositories.session_repository import SessionRepository
from .routers import (
    admin,
    admin_analytics,
    admin_evals,
    admin_tenants,
    admin_users,
    audit_logs,
    auth,
    billing,
    chat,
    conversations,
    documents,
    feedback,
    health,
    ingest,
    jobs,
    media,
    notifications,
    organizations,
    preferences,
    rbac,
    referrals,
    user_api_keys,
)
from .services.chat_service import ChatService
from .services.context_service import ContextService

configure_logging(
    json_logs=settings.log_format == "json",
    log_level=settings.log_level,
)
log = structlog.get_logger()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
        send_default_pii=False,
        release=settings.sentry_release,
    )
    log.info("sentry.initialized", environment=settings.sentry_environment)

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

_CREATE_CONVERSATIONS = """
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
"""

_CREATE_USER_API_KEYS = """
CREATE TABLE IF NOT EXISTS user_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  key_prefix   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash);
"""

_CREATE_NOTIFICATIONS = """
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_80_at  TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS budget_warned_100_at TIMESTAMPTZ;
"""

_CREATE_ORGANIZATIONS = """
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_token TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS organization_members (
  org_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  invited_by TEXT        REFERENCES "user"(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS organization_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member',
  token       TEXT        NOT NULL UNIQUE,
  invited_by  TEXT        NOT NULL REFERENCES "user"(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invites_token_idx ON organization_invites(token);
"""

_CREATE_USER_PREFERENCES = """
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id             TEXT        PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  system_instructions TEXT        NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS system_instructions TEXT NOT NULL DEFAULT '';
"""

_CREATE_AUDIT_LOGS = """
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      TEXT        REFERENCES "user"(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
"""

_CREATE_REFERRALS = """
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS referral_bonus_tokens INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referrals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id  TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  referred_user_id  TEXT        UNIQUE REFERENCES "user"(id) ON DELETE SET NULL,
  code              TEXT        NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ,
  bonus_granted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx     ON referrals (code);
"""

_CREATE_MESSAGE_FEEDBACK = """
CREATE TABLE IF NOT EXISTS message_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID        NOT NULL,
  session_id  TEXT        NOT NULL,
  tenant_id   TEXT        NOT NULL,
  user_id     TEXT,
  rating      SMALLINT    NOT NULL CHECK (rating IN (-1, 1)),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS message_feedback_run_id_idx          ON message_feedback (run_id);
CREATE INDEX IF NOT EXISTS message_feedback_tenant_created_idx  ON message_feedback (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS message_feedback_session_idx         ON message_feedback (session_id);
"""

_CREATE_EVAL_RUNS = """
CREATE TABLE IF NOT EXISTS eval_runs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_sha         TEXT         NOT NULL,
  branch             TEXT,
  category           TEXT         NOT NULL,
  scorer             TEXT         NOT NULL,
  pass_count         INTEGER      NOT NULL,
  total_count        INTEGER      NOT NULL,
  score              NUMERIC(5,4) NOT NULL,
  threshold          NUMERIC(5,4),
  langsmith_run_url  TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS eval_runs_category_created_idx ON eval_runs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS eval_runs_scorer_created_idx   ON eval_runs (scorer, created_at DESC);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(settings.database_url)

    # Ensure all tables exist (order matters for FK constraints)
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TENANTS)
        await conn.execute(_CREATE_RBAC)
        await conn.execute(_CREATE_CONVERSATIONS)
        await conn.execute(_CREATE_USER_API_KEYS)
        await conn.execute(_CREATE_NOTIFICATIONS)
        await conn.execute(_CREATE_ORGANIZATIONS)
        await conn.execute(_CREATE_USER_PREFERENCES)
        await conn.execute(_CREATE_AUDIT_LOGS)
        await conn.execute(_CREATE_REFERRALS)
        await conn.execute(_CREATE_MESSAGE_FEEDBACK)
        await conn.execute(_CREATE_EVAL_RUNS)

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
    app.state.retriever = retriever  # still used by ingest router

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
app.add_middleware(RateLimitMiddleware)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(billing.router)
app.include_router(media.router)
app.include_router(admin.router)
app.include_router(admin_users.router)
app.include_router(admin_tenants.router)
app.include_router(admin_analytics.router)
app.include_router(rbac.router)
app.include_router(conversations.router)
app.include_router(user_api_keys.router)
app.include_router(notifications.router)
app.include_router(organizations.router)
app.include_router(preferences.router)
app.include_router(audit_logs.router)
app.include_router(referrals.router)
app.include_router(feedback.router)
app.include_router(admin_evals.router)
app.include_router(documents.router)
