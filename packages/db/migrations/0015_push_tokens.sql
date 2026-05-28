-- 0015_push_tokens.sql — Expo push tokens for mobile push notifications.

CREATE TABLE IF NOT EXISTS push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens(user_id);
