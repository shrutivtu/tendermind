// Scout Agent
// Given a company description, finds the most relevant EU tenders.
// Uses: OpenAI embedding → pgvector similarity search → Claude analysis with tool use.
// Results are streamed via SSE. On completion, saves session to DB and fires Analyst
// as a background job (no await — browser can navigate away immediately).

import Anthropic from '@anthropic-ai/sdk'
import postgres from 'postgres'
import { embed } from '../lib/embedder.js'
import { runAnalystAgent } from './analyst.js'
import type { RequestContext } from '../lib/auth.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoutInput {
  description: string
  country?: string
  cpvCodes?: string[]
  maxResults?: number
}

export type AgentEvent =
  | { type: 'status';     message: string }
  | { type: 'candidates'; count: number; totalSearched: number }
  | { type: 'thinking';   text: string }
  | { type: 'match';      notice: MatchedNotice }
  | { type: 'session_id'; id: string }         // emitted once session row created
  | { type: 'done';       totalMatches: number }
  | { type: 'error';      message: string }

export interface MatchedNotice {
  id: string
  title: string
  buyerName: string | null
  country: string
  cpvCodes: string[]
  estimatedValue: number | null
  currency: string | null
  deadline: string | null
  publicationDate: string
  url: string
  source: string            // 'ted' | 'find-tender'
  score: number
  reason: string
  fit: 'perfect' | 'good' | 'weak'
}

// ─── Vector search ────────────────────────────────────────────────────────────

interface RawNoticeRow {
  id: string
  title: string
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

async function vectorSearch(
  sql: postgres.Sql,
  queryEmbedding: number[],
  country?: string,
  cpvCodes?: string[],
  limit = 25
): Promise<RawNoticeRow[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`
  const countryFilter = country ? sql`AND n.country = ${country}` : sql``
  const cpvFilter =
    cpvCodes && cpvCodes.length > 0
      ? sql`AND n.cpv_codes && ${sql.array(cpvCodes)}`
      : sql``

  return sql<RawNoticeRow[]>`
    SELECT
      n.id, n.title, n.buyer_name, n.country, n.cpv_codes,
      n.estimated_value, n.currency,
      n.deadline::text, n.publication_date::text, n.url, n.source,
      ne.embedding <=> ${vectorStr}::vector AS distance
    FROM notices n
    JOIN notice_embeddings ne ON ne.notice_id = n.id
    ${countryFilter}
    ${cpvFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

const RECORD_MATCH_TOOL: Anthropic.Tool = {
  name: 'record_match',
  description: 'Record a tender that is relevant to the company.',
  input_schema: {
    type: 'object' as const,
    properties: {
      notice_id: { type: 'string' },
      score:     { type: 'number',  description: 'Relevance score 0-100' },
      fit:       { type: 'string',  enum: ['perfect', 'good', 'weak'] },
      reason:    { type: 'string',  description: 'Why this tender matches (1-2 sentences, specific)' },
    },
    required: ['notice_id', 'score', 'fit', 'reason'],
  },
}

function buildScoutPrompt(description: string, candidates: RawNoticeRow[]): string {
  const noticeList = candidates.map((n, i) =>
    `[${i + 1}] ID: ${n.id}
     Title: ${n.title}
     Buyer: ${n.buyer_name ?? 'Unknown'} | Country: ${n.country}
     CPV codes: ${n.cpv_codes?.join(', ') || 'None'}
     Estimated value: ${n.estimated_value ? `€${n.estimated_value.toLocaleString()}` : 'Not specified'}
     Deadline: ${n.deadline ? n.deadline.split('T')[0] : 'Not specified'}`
  ).join('\n\n')

  return `You are a procurement intelligence agent helping an SME find relevant EU public tenders.

COMPANY PROFILE:
${description}

CANDIDATE TENDERS (ranked by semantic similarity):
${noticeList}

TASK:
Review these tenders and identify which ones genuinely match the company's capabilities.
For each relevant match, call record_match with score (0-100), fit level, and a specific reason.
Only report tenders with score >= 50. Be selective — quality over quantity.`
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function createSession(
  sql: postgres.Sql,
  description: string,
  country: string | undefined,
  ctx: RequestContext
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO search_sessions (
      user_id,
      organization_id,
      anonymous_session_id,
      expires_at,
      company_description,
      country_filter,
      status
    )
    VALUES (
      ${ctx.user?.id ?? null},
      ${ctx.user?.organizationId ?? null},
      ${ctx.user ? null : ctx.anonymousSessionId},
      ${ctx.user ? null : sql`NOW() + INTERVAL '72 hours'`},
      ${description},
      ${country ?? null},
      'scout_running'
    )
    RETURNING id
  `
  return rows[0].id
}

async function saveScoutResults(
  sql: postgres.Sql,
  sessionId: string,
  matches: MatchedNotice[]
): Promise<void> {
  const topScore = matches.length > 0 ? Math.max(...matches.map(m => m.score)) : null
  await sql`
    UPDATE search_sessions SET
      status        = 'analyst_running',
      scout_matches = ${sql.json(matches as never)},
      match_count   = ${matches.length},
      top_score     = ${topScore}
    WHERE id = ${sessionId}
  `
}

async function markSessionError(
  sql: postgres.Sql,
  sessionId: string,
  message: string
): Promise<void> {
  await sql`
    UPDATE search_sessions SET
      status        = 'error',
      error_message = ${message}
    WHERE id = ${sessionId}
  `
}

// ─── Main agent function ──────────────────────────────────────────────────────

export async function runScoutAgent(
  input: ScoutInput,
  sql: postgres.Sql,
  onEvent: (event: AgentEvent) => void,
  ctx: RequestContext
): Promise<void> {
  const maxResults = input.maxResults ?? 10

  // Create DB session immediately so we have an ID to emit
  const sessionId = await createSession(sql, input.description, input.country, ctx)
  onEvent({ type: 'session_id', id: sessionId })

  try {
    // Phase 1: Embed
    onEvent({ type: 'status', message: 'Embedding company profile...' })
    const queryEmbedding = await embed(input.description)

    // Phase 2: Vector search
    onEvent({ type: 'status', message: 'Searching 3,500+ EU tenders for semantic matches...' })
    const candidates = await vectorSearch(sql, queryEmbedding, input.country, input.cpvCodes, 25)

    onEvent({ type: 'candidates', count: candidates.length, totalSearched: 3567 })

    if (candidates.length === 0) {
      await saveScoutResults(sql, sessionId, [])
      onEvent({ type: 'done', totalMatches: 0 })
      return
    }

    // Phase 3: Claude analysis
    onEvent({ type: 'status', message: 'Analysing matches with Claude AI...' })

    const prompt = buildScoutPrompt(input.description, candidates)
    const noticeMap = new Map(candidates.map(n => [n.id, n]))
    const matches: MatchedNotice[] = []

    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      tools: [RECORD_MATCH_TOOL],
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onEvent({ type: 'thinking', text: event.delta.text })
      }

      if (
        event.type === 'content_block_stop' &&
        // @ts-ignore
        event.content_block?.type === 'tool_use' &&
        // @ts-ignore
        event.content_block?.name === 'record_match'
      ) {
        // @ts-ignore
        const ti = event.content_block.input as { notice_id: string; score: number; fit: 'perfect'|'good'|'weak'; reason: string }
        const raw = noticeMap.get(ti.notice_id)
        if (raw && matches.length < maxResults) {
          const match: MatchedNotice = {
            id: raw.id, title: raw.title, buyerName: raw.buyer_name,
            country: raw.country, cpvCodes: raw.cpv_codes ?? [],
            estimatedValue: raw.estimated_value, currency: raw.currency,
            deadline: raw.deadline, publicationDate: raw.publication_date,
            url: raw.url ?? `https://ted.europa.eu/en/notice/-/detail/${raw.id}`,
            source: raw.source ?? 'ted',
            score: ti.score, reason: ti.reason, fit: ti.fit,
          }
          matches.push(match)
          onEvent({ type: 'match', notice: match })
        }
      }
    }

