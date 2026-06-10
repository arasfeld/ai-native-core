import os

import structlog
from arq.connections import RedisSettings

from .logging import configure_logging

configure_logging(
    json_logs=os.getenv("LOG_FORMAT", "console") == "json",
    log_level=os.getenv("LOG_LEVEL", "INFO"),
)
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


async def ingest_document_content(
    ctx,
    document_id: str,
    tenant_id: str,
    content: str | None = None,
    source_url: str | None = None,
) -> dict:
    """Background task: chunk + embed for a `documents` row.

    Updates the row's `status`, `chunks_count`, and `error_message` so the
    user-facing UI can show progress / failure. Exactly one of `content` or
    `source_url` must be set — if `source_url` is given, the URL is fetched
    first.
    """
    import asyncpg
    from ai import get_llm
    from rag import PgVectorRetriever, chunk_text
    from rag.ingest.loaders import load_url

    database_url = os.environ.get("DATABASE_URL", "")
    log.info("worker.documents.ingest.start", document_id=document_id, tenant=tenant_id)

    conn = await asyncpg.connect(database_url)
    try:
        try:
            if content is None and source_url:
                content = await load_url(source_url)
            if not content:
                raise ValueError("No content to ingest")

            chunks = chunk_text(content)
            llm = get_llm()
            retriever = PgVectorRetriever(llm=llm, database_url=database_url)
            stored = await retriever.store(
                chunks,
                metadata={"tenant": tenant_id, "source": source_url or document_id},
                document_id=document_id,
            )
            await conn.execute(
                """
                UPDATE documents
                   SET status = 'ready',
                       chunks_count = $2,
                       error_message = NULL,
                       updated_at = NOW()
                 WHERE id = $1::uuid
                """,
                document_id,
                stored,
            )
            log.info(
                "worker.documents.ingest.complete",
                document_id=document_id,
                chunks=stored,
            )
            return {"document_id": document_id, "chunks_stored": stored}
        except Exception as exc:
            log.error(
                "worker.documents.ingest.failed",
                document_id=document_id,
                error=str(exc),
            )
            await conn.execute(
                """
                UPDATE documents
                   SET status = 'failed',
                       error_message = $2,
                       updated_at = NOW()
                 WHERE id = $1::uuid
                """,
                document_id,
                str(exc)[:500],
            )
            raise
    finally:
        await conn.close()


async def run_agent(
    ctx,
    message: str,
    session_id: str = "background",
    use_rag: bool = False,
) -> dict:
    """Background task: run a full agent turn and return the complete reply.

    Useful for long-running tasks where SSE streaming isn't practical
    (e.g. scheduled summaries, batch processing, webhook callbacks).
    """
    from agents import ChatState, RAGState, build_chat_graph, build_rag_graph
    from ai import get_llm
    from langchain_core.messages import HumanMessage
    from memory import SessionStore, SummaryCompressor
    from rag import PgVectorRetriever

    log.info("worker.run_agent.start", session_id=session_id, use_rag=use_rag)
    llm = get_llm()
    store = SessionStore()
    compressor = SummaryCompressor(llm=llm)

    history = await store.get_messages(session_id)
    history = await compressor.compress(history)
    await store.add_message(session_id, "human", message)

    messages = [*history, HumanMessage(content=message)]
    tokens: list[str] = []

    if use_rag:
        retriever = PgVectorRetriever(llm=llm)
        chunks = await retriever.retrieve(message)
        agent = build_rag_graph(llm=llm)
        state: RAGState = {
            "messages": messages,
            "session_id": session_id,
            "context_chunks": [c.content for c in chunks],
        }
    else:
        agent = build_chat_graph(llm=llm)
        state: ChatState = {
            "messages": messages,
            "session_id": session_id,
            "system_prompt": "",
        }

    async for token in agent.stream(state):
        tokens.append(token)

    reply = "".join(tokens)
    await store.add_message(session_id, "assistant", reply)

    log.info("worker.run_agent.complete", session_id=session_id, tokens=len(tokens))
    return {"reply": reply, "session_id": session_id}


class WorkerSettings:
    """ARQ worker configuration."""

    functions = [ingest_document, ingest_document_content, run_agent]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    max_jobs = 10
    job_timeout = 300  # 5 minutes
