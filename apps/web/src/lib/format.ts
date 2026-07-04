import type { MatchedNotice } from '@/lib/scout-stream'

// ISO 3166-1 alpha-3 → alpha-2 (all EU members + UK) — kept here so lib/ has no
// dependency on app/ code.
const ALPHA3_TO_2: Record<string, string> = {
  ESP: 'ES', POL: 'PL', CZE: 'CZ', DEU: 'DE', FRA: 'FR', IRL: 'IE',
  HRV: 'HR', ROU: 'RO', ITA: 'IT', NLD: 'NL', BEL: 'BE', SWE: 'SE',
  PRT: 'PT', GRC: 'GR', MLT: 'MT', HUN: 'HU', SVK: 'SK', SVN: 'SI',
  FIN: 'FI', DNK: 'DK', AUT: 'AT', BGR: 'BG', CYP: 'CY', EST: 'EE',
  LVA: 'LV', LTU: 'LT', LUX: 'LU', GBR: 'GB',
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function countryName(alpha3: string): string {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(
        ALPHA3_TO_2[alpha3] ?? alpha3,
      ) ?? alpha3
    )
  } catch {
    return alpha3
  }
}

export function fmtDate(str: string | null | undefined): string | null {
  if (!str) return null
  return str.split('T')[0].split(' ')[0]
}

export function fmtValue(val: number | null | undefined): string | null {
  if (!val) return null
  if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `€${(val / 1_000).toFixed(0)}K`
  return `€${val.toLocaleString()}`
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function cardHtml(m: MatchedNotice): string {
  const scoreClass =
    m.fit === 'perfect' ? 'score-perfect' : m.fit === 'good' ? 'score-good' : 'score-weak'
  const badgeClass =
    m.fit === 'perfect' ? 'badge-perfect' : m.fit === 'good' ? 'badge-good' : 'badge-weak'
  const fitLabel =
    m.fit === 'perfect' ? '⭐ Perfect fit' : m.fit === 'good' ? '✓ Good fit' : '~ Weak fit'

  return `
  <div class="card">
    <div class="card-header">
      <div class="score-circle ${scoreClass}">${m.score}</div>
      <div style="flex:1">
        <div style="margin-bottom:6px">
          <span class="badge ${badgeClass}">${fitLabel}</span>
          <span style="font-size:12px;color:#64748b">${countryName(m.country)}</span>
          ${m.estimatedValue ? `<span style="font-size:12px;color:#d97706;margin-left:8px">${fmtValue(m.estimatedValue)}</span>` : ''}
        </div>
        <div class="card-title">${m.title}</div>
      </div>
    </div>
    <div class="reason">${m.reason}</div>
    <div class="card-meta">
      ${m.buyerName ? `<span>🏛 ${m.buyerName}</span>` : ''}
      ${m.deadline ? `<span>⏰ Deadline: ${fmtDate(m.deadline)}</span>` : ''}
      <span>📅 Published: ${fmtDate(m.publicationDate)}</span>
      ${m.cpvCodes.length ? `<span>CPV: ${m.cpvCodes.join(', ')}</span>` : ''}
      <a href="${m.url}" target="_blank">View on TED →</a>
    </div>
  </div>`
}

export function exportReport(description: string, matches: MatchedNotice[]): void {
  const perfect = matches.filter(m => m.fit === 'perfect')
  const good = matches.filter(m => m.fit === 'good')
  const weak = matches.filter(m => m.fit === 'weak')
  const totalValue = matches.reduce((s, m) => s + (m.estimatedValue ?? 0), 0)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TenderMind Scout Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; padding: 40px; max-width: 860px; margin: 0 auto; }
    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 28px; }
    .logo { font-size: 22px; font-weight: 800; color: #3b82f6; }
    h1 { font-size: 26px; font-weight: 700; margin: 12px 0 6px; }
    .meta { font-size: 13px; color: #64748b; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 800; color: #3b82f6; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin: 28px 0 14px; }
    .company-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 16px; margin-bottom: 8px; font-size: 14px; color: #1e293b; line-height: 1.6; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 14px; page-break-inside: avoid; }
    .card-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 10px; }
    .score-circle { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
    .score-perfect { background: #d1fae5; color: #059669; }
    .score-good    { background: #dbeafe; color: #2563eb; }
    .score-weak    { background: #f1f5f9; color: #64748b; }
    .card-title { font-size: 15px; font-weight: 600; line-height: 1.4; margin-bottom: 4px; }
    .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin-right: 6px; }
    .badge-perfect { background: #d1fae5; color: #059669; }
    .badge-good    { background: #dbeafe; color: #2563eb; }
    .badge-weak    { background: #f1f5f9; color: #64748b; }
    .reason { font-size: 13px; color: #374151; line-height: 1.6; margin: 8px 0; background: #f8fafc; border-left: 3px solid #3b82f6; padding: 8px 12px; border-radius: 0 6px 6px 0; }
    .card-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #64748b; margin-top: 10px; }
    .card-meta a { color: #3b82f6; text-decoration: none; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Tender<span>Mind</span></div>
    <h1>Scout Report</h1>
    <div class="meta">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>

  <div class="summary-grid">
    <div class="stat"><div class="stat-num">${matches.length}</div><div class="stat-label">Total matches</div></div>
    <div class="stat"><div class="stat-num" style="color:#059669">${perfect.length}</div><div class="stat-label">⭐ Perfect fit</div></div>
    <div class="stat"><div class="stat-num">${good.length}</div><div class="stat-label">✓ Good fit</div></div>
    <div class="stat"><div class="stat-num" style="color:#d97706">${totalValue >= 1_000_000 ? `€${(totalValue / 1_000_000).toFixed(0)}M` : `€${(totalValue / 1_000).toFixed(0)}K`}</div><div class="stat-label">Total value</div></div>
  </div>

  <div class="section-title">Company profile</div>
  <div class="company-box">${description}</div>

  ${perfect.length ? `<div class="section-title">⭐ Perfect fit (${perfect.length})</div>${perfect.map(cardHtml).join('')}` : ''}
  ${good.length   ? `<div class="section-title">✓ Good fit (${good.length})</div>${good.map(cardHtml).join('')}` : ''}
  ${weak.length   ? `<div class="section-title">~ Weak fit (${weak.length})</div>${weak.map(cardHtml).join('')}` : ''}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => win.print(), 500)
    })
  }
}
