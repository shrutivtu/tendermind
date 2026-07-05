// Shared ingestion pipeline.
// Consumes normalized notice batches from any SourceAdapter and handles the
// source-independent half of ingestion: upserting notices, building embed
// text (title + description + CPV labels), and upserting embeddings.

import type postgres from 'postgres'
import { buildEmbedText, batchEmbed, type EmbedResult } from './embedder.js'
import type { NormalizedNotice, SourceAdapter, SourceContext } from './types.js'

// ─── CPV labels (used to enrich embed text) ───────────────────────────────────

export async function getCPVLabels(sql: postgres.Sql): Promise<Map<string, string>> {
  const rows = await sql<{ code: string; label: string }[]>`
    SELECT code, label FROM cpv_codes
  `
  return new Map(rows.map(r => [r.code, r.label]))
}

// ─── Upsert notices ───────────────────────────────────────────────────────────

export async function upsertNotices(
  sql: postgres.Sql,
  notices: NormalizedNotice[],
  source: string
): Promise<void> {
  if (notices.length === 0) return

  // postgres.js's bulk-insert helper types only admit string | number rows,
  // but the runtime serialises null / Date / string[] parameters fine.
  const rows = notices.map(n => [
    n.id, n.type, n.title, n.titleOriginal, n.description, n.language,
    n.country, n.buyerName, n.buyerCountry, n.cpvCodes,
    n.estimatedValue, n.originalValue, n.currency,
    n.deadline, n.publicationDate, n.url,
    JSON.stringify(n.rawData),
    source,
  ]) as unknown as readonly (string | number)[][]

  await sql`
    INSERT INTO notices (
      id, type, title, title_original, description, language,
      country, buyer_name, buyer_country, cpv_codes,
      estimated_value, original_value, currency,
      deadline, publication_date, url, raw_data, source
    )
    VALUES ${sql(rows)}
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

export async function upsertEmbeddings(
  sql: postgres.Sql,
  results: EmbedResult[]
): Promise<void> {
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

// ─── Run one source through the pipeline ──────────────────────────────────────

export interface RunStats {
  batches: number
  upserted: number
}

export async function runSource(
  sql: postgres.Sql,
  adapter: SourceAdapter,
  ctx: SourceContext,
  cpvLabels: Map<string, string>
): Promise<RunStats> {
  let batches = 0
  let upserted = 0

  for await (const batch of adapter.fetchBatches(ctx)) {
    if (batch.length === 0) continue

    await upsertNotices(sql, batch, adapter.name)

    const embedInputs = batch.map(n => ({
      noticeId: n.id,
      text: buildEmbedText(
        n.title,
        n.description,
        n.cpvCodes.map(code => cpvLabels.get(code) ?? code)
      ),
    }))
    const embedResults = await batchEmbed(embedInputs)
    await upsertEmbeddings(sql, embedResults)

    batches++
    upserted += batch.length
    process.stdout.write(`\r  [${adapter.name}] page ${batches} — ${upserted} notices processed`)
  }

  if (batches > 0) process.stdout.write('\n')
  return { batches, upserted }
}
