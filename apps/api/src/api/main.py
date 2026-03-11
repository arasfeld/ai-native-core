import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from memory import SessionStore

from .config import settings
from .routers import chat, health, ingest

log = structlog.get_logger()

app = FastAPI(
    title="AI Native Core API",
    version="0.1.0",
    description="FastAPI AI orchestration server with LangGraph agents",
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


@app.on_event("startup")
async def startup() -> None:
    log.info("api.startup", provider=settings.llm_provider, port=settings.port)
    await SessionStore().ensure_table()
