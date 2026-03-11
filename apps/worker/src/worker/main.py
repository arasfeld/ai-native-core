import os

import structlog
from arq.connections import RedisSettings

log = structlog.get_logger()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


async def ingest_document(ctx, document_url: str, tenant_id: str = "default") -> dict:
    """Background task: fetch, chunk, embed, and store a document."""
    from ai import get_llm
    from rag import PgVectorRetriever, chunk_text
    from rag.ingest.loaders import load_url

    log.info("worker.ingest.start", url=document_url, tenant=tenant_id)
    content = await load_url(document_url)
    chunks = chunk_text(content)
    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm)
    stored = await retriever.store(chunks, metadata={"source": document_url, "tenant": tenant_id})
    log.info("worker.ingest.complete", chunks=stored)
    return {"chunks_stored": stored}


class WorkerSettings:
    """ARQ worker configuration."""

    functions = [ingest_document]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    max_jobs = 10
    job_timeout = 300  # 5 minutes
