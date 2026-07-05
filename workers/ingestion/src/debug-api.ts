// End-to-end smoke test: fetch 3 notices, normalize them, print results
import { searchNotices, NOTICE_FIELDS } from './sources/ted/client.js'
import { normalizeNotice } from './sources/ted/normalizer.js'
import { fetchECBRates } from './fx-rates.js'

const fxRates = await fetchECBRates()
const response = await searchNotices({
  query: 'PD>=20260607',
  fields: NOTICE_FIELDS,
  page: 1,
  limit: 3,
})

console.log(`Total notices available: ${response.totalNoticeCount.toLocaleString()}`)
console.log(`Fetched: ${response.notices.length}\n`)

for (const raw of response.notices) {
  const n = normalizeNotice(raw, fxRates)
  if (!n) { console.log('⚠️  Failed to normalize:', raw['publication-number']); continue }
  console.log(`✓ ${n.id}  [${n.type}]`)
  console.log(`  Title:    ${n.title}`)
  console.log(`  Buyer:    ${n.buyerName ?? '—'} (${n.country})`)
  console.log(`  CPVs:     ${n.cpvCodes.join(', ') || '—'}`)
  console.log(`  Value:    ${n.estimatedValue != null ? `${n.currency} ${n.estimatedValue.toLocaleString()}` : '—'}`)
  console.log(`  Deadline: ${n.deadline?.toISOString().split('T')[0] ?? '—'}`)
  console.log(`  PubDate:  ${n.publicationDate.toISOString().split('T')[0]}`)
  console.log(`  URL:      ${n.url}`)
  console.log()
}
