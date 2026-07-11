// Ingestion Worker
// Pulls recent tender notices from all configured sources (EU TED, UK Find a
// Tender), normalises them, generates embeddings, and upserts into Supabase.
// Run: every 6 hours via cron (or manually for first load)
//
// Env:
//   SOURCE     — 'ted' | 'find-tender' | 'all' (default 'all')
//   DAYS_BACK  — lookback window in days (default 2)
//   MAX_PAGES  — stop each source after N pages; smoke-test knob (default off)

import postgres from 'postgres'
import { fetchECBRates } from './fx-rates.js'
import { getCPVLabels, runSource, pruneStaleNotices } from './pipeline.js'
import { tedSource } from './sources/ted/index.js'
import { findTenderSource } from './sources/find-tender/index.js'
import type { SourceAdapter } from './types.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const DAYS_BACK = Number(process.env.DAYS_BACK ?? 2)
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 0)

const ADAPTERS: Record<string, SourceAdapter> = {
  'ted': tedSource,
  'find-tender': findTenderSource,
}

function selectAdapters(): SourceAdapter[] {
  const requested = process.env.SOURCE ?? 'all'
  if (requested === 'all') return Object.values(ADAPTERS)
  const adapter = ADAPTERS[requested]
  if (!adapter) {
    throw new Error(`Unknown SOURCE '${requested}' — use ${[...Object.keys(ADAPTERS), 'all'].join(' | ')}`)
  }
  return [adapter]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const adapters = selectAdapters()
  const sql = postgres(DATABASE_URL!, { ssl: 'require' })

  console.log('=== Ingestion Worker ===')
  console.log(`Sources: ${adapters.map(a => a.label).join(', ')}`)
  console.log(`Fetching notices from last ${DAYS_BACK} days...\n`)
  const start = Date.now()

  // Shared context: ECB rates + CPV labels fetched once for all sources
  const fxRates = await fetchECBRates()
  const cpvLabels = await getCPVLabels(sql)
  console.log(`✓ Loaded ${cpvLabels.size} CPV labels\n`)

  const failures: string[] = []

  for (const adapter of adapters) {
    console.log(`── ${adapter.label} ──`)
    try {
      const stats = await runSource(
        sql,
        adapter,
        { daysBack: DAYS_BACK, fxRates, maxPages: MAX_PAGES },
        cpvLabels
      )
      console.log(`  ✓ ${stats.upserted} notices upserted across ${stats.batches} page(s)\n`)
    } catch (err) {
      // One broken source shouldn't stop the others from staying fresh
      console.error(`  ❌ ${adapter.label} failed: ${err instanceof Error ? err.message : err}\n`)
      failures.push(adapter.name)
    }
  }

  // Prune the rolling cache (skippable via SKIP_PRUNE=1 for debugging)
  if (process.env.SKIP_PRUNE !== '1') {
    try {
      const pruned = await pruneStaleNotices(sql)
      console.log(`── Prune ──`)
      console.log(`  ✓ removed ${pruned.awards} award-type, ${pruned.expired} expired, ${pruned.stale} stale notices\n`)
      // No explicit VACUUM here: autovacuum reclaims dead tuples for reuse,
      // and an explicit VACUUM on the embeddings table takes minutes. To
      // shrink the REPORTED database size, run `VACUUM FULL notice_embeddings`
      // (then `VACUUM FULL notices`) manually in the Supabase SQL editor.
    } catch (err) {
      console.warn(`  ⚠️  prune step failed (non-fatal): ${err instanceof Error ? err.message : err}\n`)
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const counts = await sql<{ source: string; count: string }[]>`
    SELECT source, COUNT(*) as count FROM notices GROUP BY source ORDER BY source
  `

  console.log(`${failures.length === 0 ? '✅' : '⚠️ '} Done in ${elapsed}s`)
  for (const c of counts) {
    console.log(`   ${c.source}: ${c.count} notices in DB`)
  }

  await sql.end()

  if (failures.length > 0) {
    console.error(`\n❌ Failed sources: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('\n❌ Ingestion failed:', err.message)
  process.exit(1)
})
