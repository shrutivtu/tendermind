// Find a Tender (UK) OCDS API Client
// Docs: https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages
// Public read endpoint — no API key required.
// Note: the eSender submission API requires a CDP-Api-Key, but OCDS data is open.

const FT_API_BASE = 'https://www.find-tender.service.gov.uk/api/1.0'

// ─── Types (from OCDS release package schema) ─────────────────────────────────

export interface FTParty {
  id: string
  name: string
  roles: string[]
  address?: {
    streetAddress?: string
    locality?: string
    region?: string
    postalCode?: string
    countryName?: string
  }
  contactPoint?: {
    name?: string
    email?: string
    telephone?: string
    url?: string
  }
}

export interface FTLot {
  id: string
  description?: string
  value?: { amount: number; currency: string }
  contractPeriod?: { durationInDays?: number; startDate?: string; endDate?: string }
  status?: string
}

export interface FTTender {
  id?: string
  title?: string
  status?: string
  description?: string
  classification?: { scheme: string; id: string; description: string }
  additionalClassifications?: Array<{ scheme: string; id: string; description: string }>
  mainProcurementCategory?: string
  value?: { amount: number; currency: string }
  lots?: FTLot[]
  awardPeriod?: { startDate?: string; endDate?: string }
  tenderPeriod?: { endDate?: string }
  submissionMethod?: string[]
  documents?: Array<{ documentType: string; id: string; url?: string }>
  coveredBy?: string[]
}

export interface FTRelease {
  ocid: string
  id: string        // notice ID e.g. "001060-2021"
  date: string      // ISO timestamp
  tag: string[]     // ["tender"] | ["planning"] | ["award"]
  language?: string
  description?: string
  initiationType?: string
  tender?: FTTender
  parties?: FTParty[]
  buyer?: { id: string; name: string }
}

export interface FTReleasePackage {
  uri?: string
  publishedDate?: string
  releases: FTRelease[]
  links?: {
    next?: string   // cursor URL for next page
  }
}

export interface FTSearchParams {
  updatedFrom?: string    // YYYY-MM-DDTHH:MM:SS
  updatedTo?: string
  stages?: string         // e.g. "tender"
  limit?: number          // max 100, default 100
  cursor?: string
}

// ─── Client ───────────────────────────────────────────────────────────────────

export async function fetchReleasePackage(params: FTSearchParams = {}): Promise<FTReleasePackage> {
  const url = new URL(`${FT_API_BASE}/ocdsReleasePackages`)

  if (params.updatedFrom)  url.searchParams.set('updatedFrom', params.updatedFrom)
  if (params.updatedTo)    url.searchParams.set('updatedTo', params.updatedTo)
  if (params.stages)       url.searchParams.set('stages', params.stages)
  if (params.limit != null) url.searchParams.set('limit', String(params.limit))
  if (params.cursor)       url.searchParams.set('cursor', params.cursor)

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 10)
    console.warn(`  ⚠️  Rate limited — waiting ${retryAfter}s`)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return fetchReleasePackage(params)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Find a Tender API error ${response.status}: ${text}`)
  }

  return response.json() as Promise<FTReleasePackage>
}

// ─── Query helpers ────────────────────────────────────────────────────────────

// ISO timestamp for N days ago: "YYYY-MM-DDTHH:MM:SS"
export function isoTimestamp(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().split('.')[0]  // strip milliseconds
}
