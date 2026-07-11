// TED API contract probe
// Systematically tests what the TED API actually supports, before we architect
// around it. Self-contained on purpose — raw fetch, no retry wrapper, so we see
// real errors and real latency.
//
// Run (no env vars needed — Search API is anonymous):
//   cd workers/ingestion && npx tsx src/probe-ted.ts
//
// What it answers:
//   A. Which expert-query fields work on POST /v3/notices/search
//      (CPV wildcards, country, deadline, notice-type negation, full-text)
//   B. Which response fields exist (is there ANY description field?)
//   C. Does GET /v3/notices/{id} return description text? (load-bearing
//      assumption for the "fetch descriptions for finalists" plan)
//   D. What does the eForms XML contain, and how big is it?
//   E. Latency + parallel-request behavior (rate limiting)

const BASE = 'https://api.ted.europa.eu/v3'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymd(daysOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString().split('T')[0].replace(/-/g, '')
}

interface ProbeResult {
  name: string
  ok: boolean
  ms: number
  detail: string
}

const results: ProbeResult[] = []

async function search(body: object): Promise<{ status: number; ms: number; json: any; text: string }> {
  const start = Date.now()
  const res = await fetch(`${BASE}/notices/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - start
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* keep raw text */ }
  return { status: res.status, ms, json, text }
}

async function probeQuery(name: string, query: string): Promise<void> {
  try {
    const r = await search({ query, fields: ['publication-number'], limit: 1 })
    if (r.status === 200 && r.json) {
      const total = r.json.totalNoticeCount ?? '?'
      results.push({ name, ok: true, ms: r.ms, detail: `total=${Number(total).toLocaleString()}` })
      console.log(`  ✓ ${name}  (${r.ms}ms)  → ${Number(total).toLocaleString()} notices`)
    } else {
      // TED error bodies are informative — print the useful part
      const msg = (r.json?.message ?? r.text).slice(0, 180).replace(/\n/g, ' ')
      results.push({ name, ok: false, ms: r.ms, detail: `HTTP ${r.status}: ${msg}` })
      console.log(`  ✗ ${name}  → HTTP ${r.status}: ${msg}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, ms: 0, detail: msg })
    console.log(`  ✗ ${name}  → ${msg}`)
  }
  await new Promise(r => setTimeout(r, 300)) // be polite
}

// Recursively find keys whose name suggests description content
function findDescriptionKeys(obj: any, path = '', depth = 0): string[] {
  if (depth > 4 || obj == null || typeof obj !== 'object') return []
  const hits: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k
    if (/desc|note|summary|short|text/i.test(k)) {
      const preview = typeof v === 'string'
        ? v.slice(0, 80)
        : JSON.stringify(v)?.slice(0, 80)
      hits.push(`${p} = ${preview}`)
    }
    hits.push(...findDescriptionKeys(v, p, depth + 1))
  }
  return hits
}

// ─── A. Expert query language ─────────────────────────────────────────────────

