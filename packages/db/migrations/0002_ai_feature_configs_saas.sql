-- Phase 12: Runtime AI config table + separate SaaS tables file
-- The tenants table stays unchanged (already created in 0000_setup.sql).
-- This migration only adds ai_feature_configs.

CREATE TABLE IF NOT EXISTS ai_feature_configs (
    feature     TEXT        PRIMARY KEY,
    provider    TEXT        NOT NULL DEFAULT 'ollama',
    model       TEXT,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default configs (all use env-var provider as default)
INSERT INTO ai_feature_configs (feature, provider) VALUES
    ('chat',        'ollama'),
    ('rag',         'ollama'),
    ('embeddings',  'ollama'),
    ('image_gen',   'openai'),
    ('memory',      'ollama')
ON CONFLICT (feature) DO NOTHING;
