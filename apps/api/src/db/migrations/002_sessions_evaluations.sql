-- Migration 002: Persistent sessions + tender evaluations
-- Run this in Supabase SQL Editor

-- Drop old search_sessions (it was a placeholder with no real data)
DROP TABLE IF EXISTS search_sessions CASCADE;

-- ─── search_sessions ──────────────────────────────────────────────────────────
CREATE TABLE search_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_description TEXT NOT NULL,
  country_filter   TEXT,                        -- ISO alpha-3 or NULL = all EU
  status           TEXT NOT NULL DEFAULT 'scout_running',
  --  scout_running | analyst_running | complete | error
  error_message    TEXT,
  scout_matches    JSONB,                        -- MatchedNotice[] from Scout
  match_count      INTEGER DEFAULT 0,
  top_score        INTEGER,
  analyst_summary  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX sessions_created_at_idx ON search_sessions (created_at DESC);

-- ─── tender_evaluations ───────────────────────────────────────────────────────
CREATE TABLE tender_evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
  notice_id        TEXT NOT NULL,
  recommendation   TEXT NOT NULL,              -- pursue | consider | skip
  priority         INTEGER NOT NULL,           -- 1-5
  win_probability  TEXT NOT NULL,              -- high | medium | low
  estimated_effort TEXT NOT NULL,              -- low | medium | high
  risks            TEXT[],
  strengths        TEXT[],
  key_requirement  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX evaluations_session_idx ON tender_evaluations (session_id);