async function probeQueryLanguage(): Promise<void> {
  console.log('\n━━ A. Expert query language (POST /v3/notices/search) ━━━━━━━━━━━━━━━━')
  const today = ymd(0)
  const weekAgo = ymd(-7)

  // Baseline — known to work (client.ts uses PD>=)
  await probeQuery('baseline: PD>= (legacy alias)', `PD>=${weekAgo}`)
  await probeQuery('publication-date>= (eForms name)', `publication-date>=${weekAgo}`)

  // CPV filtering — the key to pre-filtering 700k at the API level
  await probeQuery('CPV exact: classification-cpv=72000000', `classification-cpv=72000000 AND PD>=${weekAgo}`)
  await probeQuery('CPV wildcard: classification-cpv IN (72* 79*)', `classification-cpv IN (72* 79*) AND PD>=${weekAgo}`)
  await probeQuery('CPV legacy alias: PC=72000000', `PC=72000000 AND PD>=${weekAgo}`)

  // Country
  await probeQuery('country: buyer-country=DEU', `buyer-country=DEU AND PD>=${weekAgo}`)
  await probeQuery('country legacy alias: CY=DEU', `CY=DEU AND PD>=${weekAgo}`)

  // Deadline — "only open tenders" at the API level
  await probeQuery('open deadlines: deadline-date-lot>=today', `deadline-date-lot>=${today}`)
  await probeQuery('deadline legacy alias: DD>=today', `DD>=${today}`)

  // Notice type — exclude awards (can-*) at the source
  await probeQuery('type: notice-type=cn-standard', `notice-type=cn-standard AND PD>=${weekAgo}`)
  await probeQuery('type negation: NOT notice-type IN (can-standard can-social can-desg)',
    `PD>=${weekAgo} AND NOT notice-type IN (can-standard can-social can-desg)`)

  // Full text — the keyword arm, but over TED's whole corpus
  await probeQuery('full text: FT~"software development"', `FT~"software development" AND PD>=${weekAgo}`)
  await probeQuery('full text single: FT="cloud"', `FT="cloud" AND PD>=${weekAgo}`)

  // Value range
  await probeQuery('value: total-value>=1000000', `total-value>=1000000 AND PD>=${weekAgo}`)
  await probeQuery('value: estimated-value-lot>=1000000', `estimated-value-lot>=1000000 AND PD>=${weekAgo}`)

  // The realistic combined query the Scout query-planner would emit
  await probeQuery('COMBINED: CPV* + country + open + not-award',
    `classification-cpv IN (72* 79*) AND buyer-country IN (DEU FRA NLD) AND deadline-date-lot>=${today} AND NOT notice-type IN (can-standard can-social can-desg)`)
}

// ─── B. Response fields — does search expose descriptions at all? ─────────────

async function probeFields(): Promise<void> {
  console.log('\n━━ B. Response fields (what can `fields` return?) ━━━━━━━━━━━━━━━━━━━━')
  const weekAgo = ymd(-7)

  // Deliberately bogus field: TED's 400 error usually enumerates valid fields
  const bogus = await search({ query: `PD>=${weekAgo}`, fields: ['definitely-not-a-field'], limit: 1 })
  console.log(`  bogus field → HTTP ${bogus.status}`)
  const errMsg = (bogus.json?.message ?? bogus.text).slice(0, 2000)
  console.log(`  error body (may list valid fields):\n    ${errMsg.replace(/\n/g, '\n    ')}`)

  // Candidate description-ish fields, one at a time so one bad name doesn't mask others
  const candidates = [
    'description-lot', 'description-proc', 'title-proc', 'BT-24-Lot',
    'contract-nature', 'place-of-performance', 'main-activity',
    'organisation-name-buyer', 'total-value', 'winner-name',
  ]
  for (const f of candidates) {
    const r = await search({ query: `PD>=${weekAgo}`, fields: ['publication-number', f], limit: 1 })
    const ok = r.status === 200
    const sample = ok ? JSON.stringify(r.json?.notices?.[0]?.[f])?.slice(0, 100) : ''
    console.log(`  ${ok ? '✓' : '✗'} fields: ${f}${ok ? `  → sample: ${sample}` : `  (HTTP ${r.status})`}`)
    results.push({ name: `field: ${f}`, ok, ms: r.ms, detail: ok ? String(sample) : `HTTP ${r.status}` })
    await new Promise(r => setTimeout(r, 300))
  }
}

// ─── C. Single-notice endpoint — THE load-bearing probe ───────────────────────

async function probeSingleNotice(): Promise<string | null> {
  console.log('\n━━ C. GET /v3/notices/{id} — does it return description text? ━━━━━━━━')
  const weekAgo = ymd(-7)

  // Grab a real recent contract notice (cn-*, not an award) to inspect
  const r = await search({
    query: `notice-type=cn-standard AND PD>=${weekAgo}`,
    fields: ['publication-number', 'notice-title', 'links'],
    limit: 1,
  })
  const notice = r.json?.notices?.[0]
  if (!notice) { console.log('  ✗ could not fetch a sample notice to test with'); return null }

  const id = notice['publication-number']
  console.log(`  sample notice: ${id}`)

  for (const path of [`/notices/${id}`, `/notices/${encodeURIComponent(id)}`]) {
    const start = Date.now()
    const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
    const ms = Date.now() - start
    const text = await res.text()
    console.log(`  GET ${path} → HTTP ${res.status} (${ms}ms, ${text.length.toLocaleString()} chars)`)
    if (res.status === 200) {
      try {
        const json = JSON.parse(text)
        console.log(`  top-level keys: ${Object.keys(json).join(', ')}`)
        const descKeys = findDescriptionKeys(json).slice(0, 15)
        if (descKeys.length > 0) {
          console.log('  description-ish keys found:')
          for (const k of descKeys) console.log(`    • ${k}`)
        } else {
          console.log('  ⚠ NO description-like keys found — plan B (XML) needed')
        }
      } catch {
        console.log(`  (non-JSON response, first 200 chars): ${text.slice(0, 200)}`)
      }
      break
    }
  }

  // Return the XML link for probe D
  const xmlLinks = notice.links?.xml as Record<string, string> | undefined
  return xmlLinks ? Object.values(xmlLinks)[0] ?? null : null
}

