'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchedNotice {
  id: string; title: string; buyerName: string | null
  country: string; cpvCodes: string[]; estimatedValue: number | null
  currency: string | null; deadline: string | null
  publicationDate: string; url: string
  score: number; reason: string; fit: 'perfect' | 'good' | 'weak'
}

interface TenderEvaluation {
  notice_id: string; recommendation: 'pursue' | 'consider' | 'skip'
  priority: number; win_probability: 'high' | 'medium' | 'low'
  estimated_effort: 'low' | 'medium' | 'high'
  risks: string[]; strengths: string[]; key_requirement: string
}

interface Session {
  id: string; company_description: string; country_filter: string | null
  status: string; match_count: number; top_score: number | null
  analyst_summary: string | null; error_message: string | null
  created_at: string; completed_at: string | null
  scout_matches: MatchedNotice[] | null
  evaluations: TenderEvaluation[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALPHA3_TO_2: Record<string, string> = {
  DEU:'DE', FRA:'FR', ESP:'ES', ITA:'IT', POL:'PL', NLD:'NL', BEL:'BE',
  SWE:'SE', IRL:'IE', CZE:'CZ', ROU:'RO', HRV:'HR', GRC:'GR', PRT:'PT',
}
function countryName(a3: string) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(ALPHA3_TO_2[a3] ?? a3) ?? a3 }
  catch { return a3 }
}
function fmtDate(s: string | null | undefined) {
  if (!s) return null
  return s.split('T')[0].split(' ')[0]
}
function fmtValue(v: number | null) {
  if (!v) return null
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`
  return `€${v.toLocaleString()}`
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scout_running:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    analyst_running: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    complete:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    error:           'bg-red-500/15 text-red-400 border-red-500/30',
  }
  const labels: Record<string, string> = {
    scout_running:   '⟳ Scout searching...',
    analyst_running: '⟳ Analyst evaluating...',
    complete:        '✓ Analysis complete',
    error:           '✕ Error',
  }
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${styles[status] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ─── Recommendation badge ─────────────────────────────────────────────────────

function RecBadge({ rec }: { rec: TenderEvaluation['recommendation'] }) {
  const styles = {
    pursue:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    consider:'bg-amber-500/20  text-amber-300  border-amber-500/40',
    skip:    'bg-slate-500/20  text-slate-400  border-slate-500/40',
  }
  const labels = { pursue: '🎯 Pursue', consider: '🤔 Consider', skip: '⏭ Skip' }
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${styles[rec]}`}>
      {labels[rec]}
    </span>
  )
}

// ─── Win probability pill ─────────────────────────────────────────────────────

