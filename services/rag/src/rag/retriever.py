import asyncio
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

    def __init__(self, llm: BaseLLM, database_url: str | None = None) -> None:
        self.llm = llm
        self.database_url = database_url or os.environ["DATABASE_URL"]

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
                RetrievedChunk(content=r["content"], metadata=r["metadata"] or {}, score=r["score"])
                for r in rows
            ]
        finally:
            await conn.close()

    async def store(self, chunks: list[str], metadata: dict | None = None) -> int:
        """Embed and store text chunks in pgvector. Returns number stored."""
        import asyncpg

        # Embed all chunks in parallel
        embeddings = await asyncio.gather(*[self.llm.embed(chunk) for chunk in chunks])

        conn = await asyncpg.connect(self.database_url)
        try:
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                await conn.execute(
                    """
                    INSERT INTO document_chunks (content, embedding, metadata)
                    VALUES ($1, $2::vector, $3)
                    """,
                    chunk,
                    _vec_str(embedding),
                    metadata or {},
                )
            return len(chunks)
        finally:
            await conn.close()
