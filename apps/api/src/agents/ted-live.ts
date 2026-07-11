// Live TED search arm for the Scout agent.
//
// Instead of relying only on the 6-hourly ingested cache, the Scout queries
// TED's search API directly at search time:
//   1. A fast Claude call plans expert-query filters (CPV prefixes) from the
//      company description
//   2. One-to-two sequential TED requests fetch the current biddable
//      candidates (open deadline, awards excluded)
//   3. Candidates are reranked by cosine similarity against the company
//      embedding — cached vectors from notice_embeddings where available,
//      one OpenAI batch call for the misses
//
// TED rate-limits bursts hard (nginx-level 429s on parallel calls; sequential
// calls ~300ms apart never fail — verified by probe 2026-07-11). ALL TED
// requests in the API process therefore go through a serialized queue.
// Callers should catch failures and fall back to the local pgvector/FTS arms.

import Anthropic from '@anthropic-ai/sdk'
import postgres from 'postgres'
import { embedBatch } from '../lib/embedder.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TED_API_BASE = 'https://api.ted.europa.eu/v3'
const TED_REQUEST_GAP_MS = 300
const TED_TIMEOUT_MS = 8000
const MAX_PAGES = 2           // up to 200 candidates before rerank

// Award/announcement types — not biddable, never wanted in search results
const EXCLUDED_TYPES = ['can-standard', 'can-social', 'can-desg', 'can-modif', 'veat']

// ─── Serialized request queue ─────────────────────────────────────────────────
// Single promise chain: requests run one at a time, min 300ms apart, no matter
// how many users search concurrently.

let queueTail: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function enqueueTedRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastRequestAt + TED_REQUEST_GAP_MS - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    try {
      return await fn()
    } finally {
      lastRequestAt = Date.now()
    }
  }
  const p = queueTail.then(run, run)
  queueTail = p.catch(() => {})
  return p
}

// ─── Minimal TED client (API-side) ────────────────────────────────────────────

interface TedRawNotice {
  'publication-number': string
  'notice-type'?: string
  'notice-title'?: Record<string, string>
  'description-proc'?: Record<string, string>
  'description-lot'?: Record<string, string[]>
  'buyer-name'?: Record<string, string[]>
  'buyer-country'?: string[]
  'classification-cpv'?: string[]
  'estimated-value-lot'?: string[]
  'deadline-date-lot'?: string[]
  'publication-date'?: string
  'links'?: { html?: Record<string, string>; htmlDirect?: Record<string, string> }
}

const SEARCH_FIELDS = [
  'publication-number', 'notice-type', 'notice-title',
  'description-proc', 'description-lot',
  'buyer-name', 'buyer-country', 'classification-cpv',
  'estimated-value-lot', 'deadline-date-lot', 'publication-date', 'links',
]