function WinPill({ prob }: { prob: TenderEvaluation['win_probability'] }) {
  const styles = { high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-red-400' }
  const icons  = { high: '↑', medium: '→', low: '↓' }
  return <span className={`text-xs font-semibold ${styles[prob]}`}>{icons[prob]} {prob} win probability</span>
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const s     = Math.max(0, Math.min(100, score || 0))
  const color = s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : '#64748b'
  const r = 20; const circ = 2 * Math.PI * r; const dash = (s / 100) * circ
  return (
    <svg width="52" height="52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
      <text x="26" y="30" textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">{s}</text>
    </svg>
  )
}

// ─── Combined tender + evaluation card ───────────────────────────────────────

function TenderCard({
  notice, evaluation, index
}: {
  notice: MatchedNotice
  evaluation: TenderEvaluation | undefined
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden animate-fade-in transition-all duration-300"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Scout result row */}
      <div
        className="p-5 cursor-pointer hover:bg-slate-900/80 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex gap-4">
          <ScoreRing score={notice.score} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                notice.fit === 'perfect' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                notice.fit === 'good'    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                                           'bg-slate-500/15 text-slate-400 border-slate-500/30'
              }`}>
                {notice.fit === 'perfect' ? '⭐ Perfect fit' : notice.fit === 'good' ? '✓ Good fit' : '~ Weak fit'}
              </span>
              <span className="text-xs text-slate-500">{countryName(notice.country)}</span>
              {notice.estimatedValue && (
                <span className="text-xs text-amber-400/80 font-medium">{fmtValue(notice.estimatedValue)}</span>
              )}
              {evaluation && <RecBadge rec={evaluation.recommendation} />}
              <span className="ml-auto text-xs text-slate-600">{expanded ? '▲' : '▼'}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-2 line-clamp-2">{notice.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-blue-500/40 pl-3">{notice.reason}</p>
          </div>
        </div>
      </div>

      {/* Expanded: Analyst evaluation */}
      {expanded && (
        <div className="border-t border-slate-800 p-5 space-y-4 animate-fade-in">

          {/* Tender metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
            {notice.buyerName && <div><span className="text-slate-600">Buyer: </span>{notice.buyerName}</div>}
            {notice.deadline  && <div><span className="text-slate-600">Deadline: </span><span className="text-orange-400">{fmtDate(notice.deadline)}</span></div>}
            {notice.cpvCodes.length > 0 && <div className="col-span-2"><span className="text-slate-600">CPV: </span>{notice.cpvCodes.join(', ')}</div>}
          </div>

          {/* Analyst evaluation */}
          {evaluation ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <WinPill prob={evaluation.win_probability} />
                <span className="text-xs text-slate-500">
                  Priority: {'★'.repeat(evaluation.priority)}{'☆'.repeat(5 - evaluation.priority)}
                </span>
                <span className="text-xs text-slate-500">
                  Bid effort: <span className={evaluation.estimated_effort === 'high' ? 'text-red-400' : evaluation.estimated_effort === 'medium' ? 'text-amber-400' : 'text-emerald-400'}>{evaluation.estimated_effort}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {evaluation.strengths.length > 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-emerald-400 mb-2">Why you could win</p>
                    <ul className="space-y-1">
                      {evaluation.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                          <span className="text-emerald-500 shrink-0">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {evaluation.risks.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-400 mb-2">Risks to watch</p>
                    <ul className="space-y-1">
                      {evaluation.risks.map((r, i) => (
                        <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                          <span className="text-red-500 shrink-0">!</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {evaluation.key_requirement && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-400 mb-1">Key requirement to verify</p>
                  <p className="text-xs text-slate-300">{evaluation.key_requirement}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-3 h-3 border border-slate-600 border-t-purple-400 rounded-full animate-spin" />
              Analyst evaluating this tender...
            </div>
          )}

          <a href={notice.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-block">
            View full notice on TED →
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportSessionReport(session: Session, matches: MatchedNotice[], evalMap: Map<string, TenderEvaluation>) {
  const pursuing  = matches.filter(m => evalMap.get(m.id)?.recommendation === 'pursue')
  const consider  = matches.filter(m => evalMap.get(m.id)?.recommendation === 'consider')
  const skipping  = matches.filter(m => evalMap.get(m.id)?.recommendation === 'skip')
  const uneval    = matches.filter(m => !evalMap.has(m.id))

  function recBadge(rec: TenderEvaluation['recommendation']) {
    const c = rec === 'pursue' ? '#059669' : rec === 'consider' ? '#d97706' : '#64748b'
    const l = rec === 'pursue' ? '🎯 Pursue' : rec === 'consider' ? '🤔 Consider' : '⏭ Skip'
    return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${c}22;color:${c};border:1px solid ${c}44">${l}</span>`
  }

  function cardHtml(m: MatchedNotice) {
    const ev = evalMap.get(m.id)
    return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px;page-break-inside:avoid">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:10px">
        <div style="font-size:16px;font-weight:800;color:#3b82f6;background:#dbeafe;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m.score}</div>
        <div style="flex:1">
          ${ev ? recBadge(ev.recommendation) : ''}
          <div style="font-size:15px;font-weight:600;line-height:1.4;margin-top:6px">${m.title}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">${countryName(m.country)}${m.estimatedValue ? ` · ${fmtValue(m.estimatedValue)}` : ''}</div>
        </div>
      </div>
      <div style="font-size:13px;color:#374151;background:#f8fafc;border-left:3px solid #3b82f6;padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:10px">${m.reason}</div>
      ${ev ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        ${ev.strengths.length ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px"><strong style="color:#059669">Why you could win</strong><ul style="margin:6px 0 0;padding-left:14px;color:#374151">${ev.strengths.map(s => `<li>${s}</li>`).join('')}</ul></div>` : ''}
        ${ev.risks.length ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px"><strong style="color:#e11d48">Risks</strong><ul style="margin:6px 0 0;padding-left:14px;color:#374151">${ev.risks.map(r => `<li>${r}</li>`).join('')}</ul></div>` : ''}
      </div>
      ${ev.key_requirement ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-top:10px;font-size:12px"><strong style="color:#d97706">Key requirement: </strong>${ev.key_requirement}</div>` : ''}
      ` : ''}
      <a href="${m.url}" style="font-size:12px;color:#3b82f6;margin-top:10px;display:inline-block">View on TED →</a>
    </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>TenderMind Evaluation Report</title>
<style>* { box-sizing:border-box;margin:0;padding:0 } body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;padding:40px;max-width:900px;margin:0 auto } @media print { body { padding:20px } }</style>
</head><body>
  <div style="border-bottom:2px solid #3b82f6;padding-bottom:20px;margin-bottom:28px">
    <div style="font-size:22px;font-weight:800;color:#3b82f6">Tender<span style="color:#1e293b">Mind</span></div>
    <h1 style="font-size:24px;font-weight:700;margin:10px 0 4px">Evaluation Report</h1>
    <div style="font-size:13px;color:#64748b">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin-bottom:24px;font-size:14px;color:#1e293b;line-height:1.6">${session.company_description}</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px">
    ${[['Tenders found', matches.length, '#3b82f6'], ['Pursue', pursuing.length, '#059669'], ['Consider', consider.length, '#d97706'], ['Skip', skipping.length, '#64748b']].map(([l, v, c]) =>
    `<div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px"><div style="font-size:28px;font-weight:800;color:${c}">${v}</div><div style="font-size:12px;color:#64748b;margin-top:4px">${l}</div></div>`
  ).join('')}
  </div>
  ${session.analyst_summary ? `<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;margin-bottom:28px;font-size:14px;line-height:1.6"><strong style="color:#7c3aed">Strategic Assessment</strong><p style="margin-top:8px;color:#374151">${session.analyst_summary}</p></div>` : ''}
  ${pursuing.length ? `<h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:24px 0 14px">🎯 Pursue (${pursuing.length})</h2>${pursuing.map(cardHtml).join('')}` : ''}
  ${consider.length ? `<h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:24px 0 14px">🤔 Consider (${consider.length})</h2>${consider.map(cardHtml).join('')}` : ''}
  ${skipping.length ? `<h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:24px 0 14px">⏭ Skip (${skipping.length})</h2>${skipping.map(cardHtml).join('')}` : ''}
  ${uneval.length ? `<h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:24px 0 14px">Pending evaluation (${uneval.length})</h2>${uneval.map(cardHtml).join('')}` : ''}
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) win.addEventListener('load', () => setTimeout(() => win.print(), 500))
}

// ─── Summary panel ────────────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: string }) {
  // Parse out **Immediate action:** if present
  const parts = summary.split('**Immediate action:**')
  const mainText = parts[0].trim()
  const action   = parts[1]?.trim()

  return (
    <div className="bg-purple-500/5 border border-purple-500/30 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2">
        <span>🧠</span> Strategic Assessment
      </h3>
      <p className="text-sm text-slate-300 leading-relaxed">{mainText}</p>
      {action && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-400 mb-1">Immediate action (next 48h)</p>
          <p className="text-sm text-slate-200">{action}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Full load + periodic poll while analyst is running
  const fetchSession = async () => {
    try {
      const res = await fetch(`${API}/api/sessions/${id}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Session = await res.json()
      setSession(data)
      setLoading(false)
      return data.status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
      setLoading(false)
      return 'error'
    }
  }

  useEffect(() => {
    fetchSession().then(status => {
      // Poll every 3s while analyst is still running
      if (status === 'analyst_running') {
        pollRef.current = setInterval(async () => {
          const newStatus = await fetchSession()
          if (newStatus === 'complete' || newStatus === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }, 3000)
      }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 text-sm">Loading session...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-red-400 text-sm">{error}</div>
    </div>
  )

  if (!session) return null

  // scout_matches is JSONB — guard against it arriving as a string
  const rawMatches = session.scout_matches
  const matches: MatchedNotice[] = Array.isArray(rawMatches)
    ? rawMatches
    : typeof rawMatches === 'string'
      ? JSON.parse(rawMatches)
      : []
  const evals = session.evaluations ?? []
  const evalMap = new Map(evals.map(e => [e.notice_id, e]))
  const sorted  = [...matches].sort((a, b) => b.score - a.score)

  const pursuing  = evals.filter(e => e.recommendation === 'pursue').length
  const skipping  = evals.filter(e => e.recommendation === 'skip').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-100 font-bold text-lg flex items-center gap-2">
              <span className="text-blue-400">⬡</span> TenderMind
            </Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-slate-500">Session</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={session.status} />
            {session.status === 'complete' && (
              <button
                onClick={() => exportSessionReport(session, sorted, evalMap)}
                className="text-xs text-blue-400 hover:text-blue-300 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                ↓ Export PDF
              </button>
            )}
            <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
              All sessions →
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Session meta */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-600 mb-2 uppercase tracking-wider">Company searched</p>
          <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{session.company_description}</p>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
            {session.country_filter && <span>Country: {countryName(session.country_filter)}</span>}
            <span>Started: {new Date(session.created_at).toLocaleString()}</span>
            {session.completed_at && <span>Completed: {new Date(session.completed_at).toLocaleString()}</span>}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Tenders found', value: session.match_count, color: 'text-blue-400' },
            { label: 'Evaluated',     value: evals.length,        color: 'text-purple-400' },
            { label: 'Pursue',        value: pursuing,            color: 'text-emerald-400' },
            { label: 'Skip',          value: skipping,            color: 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Strategic summary */}
        {session.analyst_summary && <SummaryPanel summary={session.analyst_summary} />}

        {/* Analyst running indicator */}
        {session.status === 'analyst_running' && (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-purple-700 border-t-purple-400 rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-purple-300">Analyst agent evaluating bid strategy...</p>
              <p className="text-xs text-slate-500 mt-0.5">Evaluations appear below as they complete. This page updates automatically.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {session.status === 'error' && session.error_message && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {session.error_message}
          </div>
        )}

        {/* Tender cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {sorted.length} tender{sorted.length !== 1 ? 's' : ''} — click any to see evaluation
            </h2>
            <Link href="/search" className="text-xs text-blue-400 hover:text-blue-300">
              ← New search
            </Link>
          </div>
          <div className="space-y-3">
            {sorted.map((notice, i) => (
              <TenderCard
                key={notice.id}
                notice={notice}
                evaluation={evalMap.get(notice.id)}
                index={i}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
