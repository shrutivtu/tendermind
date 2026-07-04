// Ingestion Worker
// Pulls recent EU tender notices from TED REST API v3,
// normalises them, generates embeddings, and upserts into Supabase.
// Run: every 6 hours via cron (or manually for first load)

import postgres from 'postgres'
import {
  searchNotices,
  buildRecentNoticesQuery,
  NOTICE_FIELDS,
} from './ted-client.js'
import { normalizeNotice } from './normalizer.js'
import { buildEmbedText, batchEmbed } from './embedder.js'
import { fetchECBRates, type FxRates } from './fx-rates.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const sql = postgres(DATABASE_URL, { ssl: 'require' })

const DAYS_BACK = Number(process.env.DAYS_BACK ?? 2)

// ─── Fetch CPV labels for enrichment ─────────────────────────────────────────

async function getCPVLabels(): Promise<Map<string, string>> {
  const rows = await sql<{ code: string; label: string }[]>`
    SELECT code, label FROM cpv_codes
  `
  return new Map(rows.map(r => [r.code, r.label]))
}

// ─── Upsert notices ───────────────────────────────────────────────────────────

async function upsertNotices(notices: ReturnType<typeof normalizeNotice>[]): Promise<void> {
  const valid = notices.filter(Boolean) as NonNullable<ReturnType<typeof normalizeNotice>>[]
  if (valid.length === 0) return

  await sql`
    INSERT INTO notices (
      id, type, title, title_original, description, language,
      country, buyer_name, buyer_country, cpv_codes,
      estimated_value, original_value, currency,
      deadline, publication_date, url, raw_data, source
    )
    VALUES ${sql(valid.map(n => [
      n.id, n.type, n.title, n.titleOriginal, n.description, n.language,
      n.country, n.buyerName, n.buyerCountry, n.cpvCodes,
      n.estimatedValue, n.originalValue, n.currency,
      n.deadline, n.publicationDate, n.url,
      JSON.stringify(n.rawData),
      'ted',
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

// ─── Upsert embeddings ────────────────────────────────────────────────────────

async function upsertEmbeddings(
  results: Awaited<ReturnType<typeof batchEmbed>>
): Promise<void> {
  if (results.length === 0) return

  for (const r of results) {
    const vectorStr = `[${r.embedding.join(',')}]`
    await sql`
      INSERT INTO notice_embeddings (notice_id, embedding, embedded_text)
      VALUES (${r.noticeId}, ${vectorStr}::vector, ${r.embeddedText})
      ON CONFLICT (notice_id) DO UPDATE SET
        embedding     = EXCLUDED.embedding,
        embedded_text = EXCLUDED.embedded_text,
        created_at    = now()
    `
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Ingestion Worker ===')
  console.log(`Fetching notices from last ${DAYS_BACK} days...\n`)
  const start = Date.now()

  // 1. Fetch ECB exchange rates once — reused for all notices this run
  const fxRates: FxRates = await fetchECBRates()
  console.log()

  // 2. Load CPV labels
  const cpvLabels = await getCPVLabels()
  console.log(`✓ Loaded ${cpvLabels.size} CPV labels`)

  // 3. Fetch from TED API
  const query = buildRecentNoticesQuery(DAYS_BACK)
  console.log(`  Query: ${query}`)

  let page = 1
  let totalFetched = 0
  let totalUpserted = 0

  while (true) {
    process.stdout.write(`\r  Fetching page ${page}...`)

    const response = await searchNotices({
      query,
      fields: NOTICE_FIELDS,
      page,
      limit: 100,
    })

    if (response.notices.length === 0) break

    // 4. Normalize — pass FX rates so values are converted to EUR
    const normalized = response.notices
      .map(r => normalizeNotice(r, fxRates))
      .filter(Boolean) as NonNullable<ReturnType<typeof normalizeNotice>>[]

    // 5. Upsert notices
    await upsertNotices(normalized)

    // 6. Build embed inputs
    const embedInputs = normalized.map(n => ({
      noticeId: n.id,
      text: buildEmbedText(
        n.title,
        n.description,
        n.cpvCodes.map(code => cpvLabels.get(code) ?? code)
      ),
    }))

    // 7. Generate + upsert embeddings
    const embedResults = await batchEmbed(embedInputs)
    await upsertEmbeddings(embedResults)

    totalFetched += response.notices.length
    totalUpserted += normalized.length

    const totalPages = Math.ceil(response.totalNoticeCount / 100)
    process.stdout.write(
      `\r  ✓ Page ${page}/${totalPages} — ${totalFetched} notices fetched`
    )

    if (page >= totalPages) break
    page++

    await new Promise(r => setTimeout(r, 300))
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM notices`

  console.log(`\n\n✅ Done in ${elapsed}s`)
  console.log(`   Upserted: ${totalUpserted} notices`)
  console.log(`   Total in DB: ${count} notices`)

  await sql.end()
}

main().catch(err => {
  console.error('\n❌ Ingestion failed:', err.message)
  process.exit(1)
})
