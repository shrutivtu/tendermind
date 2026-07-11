// One-off backfill: fetch descriptions for existing live EU notices and
// re-embed them with the enriched text.
//
// Before Phase 0 the TED normalizer stored description = null, so the whole
// EU corpus was embedded on title + CPV labels only. This script:
//   1. Finds live TED notices with NULL description
//   2. Fetches their descriptions in batches of 50 via
//      `publication-number IN (...)` — sequential, ~300ms apart (TED rate
//      limits hard on bursts; NEVER parallelize TED calls)
//   3. Updates notices.description
//   4. Re-embeds those notices (upsertEmbeddings overwrites in place)
//
// Resumable: only touches rows where description IS NULL, so re-running
// continues where it left off.
//
// Run (from workers/ingestion):
//   npx tsx --env-file=../../.env src/backfill-descriptions.ts
//   MAX_BATCHES=2 ... for a smoke test

import postgres from 'postgres'
import { searchNotices } from './sources/ted/client.js'
import { pickLang, pickLangMulti } from './sources/ted/normalizer.js'
import { buildEmbedText, batchEmbed } from './embedder.js'
import { getCPVLabels, upsertEmbeddings } from './pipeline.js'

const DATABASE_URL = process.env.DATABASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const sql = postgres(DATABASE_URL, { ssl: 'require' })

const BATCH = 50
const MAX_BATCHES = Number(process.env.MAX_BATCHES ?? 0)

interface TargetRow {
  id: string
  title: string
  cpv_codes: string[] | null
}

async function main() {
  console.log('=== Description backfill ===')
  const cpvLabels = await getCPVLabels(sql)

  // Live notices only — matches the Scout's search window; expired notices
  // are never searched, so re-embedding them would be wasted spend.
  const targets = await sql<TargetRow[]>`
    SELECT id, title, cpv_codes
    FROM notices
    WHERE source = 'ted'
      AND description IS NULL
      AND (
        (deadline IS NOT NULL AND deadline > NOW())
        OR (deadline IS NULL AND publication_date > NOW() - INTERVAL '21 days')
      )
    ORDER BY publication_date DESC
  `
  console.log(`${targets.length} live TED notices missing descriptions\n`)

  let batches = 0
  let updated = 0
  let reembedded = 0
  let noDescOnTed = 0

  for (let i = 0; i < targets.length; i += BATCH) {
    if (MAX_BATCHES > 0 && batches >= MAX_BATCHES) break
    const chunk = targets.slice(i, i + BATCH)
    const byId = new Map(chunk.map(r => [r.id, r]))

    const resp = await searchNotices({
      query: `publication-number IN (${chunk.map(r => r.id).join(' ')})`,
      fields: ['publication-number', 'description-proc', 'description-lot'],
      limit: BATCH,
    })

    // Extract descriptions, update rows, collect for re-embedding
    const embedInputs: { noticeId: string; text: string }[] = []
    const updates: { id: string; description: string }[] = []

    for (const raw of resp.notices) {
      const id = raw['publication-number']
      const row = byId.get(id)
      if (!row) continue
      const description =
        pickLang(raw['description-proc'])?.value ??
        pickLangMulti(raw['description-lot'], 'eng', '\n')
      if (!description) { noDescOnTed++; continue }

      updates.push({ id, description })
      embedInputs.push({
        noticeId: id,
        text: buildEmbedText(
          row.title,
          description,
          (row.cpv_codes ?? []).map(code => cpvLabels.get(code) ?? code)
        ),
      })
    }

    // Pipelined updates (chunks of 20, same pattern as upsertEmbeddings)
    for (let j = 0; j < updates.length; j += 20) {
      await Promise.all(updates.slice(j, j + 20).map(u => sql`
        UPDATE notices SET description = ${u.description}, updated_at = NOW()
        WHERE id = ${u.id}
      `))
    }

    const embedResults = await batchEmbed(embedInputs)
    await upsertEmbeddings(sql, embedResults)

    batches++
    updated += updates.length
    reembedded += embedResults.length
    console.log(`  batch ${batches}/${Math.ceil(targets.length / BATCH)} — ${updated} updated, ${reembedded} re-embedded`)

    // Politeness gap — TED 429s hard on bursts
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n✅ Backfill done: ${updated} descriptions written, ${reembedded} re-embedded`)
  if (noDescOnTed > 0) console.log(`   ${noDescOnTed} notices have no description on TED either`)
  await sql.end()
}

main().catch(err => {
  console.error('\n❌ Backfill failed:', err.message)
  process.exit(1)
})
