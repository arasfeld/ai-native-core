from contextlib import asynccontextmanager

import asyncpg
import structlog
from ai import get_llm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from memory import SessionStore, SummaryCompressor, TokenBudget
from rag import PgVectorRetriever

from .config import settings
from .logging import configure_logging
from .routers import chat, health, ingest

configure_logging(
    json_logs=settings.log_format == "json",
    log_level=settings.log_level,
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(settings.database_url)
    store = SessionStore(pool=pool)
    await store.ensure_table()

    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm, embedding_dim=settings.embedding_dim)
    await retriever.ensure_table()

    app.state.session_store = store
    app.state.compressor = SummaryCompressor(llm=llm)
    app.state.budget = TokenBudget(store, limit=settings.session_token_budget)
    app.state.retriever = retriever

    log.info("api.startup", provider=settings.llm_provider, port=settings.port)
    yield

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
app.include_router(chat.router, prefix="/chat")
app.include_router(ingest.router, prefix="/ingest")
