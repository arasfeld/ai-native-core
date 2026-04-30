CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