    // Fallback: final message tool calls
    const finalMessage = await stream.finalMessage()
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use' && block.name === 'record_match') {
        const ti = block.input as { notice_id: string; score: number; fit: 'perfect'|'good'|'weak'; reason: string }
        if (!matches.find(m => m.id === ti.notice_id)) {
          const raw = noticeMap.get(ti.notice_id)
          if (raw && matches.length < maxResults) {
            const match: MatchedNotice = {
              id: raw.id, title: raw.title, buyerName: raw.buyer_name,
              country: raw.country, cpvCodes: raw.cpv_codes ?? [],
              estimatedValue: raw.estimated_value, currency: raw.currency,
              deadline: raw.deadline, publicationDate: raw.publication_date,
              url: raw.url ?? `https://ted.europa.eu/en/notice/-/detail/${raw.id}`,
              source: raw.source ?? 'ted',
              score: ti.score, reason: ti.reason, fit: ti.fit,
            }
            matches.push(match)
            onEvent({ type: 'match', notice: match })
          }
        }
      }
    }

    // Save Scout results to DB, update status → analyst_running
    await saveScoutResults(sql, sessionId, matches)
    onEvent({ type: 'done', totalMatches: matches.length })

    // Fire Analyst in background — intentionally NOT awaited.
    // The SSE connection closes here; Analyst writes directly to DB.
    if (matches.length > 0) {
      runAnalystAgent(
        {
          sessionId,
          companyDescription: input.description,
          matches: matches.map(m => ({
            id: m.id, title: m.title, country: m.country,
            cpvCodes: m.cpvCodes, estimatedValue: m.estimatedValue,
            currency: m.currency, deadline: m.deadline,
            buyerName: m.buyerName, scoutScore: m.score,
            scoutReason: m.reason, fit: m.fit,
          })),
        },
        sql
      ).catch(err => {
        console.error(`[Analyst] Background job failed for session ${sessionId}:`, err)
      })
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await markSessionError(sql, sessionId, message).catch(() => {})
    onEvent({ type: 'error', message })
  }
}
