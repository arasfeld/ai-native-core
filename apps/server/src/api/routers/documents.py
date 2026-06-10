"""Documents router — user-facing UI on top of the RAG ingestion pipeline.

Each upload (file or URL) creates a `documents` row, enqueues a worker job to
chunk + embed the content, and exposes the resulting status so the web UI can
show a per-document progress badge. Deleting a document cascades to its chunks.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

import structlog
from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/documents", tags=["documents"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MiB cap for text uploads
ALLOWED_TEXT_PREFIXES = ("text/",)
ALLOWED_MIME_EXTRAS = {"application/json", "application/xml"}


class DocumentOut(BaseModel):
    id: str
    name: str
    mime_type: str | None = None
    source_url: str | None = None
    size_bytes: int | None = None
    status: Literal["processing", "ready", "failed"]
    error_message: str | None = None
    chunks_count: int
    created_at: datetime
    updated_at: datetime


class IngestUrlRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    name: str | None = Field(None, max_length=255)


def _pool(request: Request):
    return request.app.state.db_pool


def _tenant_id(user: AuthUser) -> str:
    return user.org_id or user.id


def _row_to_out(row) -> DocumentOut:
    return DocumentOut(
        id=str(row["id"]),
        name=row["name"],
        mime_type=row["mime_type"],
        source_url=row["source_url"],
        size_bytes=row["size_bytes"],
        status=row["status"],
        error_message=row["error_message"],
        chunks_count=row["chunks_count"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _enqueue_ingest(
    request: Request,
    *,
    document_id: str,
    tenant_id: str,
    content: str | None,
    source_url: str | None,
) -> None:
    arq: ArqRedis | None = request.app.state.arq
    if arq is None:
        raise HTTPException(status_code=503, detail="Job queue unavailable")
    await arq.enqueue_job(
        "worker.main.ingest_document_content",
        document_id=document_id,
        tenant_id=tenant_id,
        content=content,
        source_url=source_url,
    )


@router.get("", response_model=list[DocumentOut])
async def list_documents(user: CurrentUser, request: Request) -> list[DocumentOut]:
    rows = await _pool(request).fetch(
        """
        SELECT id, name, mime_type, source_url, size_bytes, status,
               error_message, chunks_count, created_at, updated_at
        FROM documents
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 200
        """,
        _tenant_id(user),
    )
    return [_row_to_out(r) for r in rows]


@router.post("", response_model=DocumentOut, status_code=202)
async def upload_document(
    user: CurrentUser,
    request: Request,
    file: Annotated[UploadFile, File(...)],
    name: Annotated[str | None, Form()] = None,
) -> DocumentOut:
    """Multipart file upload — text-only formats; content is inlined to the job."""
    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MiB)")

    mime = file.content_type or "application/octet-stream"
    is_text = mime.startswith(ALLOWED_TEXT_PREFIXES) or mime in ALLOWED_MIME_EXTRAS
    if not is_text:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {mime}. Upload text, markdown, or JSON.",
        )

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=415, detail="File is not valid UTF-8") from exc

    doc_id = str(uuid.uuid4())
    tenant_id = _tenant_id(user)
    display_name = name or file.filename or "document.txt"

    row = await _pool(request).fetchrow(
        """
        INSERT INTO documents
            (id, tenant_id, user_id, name, mime_type, size_bytes, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'processing')
        RETURNING id, name, mime_type, source_url, size_bytes, status,
                  error_message, chunks_count, created_at, updated_at
        """,
        doc_id,
        tenant_id,
        user.id,
        display_name,
        mime,
        len(raw),
    )

    await _enqueue_ingest(
        request,
        document_id=doc_id,
        tenant_id=tenant_id,
        content=content,
        source_url=None,
    )
    log.info("documents.upload.enqueued", document_id=doc_id, mime=mime, bytes=len(raw))
    return _row_to_out(row)


@router.post("/url", response_model=DocumentOut, status_code=202)
async def ingest_url(body: IngestUrlRequest, user: CurrentUser, request: Request) -> DocumentOut:
    """Submit a URL — worker fetches, chunks, and embeds it."""
    if not (body.url.startswith("http://") or body.url.startswith("https://")):
        raise HTTPException(status_code=422, detail="URL must start with http:// or https://")

    doc_id = str(uuid.uuid4())
    tenant_id = _tenant_id(user)
    display_name = body.name or body.url

    row = await _pool(request).fetchrow(
        """
        INSERT INTO documents
            (id, tenant_id, user_id, name, source_url, status)
        VALUES ($1, $2, $3, $4, $5, 'processing')
        RETURNING id, name, mime_type, source_url, size_bytes, status,
                  error_message, chunks_count, created_at, updated_at
        """,
        doc_id,
        tenant_id,
        user.id,
        display_name,
        body.url,
    )

    await _enqueue_ingest(
        request,
        document_id=doc_id,
        tenant_id=tenant_id,
        content=None,
        source_url=body.url,
    )
    log.info("documents.url.enqueued", document_id=doc_id, url=body.url)
    return _row_to_out(row)


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, user: CurrentUser, request: Request) -> None:
    result = await _pool(request).execute(
        "DELETE FROM documents WHERE id = $1 AND tenant_id = $2",
        document_id,
        _tenant_id(user),
    )
    # asyncpg returns 'DELETE 0' or 'DELETE 1'
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="Document not found")
    log.info("documents.deleted", document_id=str(document_id))
