// Find a Tender Ingestion Worker
// Pulls recent UK tender notices from the Find a Tender OCDS API,
// normalises them, generates embeddings, and upserts into Supabase.
// Run: every 6 hours via cron (alongside the TED ingestion worker)
//
// API: GET https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages
// No API key required. Rate limited — retries automatically on 429.

import postgres from 'postgres'
import OpenAI from 'openai'
import {
  fetchReleasePackage,
  isoTimestamp,
  type FTRelease,
} from './find-tender-client.js'
import { normalizeRelease, type FTNormalizedNotice } from './normalizer.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

const DATABASE_URL  = process.env.DATABASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!DATABASE_URL)  throw new Error('DATABASE_URL is required')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const sql    = postgres(DATABASE_URL, { ssl: 'require' })
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const DAYS_BACK  = Number(process.env.DAYS_BACK  ?? 2)
const EMBED_MODEL = 'text-embedding-3-small'
const MAX_BATCH   = 100

// ─── Fetch GBP→EUR rate from ECB ─────────────────────────────────────────────
// ECB publishes EUR-based rates: GBP rate means "1 EUR = X GBP"
// We need "1 GBP = Y EUR" so we invert it.

async function fetchGBPRate(): Promise<number> {
  try {
    const res = await fetch(
      'https://data-api.ecb.europa.eu/service/data/EXR/D.GBP.EUR.SP00.A?lastNObservations=1&format=csvdata'
    )
    if (!res.ok) throw new Error(`ECB responded ${res.status}`)
    const text = await res.text()

    // CSV: last line has the rate in column 7 (0-indexed)
    const lines = text.trim().split('\n').filter(l => !l.startsWith('KEY'))
    const lastLine = lines[lines.length - 1]
    if (!lastLine) throw new Error('Empty ECB response')

    const cols = lastLine.split(',')
    const rate = parseFloat(cols[6] ?? '')  // OBS_VALUE
    if (isNaN(rate) || rate <= 0) throw new Error(`Bad rate: ${cols[6]}`)

    // ECB rate: 1 EUR = rate GBP → invert to get 1 GBP = 1/rate EUR
    const eurPerGBP = 1 / rate
    console.log(`✓ GBP→EUR rate: 1 GBP = ${eurPerGBP.toFixed(4)} EUR (ECB)`)
    return eurPerGBP
  } catch (err) {
    console.warn(`⚠️  ECB rate fetch failed (${(err as Error).message}), using fallback 1.18`)
    return 1.18   // safe fallback
  }
}

// ─── CPV labels ───────────────────────────────────────────────────────────────

async function getCPVLabels(): Promise<Map<string, string>> {
  const rows = await sql<{ code: string; label: string }[]>`
    SELECT code, label FROM cpv_codes
  `
  return new Map(rows.map(r => [r.code, r.label]))
}

// ─── Upsert notices ───────────────────────────────────────────────────────────

async function upsertNotices(notices: FTNormalizedNotice[]): Promise<void> {
  if (notices.length === 0) return

  await sql`
    INSERT INTO notices (
      id, type, title, title_original, description, language,
      country, buyer_name, buyer_country, cpv_codes,
      estimated_value, original_value, currency,
      deadline, publication_date, url, raw_data, source
    )
    VALUES ${sql(notices.map(n => [
      n.id, n.type, n.title, n.titleOriginal, n.description, n.language,
      n.country, n.buyerName, n.buyerCountry, n.cpvCodes,
      n.estimatedValue, n.originalValue, n.currency,
      n.deadline, n.publicationDate, n.url,
      JSON.stringify(n.rawData),
      'find-tender',
    ]))}
    ON CONFLICT (id) DO UPDATE SET
      title           = EXCLUDED.title,
      description     = EXCLUDED.description,
      cpv_codes       = EXCLUDED.cpv_codes,
      estimated_value = EXCLUDED.estimated_value,
      original_value  = EXCLUDED.original_value,
      currency        = EXCLUDED.currency,
      deadline        = EXCLUDED.deadline,
      source          = EXCLUDED.source,
      updated_at      = now()
  `
}

