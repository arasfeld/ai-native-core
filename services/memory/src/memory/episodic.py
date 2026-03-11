"""Episodic (long-term) memory — stores and retrieves facts across sessions.

Facts are embedded with pgvector so that semantically relevant memories are
surfaced at query time regardless of which session they originated in.

Usage::

    store = EpisodicStore(llm=llm, pool=pool)
    await store.ensure_table()

    # After a conversation turn
    await store.store("User prefers concise answers.", session_id="abc")

    # Before the next turn
    facts = await store.search("communication style", top_k=3)
    for fact in facts:
        print(fact.content, fact.score)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

import asyncpg
import structlog

if TYPE_CHECKING:
    from ai.base import BaseLLM

log = structlog.get_logger()

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS episodic_memories (
    id          BIGSERIAL   PRIMARY KEY,
    content     TEXT        NOT NULL,
    embedding   vector(768),
    session_id  TEXT,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS episodic_memories_embedding_idx
    ON episodic_memories
    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS episodic_memories_session_id_idx
    ON episodic_memories (session_id);
"""


def _vec_str(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"


@dataclass
class EpisodicFact:
    id: int
    content: str
    session_id: str | None
    metadata: dict
    score: float


class EpisodicStore:
    """Long-term memory backed by pgvector.

    Args:
        llm:           LLM instance used for embedding queries and new facts.
        pool:          Shared asyncpg connection pool.
        embedding_dim: Must match the model's output dimension (default: 768
                       for nomic-embed-text).
    """

    def __init__(
        self,
        llm: BaseLLM,
        pool: asyncpg.Pool,
        embedding_dim: int = 768,
    ) -> None:
        self._llm = llm
        self._pool = pool
        self._embedding_dim = embedding_dim

    async def ensure_table(self) -> None:
        """Create the episodic_memories table and index if they don't exist."""
        # Substitute embedding_dim into the DDL before running
        ddl = _CREATE_TABLE.replace("vector(768)", f"vector({self._embedding_dim})")
        async with self._pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(ddl)
        log.debug("memory.episodic.table_ready")

    async def store(
        self,
        content: str,
        session_id: str | None = None,
        metadata: dict | None = None,
    ) -> int:
        """Embed *content* and persist it as a long-term memory.

        Returns the new row's primary key.
        """
        embedding = await self._llm.embed(content)
        meta_json = json.dumps(metadata or {})
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO episodic_memories (content, embedding, session_id, metadata)
                VALUES ($1, $2::vector, $3, $4::jsonb)
                RETURNING id
                """,
                content,
                _vec_str(embedding),
                session_id,
                meta_json,
            )
        fact_id: int = row["id"]
        log.debug("memory.episodic.stored", id=fact_id, session_id=session_id)
        return fact_id

    async def search(
        self,
        query: str,
        top_k: int = 5,
        session_id: str | None = None,
    ) -> list[EpisodicFact]:
        """Return up to *top_k* facts most relevant to *query*.

        Args:
            query:      Natural-language query to embed and compare against.
            top_k:      Maximum number of results.
            session_id: If provided, restrict results to this session only.
        """
        embedding = await self._llm.embed(query)
        vec = _vec_str(embedding)

        async with self._pool.acquire() as conn:
            if session_id:
                rows = await conn.fetch(
                    """
                    SELECT id, content, session_id, metadata,
                           1 - (embedding <=> $1::vector) AS score
                    FROM episodic_memories
                    WHERE session_id = $3
                    ORDER BY embedding <=> $1::vector
                    LIMIT $2
                    """,
                    vec,
                    top_k,
                    session_id,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT id, content, session_id, metadata,
                           1 - (embedding <=> $1::vector) AS score
                    FROM episodic_memories
                    ORDER BY embedding <=> $1::vector
                    LIMIT $2
                    """,
                    vec,
                    top_k,
                )

        return [
            EpisodicFact(
                id=r["id"],
                content=r["content"],
                session_id=r["session_id"],
                metadata=json.loads(r["metadata"]) if r["metadata"] else {},
                score=r["score"],
            )
            for r in rows
        ]

    async def delete(self, fact_id: int) -> None:
        """Remove a specific memory by ID."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM episodic_memories WHERE id = $1", fact_id
            )
