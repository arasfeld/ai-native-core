-- Per-message user feedback (thumbs up / thumbs down) tied to a LangSmith
-- run_id so we can mirror the signal back to LangSmith and use it as a
-- ground-truth signal in evals.

CREATE TABLE IF NOT EXISTS message_feedback (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID        NOT NULL,
    session_id  TEXT        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    user_id     TEXT,
    rating      SMALLINT    NOT NULL CHECK (rating IN (-1, 1)),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_feedback_run_id_idx
    ON message_feedback (run_id);

CREATE INDEX IF NOT EXISTS message_feedback_tenant_created_idx
    ON message_feedback (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS message_feedback_session_idx
    ON message_feedback (session_id);
