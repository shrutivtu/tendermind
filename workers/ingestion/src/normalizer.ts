// Normalizer
// Converts raw TED API v3 response into our clean Notice schema.
// All shapes verified against live API — they differ from Swagger docs.
//
// Currency handling:
//   The TED API does NOT include currency in the estimated-value-lot field.
//   We derive currency from the buyer's country (non-eurozone EU countries use
//   their national currency). Values are converted to EUR at ingestion time
//   using ECB daily reference rates.

import type { TEDNoticeRaw } from './ted-client.js'
import { currencyForCountry, toEur, type FxRates } from './fx-rates.js'

export interface NormalizedNotice {
  id: string
  type: string
  title: string
  titleOriginal: string | null
  description: string | null
  language: string
  country: string
  buyerName: string | null
  buyerCountry: string | null
  cpvCodes: string[]
  estimatedValue: number | null     // always EUR (converted)
  originalValue: number | null      // raw value in original currency
  currency: string | null           // original currency code e.g. "PLN", "EUR"
  deadline: Date | null
  publicationDate: Date
  url: string
  rawData: TEDNoticeRaw
}

// Pick preferred language from { eng: "...", deu: "..." }
function pickLang(
  obj: Record<string, string> | undefined,
  prefer = 'eng'
): { value: string; lang: string } | null {
  if (!obj || Object.keys(obj).length === 0) return null
  if (obj[prefer]) return { value: obj[prefer], lang: prefer }
  const first = Object.entries(obj)[0]
  return first ? { value: first[1], lang: first[0] } : null
}

// Pick from { ron: ["Buyer A", "Buyer B"] } — join multiple buyers
function pickLangMulti(
  obj: Record<string, string[]> | undefined,
  prefer = 'eng'
): string | null {
  if (!obj || Object.keys(obj).length === 0) return null
  const arr = obj[prefer] ?? Object.values(obj)[0]
  if (!arr || arr.length === 0) return null
  return arr.join(', ')
}

// Parse TED date strings like "2026-06-08+02:00" or "20260608"
function parseTEDDate(str: string | undefined): Date | null {
  if (!str) return null
  const clean = str.replace(/[+-]\d{2}:\d{2}$/, '')
  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d
}

// Sum all lot values (estimated-value-lot is an array of amount strings)
function sumValues(strs: string[] | undefined): number | null {
  if (!strs || strs.length === 0) return null
  const nums = strs.map(s => parseFloat(s)).filter(n => !isNaN(n) && n > 0)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0)
}

export function normalizeNotice(raw: TEDNoticeRaw, fxRates: FxRates): NormalizedNotice | null {
  const id = raw['publication-number']
  if (!id) return null

  const publicationDate = parseTEDDate(raw['publication-date'])
  if (!publicationDate) return null

  // Title: prefer English
  const titlePick = pickLang(raw['notice-title'])
  const title = titlePick?.value ?? `Notice ${id}`
  const lang = titlePick?.lang ?? 'unk'

  // Buyer name: multi-value per language
  const buyerName = pickLangMulti(raw['buyer-name'])

  // CPV codes: deduplicate (API often repeats per lot)
  const cpvCodes = [...new Set(raw['classification-cpv'] ?? [])]

  // Country: first entry (ISO 3166-1 alpha-3)
  const country = raw['buyer-country']?.[0] ?? 'UNK'

  // Currency: derived from buyer country
  // Non-eurozone EU countries use their national currency.
  // All eurozone countries (DEU, FRA, ESP, ITA, NLD, BEL, AUT, PRT, FIN, IRL,
  // GRC, LUX, MLT, CYP, SVK, SVN, EST, LVA, LTU, HRV) default to EUR.
  const currency = currencyForCountry(country)

  // Estimated value: sum all lot values, then convert to EUR
  const originalValue = sumValues(raw['estimated-value-lot'])
  const estimatedValue = originalValue != null
    ? Math.round(toEur(originalValue, currency, fxRates))
    : null

  // Deadline: first lot deadline date
  const deadline = parseTEDDate(raw['deadline-date-lot']?.[0])

  // Notice type: plain string e.g. "can-standard", "cn-standard"
  const type = raw['notice-type'] ?? 'UNKNOWN'

  // URL: prefer English HTML link
  const url =
    raw['links']?.html?.['ENG'] ??
    raw['links']?.htmlDirect?.['ENG'] ??
    `https://ted.europa.eu/en/notice/-/detail/${id}`

  return {
    id,
    type,
    title,
    titleOriginal: lang !== 'eng' ? title : null,
    description: null,
    language: lang.toUpperCase(),
    country,
    buyerName,
    buyerCountry: country,
    cpvCodes,
    estimatedValue,    // EUR (converted)
    originalValue,     // original currency amount
    currency,          // e.g. "PLN", "EUR"
    deadline,
    publicationDate,
    url,
    rawData: raw,
  }
}
