# TenderMind

[![CI](https://github.com/shrutivtu/tendermind/actions/workflows/ci.yml/badge.svg)](https://github.com/shrutivtu/tendermind/actions/workflows/ci.yml)

AI-powered EU and UK procurement intelligence for small and medium enterprises. TenderMind monitors the EU's official tender database (TED) and the UK's Find a Tender service, understands what your company does, and surfaces relevant contract opportunities — ranked by fit and evaluated for bid/no-bid decisions using a two-agent AI pipeline.

---

## What it does

EU and UK public procurement is a multi-trillion euro/year market, but navigating it is painful. TED publishes thousands of notices daily across 27 EU countries in 24 languages; Find a Tender covers all UK public contracts post-Brexit. TenderMind makes both searchable for SMEs in one place.

1. **You describe your company** — one paragraph about what you do
2. **Scout agent searches** — streams live results ranked by semantic similarity to your description
3. **Analyst agent evaluates** — runs in the background, writes a bid/no-bid recommendation, win probability, risks, and strengths for each match
4. **Sessions persist** — come back later; results are stored and linkable

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                    │
│                                                             │
│  /search  ──SSE──►  Scout results stream                    │
│     │                    │                                  │
│     └──redirect──► /sessions/:id  ◄──polls every 3s──┐     │
└─────────────────────────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Fastify API │
                    │             │
                    │  Scout      │──► TED API (notices)
                    │  Agent      │──► pgvector (similarity)
                    │     │       │──► DB (save session)
                    │     │       │
                    │     └──fire-and-forget──►
                    │             │
                    │  Analyst    │──► Claude (tool use)
                    │  Agent      │──► DB (write evaluations)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Supabase   │
                    │  PostgreSQL │
                    │  + pgvector │
                    └─────────────┘
```

### Two-agent pipeline

**Scout** (`apps/api/src/agents/scout.ts`)
- Takes company description + optional country/historical filter
- Generates an OpenAI embedding (`text-embedding-3-small`, 1536 dimensions)
- Runs **hybrid search**: vector arm (pgvector cosine similarity) + keyword arm (Postgres FTS), fused with Reciprocal Rank Fusion (RRF)
- Filters out expired tenders; NULL-deadline notices older than 21 days treated as closed (data-backed: median tender window is 24 days)
- Claude analyses top 25 candidates, calls `record_match` tool for genuine fits
- Streams matches to the browser via SSE as they're found
- Creates a DB session, saves matches, then fires the Analyst as a background job

**Analyst** (`apps/api/src/agents/analyst.ts`)
- Runs entirely server-side — no SSE, no HTTP endpoint
- Uses Claude (`claude-opus-4-5`) with tool use: `record_evaluation` and `write_summary`
- For each tender, Claude calls `record_evaluation` → immediately written to `tender_evaluations` table
- Ends by calling `write_summary` → stored as `analyst_summary` on the session
- Session status: `scout_running` → `analyst_running` → `complete`

### Data pipeline

```
TED API (REST v3)          Find a Tender API (OCDS)
     │                              │
     └──────────────┬───────────────┘
                    ▼
     Single ingestion worker  (SOURCE=ted|find-tender|all)
     Runs every 6h via GitHub Actions
                    │
     ├─► Normalize: title, description, CPV codes, deadline
     │   Currency → EUR via ECB daily rates (GBP inverted)
     │   source = 'ted' | 'find-tender'
     │
     ├─► Upsert into notices table (PostgreSQL)
     │
     └─► Embed new notices only (skips already-embedded)
              → OpenAI text-embedding-3-small (1536 dims)
              → store in notice_embeddings (pgvector)
```

**Currency handling**: EU — 7 non-eurozone currencies (PLN, CZK, SEK, RON, HUF, DKK, BGN) converted via ECB daily reference rate XML. BGN hardcoded at 1.9558 (fixed peg). UK — GBP→EUR by inverting the ECB EUR-base rate (ECB publishes EUR/GBP; we need GBP/EUR). Original values preserved in `original_value`.

**CPV codes**: The EU's Common Procurement Vocabulary — 9,454 standardised category codes. We seed a curated ~350-code subset covering the realistic SME universe (IT, software, engineering, health, professional services, R&D, construction) into PostgreSQL, then use labels to enrich embeddings.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Fastify (Node.js), TypeScript |
| Database | PostgreSQL + pgvector (hosted on Supabase) |
| ORM / query | Drizzle ORM + postgres.js |
| AI — embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| AI — agents | Anthropic Claude (`claude-opus-4-5`), streaming + tool use |
| Monorepo | Turborepo |
| Data sources | TED REST API v3 (`api.ted.europa.eu`), UK Find a Tender OCDS API |
| FX rates | ECB daily reference XML |

---

## Project structure

```
tendermind/
├── apps/
│   ├── api/                    # Fastify backend
│   │   └── src/
│   │       ├── agents/
│   │       │   ├── scout.ts    # Scout agent (SSE streaming)
│   │       │   └── analyst.ts  # Analyst agent (background job)
│   │       ├── routes/
│   │       │   ├── agents.ts   # POST /api/scout
│   │       │   └── sessions.ts # GET /api/sessions, /sessions/:id
│   │       └── db/
│   │           ├── schema.ts   # Drizzle schema
│   │           └── migrations/ # SQL migrations
│   │
│   └── web/                    # Next.js frontend
│       └── src/app/
│           ├── search/         # Search UI with SSE stream
│           ├── sessions/[id]/  # Persistent session page (polls analyst)
│           └── dashboard/      # Session history
│
└── workers/
    ├── ingestion/              # EU + UK tenders → PostgreSQL pipeline
    │   └── src/
    │       ├── index.ts        # Entry — SOURCE=ted|find-tender|all
    │       ├── pipeline.ts     # Shared upsert + embedding pipeline
    │       ├── types.ts        # NormalizedNotice + SourceAdapter interface
    │       ├── embedder.ts     # OpenAI batch embeddings
    │       ├── fx-rates.ts     # ECB rate fetcher + toEur() (incl. GBP)
    │       ├── fix-currencies.ts # One-time backfill script
    │       └── sources/
    │           ├── ted/            # EU: TED REST v3 client + normalizer
    │           └── find-tender/    # UK: OCDS client (429 retry) + normalizer
    │
    ├── award-sync/             # Syncs contract award data
    │
    └── cpv-loader/             # Seeds CPV taxonomy into DB
        └── src/
            ├── cpv-seed.ts     # Curated CPV code dataset
            └── index.ts        # Loader script
```

---

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- OpenAI API key
- Anthropic API key

### 1. Clone and install

```bash
git clone https://github.com/shrutivtu/tendermind.git
cd tendermind
npm install
```

### 2. Environment variables

Create `.env` at the repo root:

```env
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠️ Never commit `.env`. If your password contains `@`, encode it as `%40` in the URL.

### 3. Run database migrations

In your Supabase SQL editor, run in order:

```
apps/api/src/db/migrations/001_initial.sql
apps/api/src/db/migrations/002_sessions_evaluations.sql
apps/api/src/db/migrations/003_original_value.sql
apps/api/src/db/migrations/004_award_sync.sql
apps/api/src/db/migrations/005_source_column.sql
```

Enable pgvector extension first:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Seed CPV codes

```bash
cd workers/cpv-loader
npx tsx --env-file=../../.env src/index.ts
```

### 5. Run the ingestion worker

```bash
cd workers/ingestion

# Both sources (EU TED + UK Find a Tender)
npx tsx --env-file=../../.env src/index.ts

# Or one source at a time
SOURCE=ted npx tsx --env-file=../../.env src/index.ts
SOURCE=find-tender npx tsx --env-file=../../.env src/index.ts
```

The worker fetches the last 2 days of notices per source (`DAYS_BACK` to override), normalises them, converts currencies to EUR at ECB rates, and upserts into Supabase. Only new notices get embedded — re-runs skip already-embedded notices, keeping typical runs under 3 minutes. In production this runs every 6 hours via GitHub Actions (`.github/workflows/ingest.yml`).

### 6. Start the app

```bash
# From repo root
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:3001

---

## Database schema

| Table | Purpose |
|---|---|
| `cpv_codes` | CPV taxonomy — codes, labels, hierarchy |
| `notices` | Normalised tender notices (EU + UK); `source` column distinguishes origin |
| `notice_embeddings` | pgvector embeddings (1536 dims) |
| `search_sessions` | One row per Scout+Analyst run |
| `tender_evaluations` | Analyst's per-tender recommendation |
| `awards` | Contract award data (future: competitive intel) |
| `company_profiles` | Saved company descriptions |

---

## API reference

```
POST /api/agents/scout
  Body: { description, country?, includeHistorical? }
  Response: SSE stream
    { type: 'session_id', id: string }
    { type: 'match', notice: MatchedNotice }
    { type: 'done', totalMatches: number }

GET /api/sessions
  Returns last 20 sessions with eval counts

GET /api/sessions/:id
  Returns full session + evaluations array

GET /api/sessions/:id/poll
  Lightweight status + eval count (for polling)
```

---

## Key design decisions

**Why fire-and-forget for the Analyst?**
The Scout streams results to the browser in real time. Having the browser wait for the Analyst to finish (sometimes 60+ seconds) would be a terrible UX. Instead, Scout saves to DB and immediately fires the Analyst as an unawaited background job. The browser navigates to the persistent session page and polls every 3 seconds until status is `complete`.

**Why pgvector instead of a dedicated vector DB (Pinecone, Weaviate)?**
For ~10K notices, pgvector's HNSW index is fast enough and keeps the stack simple — one database instead of two. If the corpus grows to millions of notices, migrating to a dedicated vector DB would be the right call.

**Why embed at ingestion time instead of at query time?**
Embedding all notices once at ingest means search is just a single `<=>` vector query — sub-100ms. Embedding at query time would add a round trip to OpenAI on every search.

**Why Claude with tool use for the Analyst?**
Tool use forces structured output without prompt engineering fragility. `record_evaluation` has a typed schema — Claude can't return malformed data. Each call writes immediately to the DB, so partial results are visible while the Analyst is still running.

---

## License

MIT
