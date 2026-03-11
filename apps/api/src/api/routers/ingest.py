import structlog
from ai import get_llm
from fastapi import APIRouter
from pydantic import BaseModel, Field
from rag import PgVectorRetriever, chunk_text

log = structlog.get_logger()
router = APIRouter()


class IngestRequest(BaseModel):
    content: str
    metadata: dict = Field(default_factory=dict)
    chunk_size: int = 1000
    chunk_overlap: int = 200


class IngestResponse(BaseModel):
    chunks_stored: int


@router.post("", response_model=IngestResponse)
async def ingest(req: IngestRequest) -> IngestResponse:
    """Chunk, embed, and store text content in pgvector."""
    chunks = chunk_text(req.content, chunk_size=req.chunk_size, overlap=req.chunk_overlap)
    llm = get_llm()
    retriever = PgVectorRetriever(llm=llm)
    stored = await retriever.store(chunks, metadata=req.metadata)
    log.info("ingest.complete", chunks=stored)
    return IngestResponse(chunks_stored=stored)
