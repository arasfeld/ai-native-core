-- Extend tenants for org features
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_token TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Org membership
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  invited_by TEXT        REFERENCES "user"(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON organization_members(user_id);

-- Email / link invites
CREATE TABLE IF NOT EXISTS organization_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member',
  token       TEXT        NOT NULL UNIQUE,
  invited_by  TEXT        NOT NULL REFERENCES "user"(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invites_token_idx ON organization_invites(token);

-- Generate slugs for existing tenants (lowercase name, hyphens, 4-char suffix)
UPDATE tenants
SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(id), 1, 4)
WHERE slug IS NULL;

-- Back-fill org_members owner rows for existing tenants
-- (personal orgs: org_id = user_id)
INSERT INTO organization_members (org_id, user_id, role)
SELECT id, id, 'owner'
FROM tenants
ON CONFLICT (org_id, user_id) DO NOTHING;
