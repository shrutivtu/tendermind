'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserMenu } from '@/components/ui/UserMenu'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface SessionRow {
  id: string
  company_description: string
  country_filter: string | null
  status: string
  match_count: number
  top_score: number | null
  eval_count: number
  created_at: string
  completed_at: string | null
}

const ALPHA3_TO_2: Record<string, string> = {
  DEU:'DE', FRA:'FR', ESP:'ES', ITA:'IT', POL:'PL', NLD:'NL',
  BEL:'BE', SWE:'SE', IRL:'IE', CZE:'CZ', ROU:'RO', HRV:'HR',
}
function countryName(a3: string | null) {
  if (!a3) return 'All EU'
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(ALPHA3_TO_2[a3] ?? a3) ?? a3 }
  catch { return a3 }
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function StatusDot({ status }: { status: string }) {
  const color = {
    scout_running:   'bg-blue-400 animate-pulse',
    analyst_running: 'bg-purple-400 animate-pulse',
    complete:        'bg-emerald-400',
    error:           'bg-red-400',
  }[status] ?? 'bg-slate-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    scout_running:   'Scouting',
    analyst_running: 'Analysing',
    complete:        'Complete',
    error:           'Error',
  }
  return <span className="text-xs text-slate-500">{labels[status] ?? status}</span>
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)

  const load = async () => {
    try {
      const me = await fetch(`${API}/api/auth/me`, { credentials: 'include' })
      if (!me.ok) {
        setNeedsLogin(true)
        setSessions([])
        return
      }
      setNeedsLogin(false)

      const res = await fetch(`${API}/api/sessions`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSessions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Refresh every 5s if any sessions are still running
    const interval = setInterval(() => {
      if (sessions.some(s => s.status === 'scout_running' || s.status === 'analyst_running')) {
        load()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [sessions.length])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-slate-100 font-bold text-lg flex items-center gap-2">
            <span className="text-blue-400">⬡</span> TenderMind
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/search"
              className="bg-blue-600 hover:bg-blue-500 transition-colors text-white text-sm font-semibold px-4 py-2 rounded-xl">
              + New search
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Session history</h1>
          <p className="text-slate-400 text-sm mt-1">All past Scout + Analyst runs. Results persist here.</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-3" />
            Loading...
          </div>
        )}

        {!loading && needsLogin && (
          <div className="text-center py-20 border border-slate-800 rounded-2xl bg-slate-900/40">
            <p className="text-sm font-semibold text-slate-200 mb-2">Create a free account to save your tender history.</p>
            <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
              You can still run demo searches without signing in. The dashboard is for private saved analyses, saved tenders, and team workspaces.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                Sign in or create account
              </Link>
              <Link href="/search" className="border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                Try the AI agent first
              </Link>
            </div>
          </div>
        )}

        {!loading && !needsLogin && sessions.length === 0 && (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-500 mb-4">No sessions yet.</p>
            <Link href="/search" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Run your first search →
            </Link>
          </div>
        )}

        {!needsLogin && <div className="space-y-3">
          {sessions.map(s => (
            <Link key={s.id} href={`/sessions/${s.id}`}
              className="block bg-slate-900/60 border border-slate-800 hover:border-slate-600 rounded-xl p-5 transition-all group">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusDot status={s.status} />
                    <StatusLabel status={s.status} />
                    <span className="text-slate-700">·</span>
                    <span className="text-xs text-slate-500">{countryName(s.country_filter)}</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-xs text-slate-500">{timeAgo(s.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-200 font-medium line-clamp-2 leading-snug">
                    {s.company_description}
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-400">{s.match_count}</div>
                    <div className="text-xs text-slate-600">tenders</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-purple-400">{s.eval_count}</div>
                    <div className="text-xs text-slate-600">evaluated</div>
                  </div>
                  {s.top_score && (
                    <div>
                      <div className="text-lg font-bold text-emerald-400">{s.top_score}</div>
                      <div className="text-xs text-slate-600">top score</div>
                    </div>
                  )}
                  <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-lg">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>}
      </div>
    </div>
  )
}
