'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { runScout, type MatchedNotice } from '@/lib/scout-stream'

// ─── Country options ──────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: '', label: 'All EU countries' },
  { code: 'DEU', label: 'Germany' },
  { code: 'FRA', label: 'France' },
  { code: 'ESP', label: 'Spain' },
  { code: 'ITA', label: 'Italy' },
  { code: 'POL', label: 'Poland' },
  { code: 'NLD', label: 'Netherlands' },
  { code: 'BEL', label: 'Belgium' },
  { code: 'SWE', label: 'Sweden' },
  { code: 'IRL', label: 'Ireland' },
  { code: 'CZE', label: 'Czechia' },
  { code: 'ROU', label: 'Romania' },
  { code: 'HRV', label: 'Croatia' },
  { code: 'GRC', label: 'Greece' },
  { code: 'PRT', label: 'Portugal' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ALPHA3_TO_2: Record<string, string> = {
  ESP:'ES', POL:'PL', CZE:'CZ', DEU:'DE', FRA:'FR', IRL:'IE',
  HRV:'HR', ROU:'RO', ITA:'IT', NLD:'NL', BEL:'BE', SWE:'SE',
  PRT:'PT', GRC:'GR', MLT:'MT', HUN:'HU', SVK:'SK', SVN:'SI',
  FIN:'FI', DNK:'DK', AUT:'AT', BGR:'BG', CYP:'CY', EST:'EE',
  LVA:'LV', LTU:'LT', LUX:'LU',
}

function countryName(alpha3: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(ALPHA3_TO_2[alpha3] ?? alpha3) ?? alpha3
  } catch { return alpha3 }
}

function fmtDate(str: string | null | undefined) {
  if (!str) return null
  return str.split('T')[0].split(' ')[0]
}

function fmtValue(val: number | null) {
  if (!val) return null
  if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `€${(val / 1_000).toFixed(0)}K`
  return `€${val.toLocaleString()}`
}

type Phase = 'form' | 'running' | 'done'

// ─── How it works modal ───────────────────────────────────────────────────────
function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">How TenderMind works</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-5">
          {[
            {
              step: '01',
              color: 'text-blue-400',
              title: 'Semantic embedding',
              desc: "Your company description is converted into a 1,536-dimension vector using OpenAI's embedding model — capturing the meaning of what you do, not just keywords.",
            },
            {
              step: '02',
              color: 'text-purple-400',
              title: 'pgvector similarity search',
              desc: 'We run a cosine similarity search across 3,500+ live EU tenders stored in PostgreSQL + pgvector. The 25 most semantically similar notices are retrieved in milliseconds.',
            },
            {
              step: '03',
              color: 'text-emerald-400',
              title: 'Claude AI analysis',
              desc: 'Claude reads each candidate tender and your profile, then calls a structured tool to record matches — scoring relevance 0–100 and writing a specific reason for each. Only scores ≥ 50 are shown.',
            },
          ].map(({ step, color, title, desc }) => (
            <div key={step} className="flex gap-4">
              <div className={`text-2xl font-bold ${color} opacity-60 shrink-0 w-8`}>{step}</div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Score guide</p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="text-emerald-400 font-bold text-base mb-1">90–100</div>
              <div className="text-emerald-300">⭐ Perfect fit</div>
              <div className="text-slate-500 mt-1">Direct match to your core capabilities</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div className="text-blue-400 font-bold text-base mb-1">70–89</div>
              <div className="text-blue-300">✓ Good fit</div>
              <div className="text-slate-500 mt-1">Strong overlap, worth pursuing</div>
            </div>
            <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg p-3">
              <div className="text-slate-400 font-bold text-base mb-1">50–69</div>
              <div className="text-slate-300">~ Weak fit</div>
              <div className="text-slate-500 mt-1">Partial match, review carefully</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Export report ────────────────────────────────────────────────────────────
function exportReport(description: string, matches: MatchedNotice[]) {
  const perfect = matches.filter(m => m.fit === 'perfect')
  const good    = matches.filter(m => m.fit === 'good')
  const weak    = matches.filter(m => m.fit === 'weak')
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
    .logo span { color: #1e293b; }
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
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 20px; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">⬡ Tender<span>Mind</span></div>
    <h1>Scout Agent Report</h1>
    <div class="meta">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · EU Procurement Intelligence · Powered by Claude AI + pgvector</div>
  </div>

  <div class="summary-grid">
    <div class="stat"><div class="stat-num">${matches.length}</div><div class="stat-label">tenders found</div></div>
    <div class="stat"><div class="stat-num">${perfect.length}</div><div class="stat-label">perfect fits</div></div>
    <div class="stat"><div class="stat-num">${good.length}</div><div class="stat-label">good fits</div></div>
    <div class="stat"><div class="stat-num">${totalValue > 0 ? fmtValue(totalValue) : '—'}</div><div class="stat-label">total est. value</div></div>
  </div>

  <div class="section-title">Company profile searched</div>
  <div class="company-box">${description}</div>

  ${perfect.length > 0 ? `
  <div class="section-title">⭐ Perfect fits (${perfect.length})</div>
  ${perfect.map(m => cardHtml(m)).join('')}` : ''}

  ${good.length > 0 ? `
  <div class="section-title">✓ Good fits (${good.length})</div>
  ${good.map(m => cardHtml(m)).join('')}` : ''}

  ${weak.length > 0 ? `
  <div class="section-title">~ Weak fits (${weak.length})</div>
  ${weak.map(m => cardHtml(m)).join('')}` : ''}

  <div class="footer">
    TenderMind · EU Procurement Intelligence for SMEs · Data sourced from TED (Tenders Electronic Daily) · ted.europa.eu
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  // Auto-trigger print dialog after load so user can save as PDF
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => win.print(), 500)
    })
  }
}

