// Normalizer
// Converts a raw Find a Tender OCDS release into our clean Notice schema.
// All values are in GBP — we convert to EUR using the ECB FX rate for GBP.

import type { FTRelease } from './find-tender-client.js'

export interface FTNormalizedNotice {
  id: string
  type: string
  title: string
  titleOriginal: null           // UK notices are always in English
  description: string | null
  language: string
  country: string               // ISO alpha-3 "GBR"
  buyerName: string | null
  buyerCountry: string          // "GBR"
  cpvCodes: string[]
  estimatedValue: number | null // converted to EUR
  originalValue: number | null  // GBP
  currency: string              // "GBP"
  deadline: Date | null
  publicationDate: Date
  url: string
  rawData: FTRelease
}

// Convert GBP → EUR using the provided rate (how many EUR per 1 GBP)
function gbpToEur(gbp: number, gbpRate: number): number {
  return Math.round(gbp * gbpRate)
}

// Extract best value from release: prefer top-level tender.value, fall back to sum of lots
function extractValue(release: FTRelease): { amount: number; currency: string } | null {
  const t = release.tender
  if (!t) return null

  if (t.value?.amount && t.value.amount > 0) return t.value

  if (t.lots && t.lots.length > 0) {
    const sum = t.lots.reduce((acc, l) => acc + (l.value?.amount ?? 0), 0)
    if (sum > 0) {
      const currency = t.lots[0]?.value?.currency ?? 'GBP'
      return { amount: sum, currency }
    }
  }

  return null
}

// Extract buyer party from parties array
function extractBuyer(release: FTRelease): { name: string | null; country: string } {
  const buyer = release.parties?.find(p => p.roles.includes('buyer'))
  return {
    name: buyer?.name ?? release.buyer?.name ?? null,
    country: 'GBR',
  }
}

// Extract CPV codes from classification + additionalClassifications
function extractCPV(release: FTRelease): string[] {
  const codes = new Set<string>()
  const t = release.tender
  if (!t) return []

  if (t.classification?.scheme === 'CPV') {
    codes.add(t.classification.id)
  }
  for (const ac of t.additionalClassifications ?? []) {
    if (ac.scheme === 'CPV') codes.add(ac.id)
  }
  // Also collect from lots
  for (const lot of t.lots ?? []) {
    // Lots don't directly carry CPV in the sample, but handle if present
  }

  return [...codes]
}

// Extract deadline: prefer tenderPeriod.endDate, fall back to awardPeriod.startDate
function extractDeadline(release: FTRelease): Date | null {
  const t = release.tender
  if (!t) return null
  const raw = t.tenderPeriod?.endDate ?? t.awardPeriod?.startDate
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Map OCDS tag to a human-readable type string
function mapType(tags: string[]): string {
  if (tags.includes('tender')) return 'cn-standard'       // contract notice
  if (tags.includes('award')) return 'can-standard'       // contract award notice
  if (tags.includes('planning')) return 'pin-standard'    // prior information notice
  return tags[0] ?? 'UNKNOWN'
}

export function normalizeRelease(
  release: FTRelease,
  gbpToEurRate: number   // EUR per 1 GBP
): FTNormalizedNotice | null {
  const id = `ft-${release.id}`   // prefix to avoid collision with TED IDs
  if (!release.date) return null

  const publicationDate = new Date(release.date)
  if (isNaN(publicationDate.getTime())) return null

  const title = release.tender?.title ?? `UK Tender ${release.id}`
  const description = release.tender?.description ?? release.description ?? null

  const val = extractValue(release)
  const originalValue = val?.amount ?? null
  const currency = val?.currency ?? 'GBP'
  const estimatedValue = originalValue != null
    ? gbpToEur(originalValue, gbpToEurRate)
    : null

  const { name: buyerName } = extractBuyer(release)
  const cpvCodes = extractCPV(release)
  const deadline = extractDeadline(release)
  const type = mapType(release.tag ?? [])

  // Canonical URL for the notice on Find a Tender
  const noticeRef = release.id  // e.g. "001060-2021"
  const url = `https://www.find-tender.service.gov.uk/Notice/${noticeRef}`

  return {
    id,
    type,
    title,
    titleOriginal: null,
    description,
    language: 'ENG',
    country: 'GBR',
    buyerName,
    buyerCountry: 'GBR',
    cpvCodes,
    estimatedValue,
    originalValue,
    currency,
    deadline,
    publicationDate,
    url,
    rawData: release,
  }
}
