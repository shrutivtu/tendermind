-- Migration 007: Scout hybrid search support
-- Full-text index for the keyword arm of hybrid search (vector + keyword RRF),
-- and a deadline index for the "exclude expired tenders" filter.
-- Run after 006_password_reset.sql.

-- NOTE: expression must match the query in apps/api/src/agents/scout.ts exactly
CREATE INDEX IF NOT EXISTS notices_fts_idx
  ON notices
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS notices_deadline_idx
  ON notices (deadline);
