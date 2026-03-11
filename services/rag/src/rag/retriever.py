from __future__ import annotations

import asyncio
import json
import os

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
        database_url: str | None = None,
        embedding_dim: int = 768,
    ) -> None:
        self.llm = llm
        self.database_url = database_url or os.environ["DATABASE_URL"]
        self.embedding_dim = embedding_dim

    async def ensure_table(self) -> None:
        """Create the document_chunks table and index if they do not exist."""
        import asyncpg

        conn = await asyncpg.connect(self.database_url)
        try:
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
        finally:
            await conn.close()

    async def retrieve(self, query: str, top_k: int = 3) -> list[RetrievedChunk]:
        """Embed query and find top-k similar chunks from pgvector."""
        import asyncpg

        embedding = await self.llm.embed(query)
        embedding_str = _vec_str(embedding)

        conn = await asyncpg.connect(self.database_url)
        try:
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
        finally:
            await conn.close()

    async def store(self, chunks: list[str], metadata: dict | None = None) -> int:
        """Embed and store text chunks in pgvector. Returns number stored."""
        import asyncpg

        # Embed all chunks in parallel
        embeddings = await asyncio.gather(*[self.llm.embed(chunk) for chunk in chunks])

        meta_json = json.dumps(metadata or {})

        conn = await asyncpg.connect(self.database_url)
        try:
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                await conn.execute(
                    """
                    INSERT INTO document_chunks (content, embedding, metadata)
                    VALUES ($1, $2::vector, $3::jsonb)
                    """,
                    chunk,
                    _vec_str(embedding),
                    meta_json,
                )
            return len(chunks)
        finally:
            await conn.close()
