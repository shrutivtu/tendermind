// One-time fix script — converts existing notice values to EUR
// Run AFTER migration 003 has been applied in Supabase.
//
// Usage:
//   npx tsx --env-file=../../.env src/fix-currencies.ts

import postgres from 'postgres'
import { fetchECBRates, toEur, COUNTRY_CURRENCY } from './fx-rates.js'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  console.log('\n💱 TenderMind — Currency Fix Script')
  console.log('=====================================\n')

  // Fetch current ECB rates
  const rates = await fetchECBRates()
  console.log()

  // Find all notices from non-eurozone EU countries that have values to convert.
  // Hardcoded country list — these don't change without a Treaty amendment.
  const notices = await sql<{ id: string; original_value: number; currency: string; country: string }[]>`
    SELECT id, original_value, currency, country
    FROM notices
    WHERE country IN ('POL', 'CZE', 'SWE', 'ROU', 'HUN', 'DNK', 'BGR')
      AND original_value IS NOT NULL
      AND original_value > 0
  `

  console.log(`Found ${notices.length} notices with non-EUR values to convert`)

  if (notices.length === 0) {
    console.log('Nothing to fix — either migration 003 has not been run yet,')
    console.log('or all notices are from eurozone countries.')
    await sql.end()
    return
  }

  // Group by currency for logging
  const byCurrency: Record<string, number> = {}
  for (const n of notices) {
    byCurrency[n.currency] = (byCurrency[n.currency] ?? 0) + 1
  }
  console.log('Breakdown:', byCurrency)
  console.log()

  // Convert and update in batches
  let updated = 0
  let skipped = 0

  for (const notice of notices) {
    const eurValue = toEur(notice.original_value, notice.currency, rates)

    if (eurValue === notice.original_value && notice.currency !== 'EUR') {
      // toEur returned unconverted value — means rate was missing
      skipped++
      continue
    }

    await sql`
      UPDATE notices
      SET estimated_value = ${Math.round(eurValue)}
      WHERE id = ${notice.id}
    `
    updated++

    if (updated % 100 === 0) {
      console.log(`  Converted ${updated}/${notices.length}...`)
    }
  }

  console.log(`\n✅ Done`)
  console.log(`   Updated: ${updated} notices`)
  console.log(`   Skipped: ${skipped} (missing exchange rate)`)

  // Show a sample of conversions
  if (notices.length > 0) {
    const sample = notices.slice(0, 3)
    console.log('\nSample conversions:')
    for (const n of sample) {
      const eur = Math.round(toEur(n.original_value, n.currency, rates))
      const rate = rates[n.currency] ?? 1
      console.log(`  ${n.id}: ${n.original_value.toLocaleString()} ${n.currency} → €${eur.toLocaleString()} (rate: 1 EUR = ${rate} ${n.currency})`)
    }
  }

  await sql.end()
}

main().catch(err => {
  console.error('❌ Fix failed:', err)
  process.exit(1)
})
