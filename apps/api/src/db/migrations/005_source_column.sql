-- Migration 005: Add source column to notices table
-- Distinguishes TED (EU) notices from Find a Tender (UK) notices.
-- Run this in Supabase SQL Editor after 004_auth_usage.sql.

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ted';

-- Index for filtering/counting by source
CREATE INDEX IF NOT EXISTS notices_source_idx ON notices (source);

-- Comment for clarity
COMMENT ON COLUMN notices.source IS 'Data source: ''ted'' = EU TED, ''find-tender'' = UK Find a Tender';
