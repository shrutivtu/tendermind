-- Migration 004: Optional auth, anonymous demo usage, and ownership boundaries
-- Run this in Supabase SQL Editor after 003_original_value.sql.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'owner',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_seen_at       TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  claimed_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            TEXT NOT NULL,
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  anonymous_session_id  UUID REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  ip_hash               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_anon_idx ON usage_events (anonymous_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_ip_idx ON usage_events (ip_hash, created_at DESC);

ALTER TABLE company_profiles
  ALTER COLUMN session_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS anonymous_session_id UUID REFERENCES anonymous_sessions(id) ON DELETE SET NULL;

ALTER TABLE search_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anonymous_session_id UUID REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sessions_owner_idx
  ON search_sessions (organization_id, user_id, anonymous_session_id);

-- Optional: mark any hand-picked portfolio sample session public after migration:
-- UPDATE search_sessions SET is_public = TRUE WHERE id = 'your-sample-session-id';
