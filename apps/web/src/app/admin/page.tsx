'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { UserMenu } from '@/components/ui/UserMenu'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ─── Types (mirror /api/admin/stats) ──────────────────────────────────────────

interface SourceStats {
  source: string
  count: number
  lastUpdated: string | null
  upcomingDeadlines: number
}

interface SessionAgg {
  total: number
  complete: number
  error: number
  running: number
  last7d: number
  last7dComplete: number
}

interface RecentSession {
  id: string
  status: string
  matchCount: number
  description: string
  createdAt: string
  completedAt: string | null
}

interface AdminStats {
  notices: SourceStats[]
  sessions: SessionAgg
  recentSessions: RecentSession[]
  generatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  'ted': '🇪🇺 EU · TED',
  'find-tender': '🇬🇧 UK · Find a Tender',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

const STATUS_STYLES: Record<string, string> = {
  complete:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error:           'bg-red-500/15 text-red-400 border-red-500/30',
  scout_running:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  analyst_running: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/stats`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-100 font-bold text-lg flex items-center gap-2">
              <span className="text-blue-400">⬡</span> TenderMind
            </Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-slate-500">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void load()}
              className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↻ Refresh
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-sm text-red-300 text-center">
            {error}
            {error.toLowerCase().includes('admin') && (
              <p className="text-slate-500 text-xs mt-2">
                Sign in with an account listed in <code className="text-slate-400">ADMIN_EMAILS</code>.{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Sign in →</Link>
              </p>
            )}
          </div>
        )}

        {!loading && stats && (
          <>
            {/* ── Data sources ─────────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Data sources</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {stats.notices.map(s => (
                  <div key={s.source} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-slate-300">{SOURCE_LABELS[s.source] ?? s.source}</span>
                      <span
                        className={`text-xs ${new Date(s.lastUpdated ?? 0).getTime() > Date.now() - 12 * 3600_000 ? 'text-emerald-400' : 'text-amber-400'}`}
                        title={s.lastUpdated ?? undefined}
                      >
                        updated {timeAgo(s.lastUpdated)}
                      </span>
                    </div>
                    <div className="mt-3 text-3xl font-bold tabular-nums">{s.count.toLocaleString()}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      notices · {s.upcomingDeadlines.toLocaleString()} with open deadlines
                    </div>
                  </div>
                ))}
                {stats.notices.length === 0 && (
                  <p className="text-sm text-slate-600">No notices ingested yet.</p>
                )}
              </div>
            </section>

            {/* ── Sessions ─────────────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Search sessions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="text-3xl font-bold tabular-nums">{stats.sessions.total}</div>
                  <div className="text-xs text-slate-500 mt-1">total · {stats.sessions.last7d} in last 7d</div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="text-3xl font-bold tabular-nums text-emerald-400">
                    {pct(stats.sessions.complete, stats.sessions.total)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    completion rate · {pct(stats.sessions.last7dComplete, stats.sessions.last7d)} in 7d
                  </div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="text-3xl font-bold tabular-nums text-red-400">{stats.sessions.error}</div>
                  <div className="text-xs text-slate-500 mt-1">errored</div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="text-3xl font-bold tabular-nums text-blue-400">{stats.sessions.running}</div>
                  <div className="text-xs text-slate-500 mt-1">running now</div>
                </div>
              </div>
            </section>

            {/* ── Recent sessions ──────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent sessions</h2>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-600 border-b border-slate-800">
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Matches</th>
                      <th className="px-4 py-3 font-medium w-1/2">Search</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentSessions.map(s => (
                      <tr key={s.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-900/80 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap" title={s.createdAt}>
                          {timeAgo(s.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                            {s.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{s.matchCount}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/sessions/${s.id}`}
                            title={s.description}
                            className="text-xs text-slate-400 hover:text-blue-300 transition-colors line-clamp-1"
                          >
                            {s.description}
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {stats.recentSessions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-600 text-sm">No sessions yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-700 mt-2 text-right">Generated {timeAgo(stats.generatedAt)}</p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
