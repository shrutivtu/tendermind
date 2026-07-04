-- Migration 006: Password reset tokens
-- Single-use, short-lived tokens for the forgot-password flow.
-- Only the SHA-256 hash of the token is stored — the raw token exists
-- only in the reset link sent to the user.
-- Run this in Supabase SQL Editor after 005_source_column.sql.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id);
