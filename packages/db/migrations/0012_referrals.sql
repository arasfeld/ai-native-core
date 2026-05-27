-- Referrals: each user gets a unique code; both referrer and new user receive
-- a one-time top-up added to their tenant's token_limit on signup.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS referral_bonus_tokens INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referrals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id  TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  referred_user_id  TEXT        UNIQUE REFERENCES "user"(id) ON DELETE SET NULL,
  code              TEXT        NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ,
  bonus_granted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx     ON referrals (code);