// ─── Build + upsert embeddings ────────────────────────────────────────────────

function buildEmbedText(n: FTNormalizedNotice, cpvLabels: Map<string, string>): string {
  const cpvPart = n.cpvCodes
    .map(c => cpvLabels.get(c) ?? c)
    .join(', ')
  return [n.title, n.description, cpvPart].filter(Boolean).join('\n\n')
}

async function upsertEmbeddings(
  items: Array<{ noticeId: string; text: string }>
): Promise<void> {
  if (items.length === 0) return

  // Batch OpenAI calls in chunks of MAX_BATCH
  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const chunk = items.slice(i, i + MAX_BATCH)
    const resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: chunk.map(c => c.text),
    })

    for (let j = 0; j < chunk.length; j++) {
      const embedding = resp.data[j]?.embedding
      if (!embedding) continue

      const vectorStr = `[${embedding.join(',')}]`
      await sql`
        INSERT INTO notice_embeddings (notice_id, embedding, embedded_text)
        VALUES (${chunk[j]!.noticeId}, ${vectorStr}::vector, ${chunk[j]!.text})
        ON CONFLICT (notice_id) DO UPDATE SET
          embedding     = EXCLUDED.embedding,
          embedded_text = EXCLUDED.embedded_text,
          created_at    = now()
      `
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Find a Tender Ingestion Worker ===')
  console.log(`Fetching notices from last ${DAYS_BACK} days...\n`)
  const start = Date.now()

  // 1. Exchange rate + CPV labels
  const gbpToEurRate = await fetchGBPRate()
  const cpvLabels    = await getCPVLabels()
  console.log(`✓ Loaded ${cpvLabels.size} CPV labels`)

  // 2. Paginate through the API
  const updatedFrom = isoTimestamp(DAYS_BACK)
  console.log(`  Fetching releases updated since ${updatedFrom}\n`)

  let cursor: string | undefined
  let page = 1
  let totalFetched   = 0
  let totalUpserted  = 0

  while (true) {
    process.stdout.write(`\r  Fetching page ${page}...`)

    const pkg = await fetchReleasePackage({
      updatedFrom,
      stages: 'tender',       // active opportunities only
      limit: 100,
      cursor,
    })

    const releases: FTRelease[] = pkg.releases ?? []
    if (releases.length === 0) break

    // 3. Normalize
    const normalized = releases
      .map(r => normalizeRelease(r, gbpToEurRate))
      .filter(Boolean) as FTNormalizedNotice[]

    // 4. Upsert notices
    await upsertNotices(normalized)

    // 5. Build embed inputs and upsert embeddings
    const embedInputs = normalized.map(n => ({
      noticeId: n.id,
      text: buildEmbedText(n, cpvLabels),
    }))
    await upsertEmbeddings(embedInputs)

    totalFetched  += releases.length
    totalUpserted += normalized.length

    process.stdout.write(
      `\r  ✓ Page ${page} — ${totalFetched} fetched, ${totalUpserted} upserted`
    )

    // Pagination: Find a Tender uses a cursor in links.next URL
    const nextUrl = pkg.links?.next
    if (!nextUrl) break

    // Extract cursor token from next URL query param
    const nextCursor = new URL(nextUrl).searchParams.get('cursor')
    if (!nextCursor) break

    cursor = nextCursor
    page++

    // Polite delay between pages
    await new Promise(r => setTimeout(r, 500))
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const [{ count }] = await sql<[{ count: string }]>`
    SELECT COUNT(*) as count FROM notices WHERE source = 'find-tender'
  `

  console.log(`\n\n✅ Done in ${elapsed}s`)
  console.log(`   Upserted this run: ${totalUpserted} notices`)
  console.log(`   Total UK notices in DB: ${count}`)

  await sql.end()
}

main().catch(err => {
  console.error('\n❌ Find a Tender ingestion failed:', err.message)
  process.exit(1)
})
