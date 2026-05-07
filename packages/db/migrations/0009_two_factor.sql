CREATE TABLE IF NOT EXISTS "twoFactor" (
  id            TEXT    PRIMARY KEY,
  secret        TEXT    NOT NULL,
  "backupCodes" TEXT    NOT NULL,
  "userId"      TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS "twoFactorVerified" BOOLEAN NOT NULL DEFAULT FALSE;
