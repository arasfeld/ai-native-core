from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from ai import BaseLLM
from pydantic import BaseModel, Field


def _vec_str(embedding: list[float]) -> str:
    """Serialize an embedding to pgvector's string format."""
    return f"[{','.join(str(v) for v in embedding)}]"


class RetrievedChunk(BaseModel):
    content: str
    metadata: dict = Field(default_factory=dict)
    score: float = 0.0


class PgVectorRetriever:
    """Retrieves relevant document chunks from pgvector using cosine similarity."""

    def __init__(
        self,
        llm: BaseLLM,
        pool=None,  # asyncpg.Pool — preferred; falls back to per-call connections
        database_url: str | None = None,
        embedding_dim: int = 768,
    ) -> None:
        self.llm = llm
        self._pool = pool
        self.database_url = database_url or os.environ.get("DATABASE_URL", "")
        self.embedding_dim = embedding_dim

    @asynccontextmanager
    async def _conn(self):
        import asyncpg

        if self._pool is not None:
            async with self._pool.acquire() as conn:
                yield conn
        else:
            conn = await asyncpg.connect(self.database_url)
            try:
                yield conn
            finally:
                await conn.close()

    async def ensure_table(self) -> None:
        """Create the document_chunks table and index if they do not exist."""
        async with self._conn() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id          BIGSERIAL PRIMARY KEY,
                    content     TEXT        NOT NULL,
                    embedding   vector({self.embedding_dim}),
                    metadata    JSONB       NOT NULL DEFAULT '{{}}',
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
                ON document_chunks
                USING hnsw (embedding vector_cosine_ops)
            """)

    async def retrieve(self, query: str, top_k: int = 3) -> list[RetrievedChunk]:
        """Embed query and find top-k similar chunks from pgvector."""
        embedding = await self.llm.embed(query)
        embedding_str = _vec_str(embedding)

        async with self._conn() as conn:
            rows = await conn.fetch(
                """
                SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
                FROM document_chunks
                ORDER BY embedding <=> $1::vector
                LIMIT $2
                """,
                embedding_str,
                top_k,
            )
            return [
                RetrievedChunk(
                    content=r["content"],
                    metadata=json.loads(r["metadata"]) if r["metadata"] else {},
                    score=r["score"],
                )
                for r in rows
            ]

    async def store(
        self,
        chunks: list[str],
        metadata: dict | None = None,
        document_id: str | None = None,
    ) -> int:
        """Embed and store text chunks in pgvector. Returns number stored."""
        # Embed all chunks in parallel
        embeddings = await asyncio.gather(*[self.llm.embed(chunk) for chunk in chunks])
        meta_json = json.dumps(metadata or {})

        async with self._conn() as conn:
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                await conn.execute(
                    """
                    INSERT INTO document_chunks (content, embedding, metadata, document_id)
                    VALUES ($1, $2::vector, $3::jsonb, $4::uuid)
                    """,
                    chunk,
                    _vec_str(embedding),
                    meta_json,
                    document_id,
                )
            return len(chunks)
