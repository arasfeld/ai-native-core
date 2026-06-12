-- 0018_model_pricing.sql — Per-model unit cost (USD per 1M tokens).
--
-- Used by services/pricing to convert token usage into dollar spend. Seeded
-- below with representative public list prices as of late 2025; admins can
-- override or extend via PUT /admin/pricing. Set `is_override = TRUE` when a
-- row was edited manually so subsequent re-seeds don't clobber it.

CREATE TABLE IF NOT EXISTS model_pricing (
    provider             TEXT        NOT NULL,
    model                TEXT        NOT NULL,
    input_usd_per_mtok   NUMERIC(12, 6) NOT NULL,
    output_usd_per_mtok  NUMERIC(12, 6) NOT NULL,
    is_override          BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, model)
);

-- Seed public list prices. ON CONFLICT skips rows already overridden.
INSERT INTO model_pricing (provider, model, input_usd_per_mtok, output_usd_per_mtok) VALUES
    -- OpenAI
    ('openai', 'gpt-4o',                       2.50,   10.00),
    ('openai', 'gpt-4o-mini',                  0.15,    0.60),
    ('openai', 'gpt-4-turbo',                 10.00,   30.00),
    ('openai', 'gpt-4',                       30.00,   60.00),
    ('openai', 'gpt-3.5-turbo',                0.50,    1.50),
    ('openai', 'o1',                          15.00,   60.00),
    ('openai', 'o1-mini',                      3.00,   12.00),
    ('openai', 'text-embedding-3-small',       0.02,    0.00),
    ('openai', 'text-embedding-3-large',       0.13,    0.00),
    -- Anthropic
    ('anthropic', 'claude-opus-4-7',          15.00,   75.00),
    ('anthropic', 'claude-sonnet-4-6',         3.00,   15.00),
    ('anthropic', 'claude-haiku-4-5',          0.80,    4.00),
    ('anthropic', 'claude-3-5-sonnet',         3.00,   15.00),
    ('anthropic', 'claude-3-5-haiku',          0.80,    4.00),
    ('anthropic', 'claude-3-opus',            15.00,   75.00),
    -- OpenRouter (routed; prices match underlying provider)
    ('openrouter', 'openai/gpt-4o',            2.50,   10.00),
    ('openrouter', 'openai/gpt-4o-mini',       0.15,    0.60),
    ('openrouter', 'anthropic/claude-opus-4-7', 15.00, 75.00),
    ('openrouter', 'anthropic/claude-sonnet-4-6', 3.00, 15.00),
    -- Ollama (self-hosted; zero marginal cost)
    ('ollama', 'llama3.2',                     0.00,    0.00),
    ('ollama', 'nomic-embed-text',             0.00,    0.00)
ON CONFLICT (provider, model) DO NOTHING;

CREATE INDEX IF NOT EXISTS model_pricing_provider_idx ON model_pricing (provider);
