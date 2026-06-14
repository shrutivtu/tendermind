-- TenderMind initial schema
-- Run this in Supabase SQL Editor

-- Enable pgvector (skip if already done)
create extension if not exists vector;

-- ─── CPV Codes ────────────────────────────────────────────────────────────────
create table if not exists cpv_codes (
  code        text primary key,
  label       text not null,
  parent_code text,
  level       integer not null
);

-- ─── Notices ──────────────────────────────────────────────────────────────────
create table if not exists notices (
  id                text primary key,
  type              text not null,
  title             text not null,
  title_original    text,
  description       text,
  language          text not null,
  country           text not null,
  buyer_name        text,
  buyer_country     text,
  cpv_codes         text[],
  estimated_value   real,
  currency          text,
  deadline          timestamptz,
  publication_date  timestamptz not null,
  url               text,
  raw_data          jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists notices_country_idx      on notices (country);
create index if not exists notices_deadline_idx     on notices (deadline);
create index if not exists notices_pub_date_idx     on notices (publication_date);

-- ─── Notice Embeddings ────────────────────────────────────────────────────────
create table if not exists notice_embeddings (
  notice_id     text primary key references notices(id) on delete cascade,
  embedding     vector(1536),
  embedded_text text,
  created_at    timestamptz default now()
);

-- HNSW index for fast cosine similarity search
create index if not exists notice_embeddings_hnsw_idx
  on notice_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ─── Awards ───────────────────────────────────────────────────────────────────
create table if not exists awards (
  id                uuid primary key default gen_random_uuid(),
  notice_id         text,
  awarded_value     real,
  winner_name       text,
  winner_country    text,
  buyer_name        text,
  buyer_country     text,
  cpv_codes         text[],
  publication_date  timestamptz not null,
  raw_data          jsonb,
  created_at        timestamptz default now()
);

-- ─── Company Profiles ─────────────────────────────────────────────────────────
create table if not exists company_profiles (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  name        text,
  description text not null,
  country     text,
  cpv_codes   text[],
  keywords    text[],
  created_at  timestamptz default now()
);

-- ─── Search Sessions ──────────────────────────────────────────────────────────
create table if not exists search_sessions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references company_profiles(id),
  status      text not null default 'pending',
  results     jsonb,
  created_at  timestamptz default now()
);