async function tedSearch(query: string, page: number, limit = 100): Promise<{
  notices: TedRawNotice[]
  totalNoticeCount: number
}> {
  return enqueueTedRequest(async () => {
    const res = await fetch(`${TED_API_BASE}/notices/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, fields: SEARCH_FIELDS, page, limit }),
      signal: AbortSignal.timeout(TED_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`TED live search failed: HTTP ${res.status}`)
    return res.json() as Promise<{ notices: TedRawNotice[]; totalNoticeCount: number }>
  })
}

// ─── Language pickers (mirror the ingestion normalizer) ───────────────────────

function pickLang(obj: Record<string, string> | undefined, prefer = 'eng'): string | null {
  if (!obj || Object.keys(obj).length === 0) return null
  return obj[prefer] ?? Object.values(obj)[0] ?? null
}

function pickLangMulti(obj: Record<string, string[]> | undefined, prefer = 'eng', joiner = ', '): string | null {
  if (!obj || Object.keys(obj).length === 0) return null
  const arr = obj[prefer] ?? Object.values(obj)[0]
  return arr && arr.length > 0 ? arr.join(joiner) : null
}

function parseTedDate(str: string | undefined): string | null {
  if (!str) return null
  const clean = str.replace(/[+-]\d{2}:\d{2}$/, '')
  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ─── Claude query planner ─────────────────────────────────────────────────────

const PLAN_TOOL: Anthropic.Tool = {
  name: 'plan_search_filters',
  description: 'Choose CPV classification prefixes for a TED procurement search.',
  input_schema: {
    type: 'object' as const,
    properties: {
      cpv_prefixes: {
        type: 'array',
        items: { type: 'string' },
        description:
          '2-6 CPV code prefixes (2-5 digits each, no asterisk) covering what this company could deliver. ' +
          'Examples: 72 = IT services, 79 = business services, 45 = construction, 71 = engineering, ' +
          '73 = R&D, 33 = medical equipment, 48 = software packages, 80 = education, 85 = health services.',
      },
    },
    required: ['cpv_prefixes'],
  },
}

async function planCpvPrefixes(description: string): Promise<string[]> {
  // Small, fast model — this is a classification task, not analysis
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'plan_search_filters' },
    messages: [{
      role: 'user',
      content: `Company profile:\n${description.slice(0, 1500)}\n\nPick the CPV prefixes for tenders this company could plausibly bid on.`,
    }],
  })

  const toolUse = msg.content.find(b => b.type === 'tool_use')
  const prefixes = (toolUse?.type === 'tool_use'
    ? (toolUse.input as { cpv_prefixes?: unknown }).cpv_prefixes
    : null) as string[] | null

  const valid = (Array.isArray(prefixes) ? prefixes : [])
    .map(p => String(p).replace(/\D/g, ''))
    .filter(p => p.length >= 2 && p.length <= 5)
    .slice(0, 6)

  if (valid.length === 0) throw new Error('query planner returned no usable CPV prefixes')
  return valid
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface LiveCandidate {
  id: string
  title: string
  description: string | null
  buyer_name: string | null
  country: string
  cpv_codes: string[] | null
  estimated_value: number | null
  currency: string | null
  deadline: string | null
  publication_date: string
  url: string | null
  source: string
  distance: number
}

export interface LiveSearchResult {
  candidates: LiveCandidate[]
  totalOnTed: number      // TED's totalNoticeCount for the planned query
  cpvPrefixes: string[]
}

function ymdToday(): string {
  return new Date().toISOString().split('T')[0]!.replace(/-/g, '')
}

// Cosine on unit vectors (text-embedding-3-small is normalized) = dot product
function similarity(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

export async function liveTedSearch(
  sql: postgres.Sql,
  queryEmbedding: number[],
  description: string,
  country: string | undefined,
  limit: number,
  maxDistance: number
): Promise<LiveSearchResult> {
  // 1. Plan the expert query
  const cpvPrefixes = await planCpvPrefixes(description)
  const parts = [
    `classification-cpv IN (${cpvPrefixes.map(p => `${p}*`).join(' ')})`,
    `deadline-date-lot>=${ymdToday()}`,
    `NOT notice-type IN (${EXCLUDED_TYPES.join(' ')})`,
  ]
  if (country && country !== 'GBR') parts.push(`buyer-country=${country}`)
  const query = parts.join(' AND ')

  // 2. Fetch candidates — sequential pages through the queue
  const first = await tedSearch(query, 1)
  const raws: TedRawNotice[] = [...first.notices]
  const totalPages = Math.min(MAX_PAGES, Math.ceil(first.totalNoticeCount / 100))
  for (let page = 2; page <= totalPages; page++) {
    const next = await tedSearch(query, page)
    raws.push(...next.notices)
  }
  if (raws.length === 0) return { candidates: [], totalOnTed: first.totalNoticeCount, cpvPrefixes }

  const ids = raws.map(r => r['publication-number'])

  // 3. Hydrate from our DB where possible (normalized values, EUR conversion)
  const dbRows = await sql<(Omit<LiveCandidate, 'distance'> & { embedding: string | null })[]>`
    SELECT
      n.id, n.title, n.description, n.buyer_name, n.country, n.cpv_codes,
      n.estimated_value, n.currency,
      n.deadline::text, n.publication_date::text, n.url, n.source,
      ne.embedding::text AS embedding
    FROM notices n
    LEFT JOIN notice_embeddings ne ON ne.notice_id = n.id
    WHERE n.id = ANY(${ids})
  `
  const dbById = new Map(dbRows.map(r => [r.id, r]))

  // CPV labels enrich embed text the same way ingestion does
  const cpvLabels = new Map(
    (await sql<{ code: string; label: string }[]>`SELECT code, label FROM cpv_codes`)
      .map(r => [r.code, r.label])
  )

  // 4. Assemble candidates + figure out which ones need embedding
  type Pending = { candidate: Omit<LiveCandidate, 'distance'>; embedText: string; cached: number[] | null }
  const pending: Pending[] = []

  for (const raw of raws) {
    const id = raw['publication-number']
    const db = dbById.get(id)

    const candidate: Omit<LiveCandidate, 'distance'> = db ?? {
      id,
      title: pickLang(raw['notice-title']) ?? `Notice ${id}`,
      description:
        pickLang(raw['description-proc']) ??
        pickLangMulti(raw['description-lot'], 'eng', '\n'),
      buyer_name: pickLangMulti(raw['buyer-name']),
      country: raw['buyer-country']?.[0] ?? 'UNK',
      cpv_codes: [...new Set(raw['classification-cpv'] ?? [])],
      // Fresh-from-TED notices haven't been through FX normalization —
      // leave value unset rather than show a wrong number. The next
      // ingestion run fills it in.
      estimated_value: null,
      currency: null,
      deadline: parseTedDate(raw['deadline-date-lot']?.[0]),
      publication_date: parseTedDate(raw['publication-date']) ?? new Date().toISOString(),
      url: raw['links']?.html?.['ENG'] ?? `https://ted.europa.eu/en/notice/-/detail/${id}`,
      source: 'ted',
    }

    const cached = db?.embedding ? (JSON.parse(db.embedding) as number[]) : null
    const cpvText = (candidate.cpv_codes ?? []).map(c => cpvLabels.get(c) ?? c)
    const embedText = [
      candidate.title,
      candidate.description ?? '',
      cpvText.length > 0 ? `Categories: ${cpvText.join(', ')}` : '',
    ].filter(Boolean).join('\n').slice(0, 8000)

    pending.push({ candidate, embedText, cached })
  }

  // 5. One OpenAI batch for the misses
  const misses = pending.filter(p => !p.cached)
  const missVectors = await embedBatch(misses.map(m => m.embedText))
  misses.forEach((m, i) => { m.cached = missVectors[i] ?? null })

  // Warm the cache for misses whose notice row already exists (FK constraint)
  const warmable = misses.filter(m => m.cached && dbById.has(m.candidate.id))
  for (let i = 0; i < warmable.length; i += 20) {
    await Promise.all(warmable.slice(i, i + 20).map(m => sql`
      INSERT INTO notice_embeddings (notice_id, embedding, embedded_text)
      VALUES (${m.candidate.id}, ${`[${m.cached!.join(',')}]`}::vector, ${m.embedText})
      ON CONFLICT (notice_id) DO NOTHING
    `))
  }

  // 6. Rerank by cosine similarity, apply the same floor as the local arm
  const ranked = pending
    .filter(p => p.cached)
    .map(p => ({ ...p.candidate, distance: 1 - similarity(queryEmbedding, p.cached!) }))
    .filter(c => c.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)

  return { candidates: ranked, totalOnTed: first.totalNoticeCount, cpvPrefixes }
}
