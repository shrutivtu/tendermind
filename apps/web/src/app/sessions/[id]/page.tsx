'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { countryName, fmtDate, fmtValue } from '@/lib/format'
import { UserMenu } from '@/components/ui/UserMenu'

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

type Filter = 'all' | 'pursue' | 'consider' | 'skip' | 'pending'

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
    pursue:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    consider:'bg-amber-500/15 text-amber-300 border-amber-500/30',
    skip:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }
  const labels = { pursue: 'Pursue', consider: 'Consider', skip: 'Skip' }
  return (
    <span className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${styles[rec]}`}>
      {labels[rec]}
    </span>
  )
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

  const meta = [
    countryName(notice.country),
    notice.estimatedValue ? fmtValue(notice.estimatedValue) : null,
    notice.deadline ? `due ${fmtDate(notice.deadline)}` : null,
  ].filter(Boolean)

  return (
    <div
      className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden animate-fade-in hover:border-slate-600 transition-all duration-300"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Collapsed row */}
      <div
        className="group p-5 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex gap-4">
          <ScoreRing score={notice.score} />
          <div className="flex-1 min-w-0">
            {/* Title row — verdict is the one chip allowed */}
            <div className="flex items-start justify-between gap-3">
              <h3 className={`text-[15px] font-semibold text-slate-100 leading-snug ${expanded ? '' : 'line-clamp-2'}`}>
                {notice.title}
              </h3>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                {evaluation && <RecBadge rec={evaluation.recommendation} />}
                <span className="text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
                  {expanded ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* One quiet meta line */}
            <p className="text-xs text-slate-500 mt-1.5">{meta.join(' · ')}</p>

            {/* Scout's reason */}
            <p className={`text-xs text-slate-400 leading-relaxed border-l-2 border-blue-500/40 pl-3 mt-3 ${expanded ? '' : 'line-clamp-2'}`}>
              {notice.reason}
            </p>
          </div>
        </div>
      </div>

      {/* Expanded: analyst evaluation */}
      {expanded && (
        <div className="border-t border-slate-800 px-5 py-4 animate-fade-in space-y-4">

          {/* Tender metadata */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {notice.buyerName && (
              <div className="sm:col-span-2 flex gap-2">
                <dt className="text-slate-600 shrink-0">Buyer</dt>
                <dd className="text-slate-300">{notice.buyerName}</dd>
              </div>
            )}
            {notice.deadline && (
              <div className="flex gap-2">
                <dt className="text-slate-600 shrink-0">Deadline</dt>
                <dd className="text-orange-300">{fmtDate(notice.deadline)}</dd>
              </div>
            )}
            {notice.cpvCodes.length > 0 && (
              <div className="sm:col-span-2 flex gap-2">
                <dt className="text-slate-600 shrink-0">CPV</dt>
                <dd className="text-slate-400">{notice.cpvCodes.join(', ')}</dd>
              </div>
            )}
          </dl>

          {/* Analyst evaluation */}
          {evaluation ? (
            <div className="space-y-4">
              {/* Verdict facts — one inline line */}
              <p className="text-xs text-slate-500">
                Win probability{' '}
                <span className={{ high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-red-400' }[evaluation.win_probability] + ' font-semibold'}>
                  {evaluation.win_probability}
                </span>
                <span className="mx-2 text-slate-700">·</span>
                Priority <span className="text-slate-300">{'★'.repeat(evaluation.priority)}<span className="text-slate-700">{'★'.repeat(5 - evaluation.priority)}</span></span>
                <span className="mx-2 text-slate-700">·</span>
                Bid effort{' '}
                <span className={{ low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400' }[evaluation.estimated_effort] + ' font-semibold'}>
                  {evaluation.estimated_effort}
                </span>
              </p>

              {/* Strengths / risks — clean two-column lists, no boxes */}
              {(evaluation.strengths.length > 0 || evaluation.risks.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {evaluation.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 mb-2">Why you could win</p>
                      <ul className="space-y-1.5">
                        {evaluation.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                            <span className="text-emerald-500 shrink-0">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {evaluation.risks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-2">Risks to watch</p>
                      <ul className="space-y-1.5">
                        {evaluation.risks.map((r, i) => (
                          <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                            <span className="text-red-500 shrink-0">!</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {evaluation.key_requirement && (
                <div className="border-l-2 border-amber-500/60 pl-3">
                  <p className="text-xs font-semibold text-amber-400 mb-0.5">Key requirement to verify</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{evaluation.key_requirement}</p>
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
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
      <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Strategic assessment</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{mainText}</p>
      {action && (
        <div className="border-l-2 border-amber-500/60 pl-3">
          <p className="text-xs font-semibold text-amber-400 mb-0.5">Immediate action (next 48h)</p>
          <p className="text-sm text-slate-200 leading-relaxed">{action}</p>
        </div>
      )}
    </div>
  )
}

// ─── Segmented filter ─────────────────────────────────────────────────────────

function FilterTabs({
  filter, setFilter, counts
}: {
  filter: Filter
  setFilter: (f: Filter) => void
  counts: Record<Filter, number>
}) {
  const tabs: { key: Filter; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pursue',   label: 'Pursue' },
    { key: 'consider', label: 'Consider' },
    { key: 'skip',     label: 'Skip' },
    ...(counts.pending > 0 ? [{ key: 'pending' as Filter, label: 'Pending' }] : []),
  ]

  return (
    <div className="inline-flex items-center bg-slate-900/80 border border-slate-800 rounded-xl p-1 gap-0.5">
      {tabs.map(t => {
        const active = filter === t.key
        return (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
              active
                ? 'bg-slate-700/80 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            <span className={`text-xs tabular-nums ${active ? 'text-slate-300' : 'text-slate-600'}`}>
              {counts[t.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState<Filter>('all')
  const [descOpen, setDescOpen] = useState(false)
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

  const counts: Record<Filter, number> = {
    all:      sorted.length,
    pursue:   evals.filter(e => e.recommendation === 'pursue').length,
    consider: evals.filter(e => e.recommendation === 'consider').length,
    skip:     evals.filter(e => e.recommendation === 'skip').length,
    pending:  sorted.filter(m => !evalMap.has(m.id)).length,
  }

  const filtered = sorted.filter(m => {
    if (filter === 'all') return true
    if (filter === 'pending') return !evalMap.has(m.id)
    return evalMap.get(m.id)?.recommendation === filter
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Session meta — one quiet expandable line, no box */}
        <div className="text-sm">
          <button
            onClick={() => setDescOpen(o => !o)}
            className="text-left w-full group"
          >
            <span className="text-slate-600">Searched for: </span>
            <span className={`text-slate-300 ${descOpen ? '' : 'line-clamp-1'} inline`}>
              {descOpen ? session.company_description : `${session.company_description.slice(0, 110)}${session.company_description.length > 110 ? '…' : ''}`}
            </span>
            {session.company_description.length > 110 && (
              <span className="text-slate-600 group-hover:text-slate-400 transition-colors ml-1 text-xs">
                {descOpen ? ' show less' : ' show more'}
              </span>
            )}
          </button>
          <p className="text-xs text-slate-600 mt-1.5">
            {session.country_filter && <>{countryName(session.country_filter)} <span className="mx-1.5 text-slate-800">·</span></>}
            {new Date(session.created_at).toLocaleString()}
            {session.completed_at && <> → {new Date(session.completed_at).toLocaleTimeString()}</>}
          </p>
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

        {/* Filter + tender cards */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <FilterTabs filter={filter} setFilter={setFilter} counts={counts} />
            <Link href="/search" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← New search
            </Link>
          </div>

          <div className="space-y-3" key={filter}>
            {filtered.map((notice, i) => (
              <TenderCard
                key={notice.id}
                notice={notice}
                evaluation={evalMap.get(notice.id)}
                index={i}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-slate-600 py-12">
                No tenders in this category.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