function cardHtml(m: MatchedNotice) {
  const scoreClass = m.fit === 'perfect' ? 'score-perfect' : m.fit === 'good' ? 'score-good' : 'score-weak'
  const badgeClass = m.fit === 'perfect' ? 'badge-perfect' : m.fit === 'good' ? 'badge-good' : 'badge-weak'
  const fitLabel   = m.fit === 'perfect' ? '⭐ Perfect fit' : m.fit === 'good' ? '✓ Good fit' : '~ Weak fit'
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

// ─── Fit badge ────────────────────────────────────────────────────────────────
function FitBadge({ fit }: { fit: MatchedNotice['fit'] }) {
  const styles = {
    perfect: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    good:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    weak:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[fit]}`}>
      {fit === 'perfect' ? '⭐ Perfect fit' : fit === 'good' ? '✓ Good fit' : '~ Weak fit'}
    </span>
  )
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#3b82f6' : '#64748b'
  const r = 20
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width="52" height="52" className="shrink-0" title={`Relevance score: ${score}/100`}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
      <text x="26" y="30" textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">
        {score}
      </text>
    </svg>
  )
}

// ─── Tender card (expandable) ─────────────────────────────────────────────────
function TenderCard({ notice, index }: { notice: MatchedNotice; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="group bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 animate-fade-in cursor-pointer"
      style={{ animationDelay: `${index * 80}ms` }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex gap-4">
        <ScoreRing score={notice.score} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <FitBadge fit={notice.fit} />
            <span className="text-xs text-slate-500">{countryName(notice.country)}</span>
            {notice.estimatedValue && (
              <span className="text-xs text-amber-400/80 font-medium">
                {fmtValue(notice.estimatedValue)}
              </span>
            )}
            <span className="ml-auto text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
              {expanded ? '▲ less' : '▼ details'}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-2 line-clamp-2">
            {notice.title}
          </h3>

          {/* AI reason — always visible */}
          <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-blue-500/40 pl-3 mb-3">
            {notice.reason}
          </p>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 animate-fade-in">
              {notice.buyerName && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">Buyer: </span>{notice.buyerName}
                </div>
              )}
              {notice.cpvCodes.length > 0 && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">CPV codes: </span>
                  {notice.cpvCodes.join(', ')}
                </div>
              )}
              {notice.deadline && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">Submission deadline: </span>
                  <span className="text-orange-400">{fmtDate(notice.deadline)}</span>
                </div>
              )}
              <div className="text-xs text-slate-400">
                <span className="text-slate-600">Published: </span>{fmtDate(notice.publicationDate)}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <a
              href={notice.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              View full notice on TED →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Thinking feed ────────────────────────────────────────────────────────────
function ThinkingFeed({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div>
      <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Claude's reasoning</p>
      <div
        ref={ref}
        className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-slate-400 leading-relaxed"
      >
        <span className="text-emerald-400">scout@tendermind:~$ </span>
        <span className="text-slate-300">{text}</span>
        <span className="animate-pulse text-emerald-400">▊</span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [phase, setPhase]             = useState<Phase>('form')
  const [description, setDescription] = useState('')
  const [country, setCountry]         = useState('')
  const [status, setStatus]           = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [matches, setMatches]         = useState<MatchedNotice[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [totalDone, setTotalDone]     = useState(0)
  const [error, setError]             = useState('')
  const [showHowItWorks, setShowHowItWorks] = useState(false)

  const thinkingRef  = useRef('')
  const descRef      = useRef('')
  const sessionIdRef = useRef('')
  const router       = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    descRef.current = description
    setPhase('running')
    setStatus('')
    setThinkingText('')
    setMatches([])
    setError('')
    setCandidateCount(0)
    thinkingRef.current = ''

    await runScout(description, country || undefined, {
      onStatus:     (msg)   => setStatus(msg),
      onCandidates: (count) => setCandidateCount(count),
      onThinking:   (text)  => {
        thinkingRef.current += text
        setThinkingText(thinkingRef.current)
      },
      onMatch:      (notice) => setMatches(prev => [...prev, notice]),
      onSessionId:  (id)     => { sessionIdRef.current = id },
      onDone:       (total)  => {
        setTotalDone(total)
        setPhase('done')
        // Redirect to persistent session page after a short delay
        // so the user sees the "done" state before navigating
        if (sessionIdRef.current) {
          setTimeout(() => router.push(`/sessions/${sessionIdRef.current}`), 1200)
        }
      },
      onError: (msg) => { setError(msg); setPhase('done') },
    })
  }

  const reset = () => {
    setPhase('form')
    setMatches([])
    setThinkingText('')
    thinkingRef.current = ''
  }

  const sorted = [...matches].sort((a, b) => b.score - a.score)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-slate-100 font-bold text-lg">
            <span className="text-blue-400">⬡</span> TenderMind
          </a>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHowItWorks(true)}
              className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg"
            >
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">?</span>
              How it works
            </button>
            <span className="text-xs text-slate-600 hidden sm:block">Scout Agent · Claude + pgvector</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* ── FORM PHASE ── */}
        {phase === 'form' && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold mb-2">Find your EU tenders</h1>
              <p className="text-slate-400">
                Describe what your company does. The Scout agent searches 3,500+ live EU tenders
                and Claude AI ranks the best matches with scored explanations.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  What does your company do?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. We develop custom software for hospitals — patient management systems, EHR integration, and clinical data analytics."
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-slate-600 mt-1">Be specific — mention your industry, services, and technical capabilities.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Preferred country <span className="text-slate-600 font-normal">(optional)</span>
                </label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>

              <button
                type="submit"
                disabled={!description.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white font-semibold py-3 rounded-xl"
              >
                Run Scout Agent →
              </button>
            </form>

            {/* Mini explainer */}
            <div className="mt-10 grid grid-cols-3 gap-4 text-center">
              {[
                { icon: '🔢', label: 'Embed', desc: 'Your profile → 1,536‑dim vector' },
                { icon: '🔍', label: 'Search', desc: 'Cosine similarity across 3,500+ tenders' },
                { icon: '🤖', label: 'Analyse', desc: 'Claude scores & explains each match' },
              ].map(s => (
                <div key={s.label} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">{s.label}</div>
                  <div className="text-xs text-slate-600">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RUNNING / DONE PHASE ── */}
        {(phase === 'running' || phase === 'done') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left: agent status */}
            <div className="lg:col-span-2 space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${phase === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
                  {phase === 'running' ? 'Scout Agent Running' : 'Analysis Complete'}
                </h2>
                <p className="text-sm text-slate-400">{status}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">{candidateCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">candidates found</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{matches.length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">matches so far</div>
                </div>
              </div>

              {thinkingText && <ThinkingFeed text={thinkingText} />}

              {phase === 'done' && (
                <div className="space-y-3">
                  <button
                    onClick={() => exportReport(descRef.current, sorted)}
                    className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 hover:border-blue-500/60 text-blue-300 hover:text-blue-200 transition-all py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span>↓</span> Export PDF report
                  </button>
                  <button
                    onClick={reset}
                    className="w-full border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition-colors py-2.5 rounded-xl text-sm"
                  >
                    ← New search
                  </button>
                </div>
              )}
            </div>

            {/* Right: results */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {phase === 'done'
                    ? `${totalDone} relevant tender${totalDone !== 1 ? 's' : ''} found`
                    : 'Matches appearing...'}
                </h2>
                {matches.length > 0 && (
                  <span className="text-xs text-slate-500">click any card for details</span>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-4">
                  {error}
                </div>
              )}

              {matches.length === 0 && phase === 'running' && (
                <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
                  <div className="text-center space-y-2">
                    <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mx-auto" />
                    <p>Searching and analysing...</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {sorted.map((notice, i) => (
                  <TenderCard key={notice.id} notice={notice} index={i} />
                ))}
              </div>

              {phase === 'done' && matches.length === 0 && !error && (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-lg">No strong matches found.</p>
                  <p className="text-sm mt-1">Try broadening your description or removing the country filter.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
