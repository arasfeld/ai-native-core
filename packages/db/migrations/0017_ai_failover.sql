-- 0017_ai_failover.sql — Per-feature provider failover chain for services/ai.
--
-- Each entry in `fallback_providers` is `{"provider": "...", "model": "..."}`.
-- On a 5xx/timeout/rate-limit from the primary, services/ai walks the chain
-- in order. An empty array (the default) disables failover.

ALTER TABLE ai_feature_configs
  ADD COLUMN IF NOT EXISTS fallback_providers JSONB NOT NULL DEFAULT '[]'::jsonb;
