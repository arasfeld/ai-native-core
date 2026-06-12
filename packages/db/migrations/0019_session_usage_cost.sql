-- 0019_session_usage_cost.sql — Dollar cost per usage row + per-tenant cost cap.
--
-- Extends session_token_usage with the provider/model that produced the turn,
-- a prompt/completion split (so cost is accurate even when input and output
-- rates differ), and the computed USD cost. Adds an optional cost_limit_usd
-- on tenants so the monthly budget can be enforced in dollars instead of
-- tokens. NULL preserves the existing token-based behaviour.

ALTER TABLE session_token_usage
    ADD COLUMN IF NOT EXISTS provider      TEXT,
    ADD COLUMN IF NOT EXISTS model         TEXT,
    ADD COLUMN IF NOT EXISTS input_tokens  INTEGER,
    ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS cost_usd      NUMERIC(12, 6);

CREATE INDEX IF NOT EXISTS session_token_usage_provider_model_idx
    ON session_token_usage (provider, model);

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS cost_limit_usd NUMERIC(10, 4);