// ─── D. eForms XML — plan B for descriptions ──────────────────────────────────

async function probeXml(xmlUrl: string | null): Promise<void> {
  console.log('\n━━ D. eForms XML (plan B for descriptions) ━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (!xmlUrl) { console.log('  (no XML link available from sample notice)'); return }

  const start = Date.now()
  const res = await fetch(xmlUrl)
  const ms = Date.now() - start
  const xml = await res.text()
  console.log(`  GET ${xmlUrl}`)
  console.log(`  → HTTP ${res.status} (${ms}ms, ${(xml.length / 1024).toFixed(0)} KB)`)

  // eForms puts the procurement description in cbc:Description elements
  const descMatches = [...xml.matchAll(/<cbc:Description[^>]*>([\s\S]*?)<\/cbc:Description>/g)]
  const noteMatches = [...xml.matchAll(/<cbc:Note[^>]*>([\s\S]*?)<\/cbc:Note>/g)]
  console.log(`  <cbc:Description> elements: ${descMatches.length}, <cbc:Note> elements: ${noteMatches.length}`)
  const sample = descMatches[0]?.[1] ?? noteMatches[0]?.[1]
  if (sample) console.log(`  first description sample:\n    "${sample.trim().slice(0, 300)}"`)
  else console.log('  ⚠ no description/note elements matched — inspect the XML manually')
}

// ─── E. Latency + parallelism (rate limit behavior) ───────────────────────────

async function probeLatency(): Promise<void> {
  console.log('\n━━ E. Latency & parallel behavior ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const weekAgo = ymd(-7)
  const body = { query: `classification-cpv IN (72*) AND PD>=${weekAgo}`, fields: ['publication-number'], limit: 100 }

  // Sequential: realistic per-search latency
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const r = await search(body)
    times.push(r.ms)
    await new Promise(r => setTimeout(r, 300))
  }
  console.log(`  sequential ×3 (limit=100): ${times.join('ms, ')}ms`)

  // Parallel burst of 10 — simulates description-fetch for finalists
  const start = Date.now()
  const burst = await Promise.all(
    Array.from({ length: 10 }, () => search({ ...body, limit: 1 }))
  )
  const codes = burst.map(b => b.status)
  const rateLimited = codes.filter(c => c === 429).length
  console.log(`  parallel ×10: ${Date.now() - start}ms total, statuses: ${[...new Set(codes)].join(', ')}${rateLimited ? ` (${rateLimited} rate-limited!)` : ' — no rate limiting observed'}`)
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log('TED API contract probe — ' + new Date().toISOString())

await probeQueryLanguage()
await probeFields()
const xmlUrl = await probeSingleNotice()
await probeXml(xmlUrl)
await probeLatency()

console.log('\n━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
const passed = results.filter(r => r.ok).length
console.log(`${passed}/${results.length} probes passed. Failures worth reading:`)
for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name} — ${r.detail}`)
console.log('\nDecision checklist:')
console.log('  1. If C or D shows description text → the finalists-only description fetch works (Phase 0)')
console.log('  2. If the COMBINED query in A works → TED-as-primary-index is viable (Phase 1)')
console.log('  3. If FT works → TED can be the keyword arm too, replacing the dead EU FTS arm')
console.log('  4. Section E numbers → your real latency budget for the live path')
