-- 0016_documents.sql — User-facing document tracking for the RAG pipeline.

CREATE TABLE IF NOT EXISTS documents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT         NOT NULL,
  user_id       TEXT         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,
  mime_type     TEXT,
  source_url    TEXT,
  size_bytes    INTEGER,
  status        TEXT         NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing','ready','failed')),
  error_message TEXT,
  chunks_count  INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_tenant_created_idx
  ON documents (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents (user_id);

-- Tie chunks back to their parent document so deletes cascade.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS document_id UUID
    REFERENCES documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);
