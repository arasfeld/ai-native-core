-- Aggregated eval scores per category+scorer for each CI run. The unit-test
-- suite writes one row per (category, scorer) when EVAL_DB_URL is set; the
-- /admin/evals UI reads from here to chart pass rates over time.

CREATE TABLE IF NOT EXISTS eval_runs (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    commit_sha         TEXT         NOT NULL,
    branch             TEXT,
    category           TEXT         NOT NULL,
    scorer             TEXT         NOT NULL,
    pass_count         INTEGER      NOT NULL,
    total_count        INTEGER      NOT NULL,
    score              NUMERIC(5,4) NOT NULL,
    threshold          NUMERIC(5,4),
    langsmith_run_url  TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eval_runs_category_created_idx
    ON eval_runs (category, created_at DESC);

CREATE INDEX IF NOT EXISTS eval_runs_scorer_created_idx
    ON eval_runs (scorer, created_at DESC);
