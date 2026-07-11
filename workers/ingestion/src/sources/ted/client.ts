// TED REST API v3 Client
// Docs: https://api.ted.europa.eu/swagger-ui/index.html
// No API key required for basic search (public endpoint)
// NOTE: Actual response shapes verified from live API — differ from Swagger docs.

import { withRetry } from '../../retry.js'

const TED_API_BASE = 'https://api.ted.europa.eu/v3'

// ─── Types (verified against live API response) ────────────────────────────────

export interface TEDSearchParams {
  query: string       // TED expert query language e.g. "PD>=20260607"
  fields: string[]    // which fields to return
  page?: number
  limit?: number      // max 100
}

export interface TEDNoticeRaw {
  'publication-number': string
  'notice-type'?: string                         // plain string e.g. "can-standard"
  'notice-title'?: Record<string, string>        // { eng: "...", deu: "..." }
  'description-proc'?: Record<string, string>    // procedure description { fra: "..." }
  'description-lot'?: Record<string, string[]>   // per-lot descriptions { fra: ["lot1", "lot2"] }
  'buyer-name'?: Record<string, string[]>        // { ron: ["Buyer A", "Buyer B"] }
  'buyer-country'?: string[]                     // ["ROU", "DEU"]
  'classification-cpv'?: string[]                // ["33696500", "45000000"] — codes only
  'estimated-value-lot'?: string[]               // ["3276000", "7358400"] — amounts as strings
  'deadline-date-lot'?: string[]                 // ["2026-07-01+02:00", ...]
  'publication-date'?: string                    // "2026-06-08+02:00"
  'links'?: {
    xml?: Record<string, string>                 // { MUL: "url" }
    pdf?: Record<string, string>                 // { ENG: "url", ... } uppercase lang codes
    html?: Record<string, string>                // { ENG: "url", ... }
    htmlDirect?: Record<string, string>          // { ENG: "url", ... }
  }
}

export interface TEDSearchResponse {
  notices: TEDNoticeRaw[]
  totalNoticeCount: number
  iterationNextToken: string | null
  timedOut: boolean
}

// ─── Client ───────────────────────────────────────────────────────────────────

export async function searchNotices(params: TEDSearchParams): Promise<TEDSearchResponse> {
  const body = {
    query: params.query,
    fields: params.fields,
    page: params.page ?? 1,
    limit: params.limit ?? 50,
  }

  return withRetry('TED search', async () => {
    const response = await fetch(`${TED_API_BASE}/notices/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`TED API error ${response.status}: ${text}`)
    }

    return response.json() as Promise<TEDSearchResponse>
  })
}

// ─── Query builders ───────────────────────────────────────────────────────────

// Format date as YYYYMMDD for TED query syntax
function tedDate(daysBack: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date.toISOString().split('T')[0].replace(/-/g, '')  // YYYYMMDD
}

// Award/announcement types — already-decided contracts, not biddable.
// The product searches live tenders only; award intel comes from the
// award-sync worker (SPARQL), not this pipeline.
export const EXCLUDED_NOTICE_TYPES = ['can-standard', 'can-social', 'can-desg', 'can-modif', 'veat']

// Biddable notices published in the last N days.
// Award types are excluded at the API — no point downloading ~half the feed
// just to skip it. (TD=3 old-form codes don't match eForms; date filter +
// type negation catches everything we want.)
export function buildRecentNoticesQuery(daysBack: number = 2): string {
  return `PD>=${tedDate(daysBack)} AND NOT notice-type IN (${EXCLUDED_NOTICE_TYPES.join(' ')})`
}

// Fields we want for each notice — verified against live API response
export const NOTICE_FIELDS = [
  'publication-number',
  'notice-type',
  'notice-title',
  'description-proc',
  'description-lot',
  'buyer-name',
  'buyer-country',
  'classification-cpv',
  'estimated-value-lot',
  'deadline-date-lot',
  'publication-date',
  'links',
]
