// CPV Loader Worker
// Loads the CPV taxonomy seed into the cpv_codes table.
// Run once on setup, then weekly to pick up any updates.

import postgres from 'postgres'
import { CPV_CODES } from './cpv-seed.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

const sql = postgres(DATABASE_URL, { ssl: 'require' })

async function main() {
  console.log('=== CPV Loader ===')

  // Deduplicate by code (last one wins)
  const seen = new Map(CPV_CODES.map(c => [c.code, c]))
  const codes = [...seen.values()]
  console.log(`Loading ${codes.length} CPV codes (deduped from ${CPV_CODES.length})...`)
  const start = Date.now()

  const CHUNK_SIZE = 200
  let upserted = 0

  for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
    const chunk = codes.slice(i, i + CHUNK_SIZE)

    await sql`
      INSERT INTO cpv_codes (code, label, parent_code, level)
      VALUES ${sql(chunk.map(c => [c.code, c.label, c.parentCode ?? null, c.level]))}
      ON CONFLICT (code) DO UPDATE SET
        label       = EXCLUDED.label,
        parent_code = EXCLUDED.parent_code,
        level       = EXCLUDED.level
    `

    upserted += chunk.length
    process.stdout.write(`\r  ✓ ${upserted}/${codes.length}`)
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM cpv_codes`

  console.log(`\n\n Done in ${elapsed}s — ${count} CPV codes in database`)
  await sql.end()
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
