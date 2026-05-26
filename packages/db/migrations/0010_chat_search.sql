-- Full-text search indexes for conversation search.
CREATE INDEX IF NOT EXISTS chat_sessions_content_fts_idx
  ON chat_sessions USING GIN (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS conversations_title_fts_idx
  ON conversations USING GIN (to_tsvector('english', title));
