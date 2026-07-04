// Applies a SQL migration file to the database in DATABASE_URL.
// Usage (from apps/api):
//   npx tsx --env-file=../../.env scripts/run-migration.ts src/db/migrations/006_password_reset.sql
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const file = process.argv[2]
if (!file) {
  console.error('Usage: tsx scripts/run-migration.ts <path-to-migration.sql>')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 })
try {
  await sql.unsafe(readFileSync(file, 'utf8'))
  console.log(`Applied: ${file}`)
} finally {
  await sql.end()
}
