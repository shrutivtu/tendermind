'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { runScout, type MatchedNotice } from '@/lib/scout-stream'
import { exportReport } from '@/lib/format'
import { COUNTRIES, SAMPLE_DESCRIPTION } from './constants'

import { TenderCard }      from '@/components/agents/TenderCard'
import { ThinkingFeed }    from '@/components/agents/ThinkingFeed'
import { HowItWorksModal } from '@/components/agents/HowItWorksModal'
import { SkeletonCard }    from '@/components/ui/SkeletonCard'
import { SearchError }     from '@/components/ui/SearchError'
import { CountrySelect }   from '@/components/ui/CountrySelect'
import { UserMenu }        from '@/components/ui/UserMenu'

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'form' | 'running' | 'done'

// How many skeleton placeholders to show while loading
const SKELETON_COUNT = 5

// ─── Mini explainer data ──────────────────────────────────────────────────────
const EXPLAINER_STEPS = [
  { icon: '📋', label: 'Scan',   desc: 'EU & UK public tenders, updated daily' },
  { icon: '🎯', label: 'Match',  desc: 'Ranked by relevance to your business' },
  { icon: '📊', label: 'Decide', desc: 'Bid/no-bid with score & reasoning' },
] as const

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [phase,          setPhase]          = useState<Phase>('form')
  const [description,    setDescription]    = useState('')
  const [country,        setCountry]        = useState('')
  const [status,         setStatus]         = useState('')
  const [thinkingText,   setThinkingText]   = useState('')
  const [matches,        setMatches]        = useState<MatchedNotice[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [totalDone,      setTotalDone]      = useState(0)
  const [error,          setError]          = useState('')
  const [showModal,      setShowModal]      = useState(false)
  const [isDemoMode,     setIsDemoMode]     = useState(false)
  const [sessionId,      setSessionId]      = useState('')
  const [showReasoning,      setShowReasoning]      = useState(false)
  const [includeHistorical,  setIncludeHistorical]  = useState(false)

  const thinkingRef  = useRef('')
  const descRef      = useRef('')
  const router       = useRouter()

  // Detect ?demo=true and pre-fill
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'true') {
      setDescription(SAMPLE_DESCRIPTION)
      setIsDemoMode(true)
    }
  }, [])

  // ── Core search logic ──────────────────────────────────────────────────────
  const runSearch = async (desc: string, countryFilter?: string, historical = false) => {
    if (!desc.trim()) return

    descRef.current = desc
    setPhase('running')
    setStatus('')
    setThinkingText('')
    setMatches([])
    setError('')
    setCandidateCount(0)
    thinkingRef.current = ''

    await runScout(desc, countryFilter || undefined, {
      onStatus:     msg   => setStatus(msg),
      onCandidates: count => setCandidateCount(count),
      onThinking:   text  => {
        thinkingRef.current += text
        setThinkingText(thinkingRef.current)
      },
      onMatch:      notice => setMatches(prev => [...prev, notice]),
      onSessionId:  id     => setSessionId(id),
      onDone:       total  => {
        setTotalDone(total)
        setPhase('done')
      },
      onError: msg => { setError(msg); setPhase('done') },
    }, historical)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void runSearch(description, country, includeHistorical)
  }

  const reset = () => {
    setPhase('form')
    setMatches([])
    setThinkingText('')
    setError('')
    setSessionId('')
    thinkingRef.current = ''
  }

  const sorted = [...matches].sort((a, b) => b.score - a.score)

  // Skeletons to show: fill remaining slots while running
  const skeletonsToShow =
    phase === 'running' ? Math.max(0, SKELETON_COUNT - matches.length) : 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {showModal && <HowItWorksModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-slate-100 font-bold text-lg">
            <span className="text-blue-400">⬡</span> TenderMind
          </a>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg"
            >
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">?</span>
              How it works
            </button>
            <span className="text-xs text-slate-600 hidden sm:block">EU &amp; UK procurement · Updated daily</span>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* ── FORM PHASE ─────────────────────────────────────────────────────── */}
        {phase === 'form' && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-8 text-center animate-fade-in-up" style={{ animationDelay: '0ms' }}>
              <h1 className="text-3xl font-bold mb-2">Find your next public contract</h1>
              <p className="text-slate-400">
                Describe what your company does. Our AI searches EU and UK public tenders
                and ranks the best matches with scored explanations.
              </p>
            </div>

            {/* Demo banner */}
            {isDemoMode && (
              <div className="mb-6 flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300 animate-fade-in">
                <span className="mt-0.5 shrink-0">✨</span>
                <span>
                  <strong className="text-blue-200">Demo mode</strong> — we&apos;ve pre-filled a sample company description.
                  Edit it to match your business or click <strong className="text-blue-200">Run Scout Agent</strong> to see how TenderMind works.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    What does your company do?
                  </label>
                  {!isDemoMode && (
                    <button
                      type="button"
                      onClick={() => { setDescription(SAMPLE_DESCRIPTION); setIsDemoMode(true) }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Try a sample search →
                    </button>
                  )}
                </div>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. We develop custom software for hospitals — patient management systems, EHR integration, and clinical data analytics."
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-slate-600 mt-1">Be specific — mention your industry, services, and target markets.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Preferred country <span className="text-slate-600 font-normal">(optional)</span>
                </label>
                <CountrySelect
                  options={COUNTRIES}
                  value={country}
                  onChange={setCountry}
                />
              </div>

              {/* Historical toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <div
                  onClick={() => setIncludeHistorical(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    includeHistorical ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    includeHistorical ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </div>
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  Include past tenders
                  <span className="ml-1.5 text-xs text-slate-600">— see what contracts existed in your space</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={!description.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white font-semibold py-3 rounded-xl"
              >
                Run Scout Agent →
              </button>
            </form>

            {/* Mini explainer */}
            <div className="mt-10 grid grid-cols-3 gap-4 text-center animate-fade-in-up" style={{ animationDelay: '220ms' }}>
              {EXPLAINER_STEPS.map(s => (
                <div key={s.label} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">{s.label}</div>
                  <div className="text-xs text-slate-600">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RUNNING / DONE PHASE ───────────────────────────────────────────── */}
        {(phase === 'running' || phase === 'done') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* Left: agent status panel */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-5">
                {/* Status + inline counters */}
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${phase === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
                    {phase === 'running' ? 'Scout Agent running' : 'Analysis complete'}
                  </h2>
                  {phase === 'running' && status && (
                    <p className="text-xs text-slate-500 mt-1.5">{status}</p>
                  )}
                  <p className="text-sm text-slate-500 mt-2.5">
                    <span className="text-blue-400 font-semibold">{candidateCount}</span> candidates
                    <span className="mx-2 text-slate-700">·</span>
                    <span className="text-emerald-400 font-semibold">{matches.length}</span> matches
                  </p>
                </div>

                {/* Actions */}
                {phase === 'done' && !error && (
                  <div className="space-y-3">
                    {sessionId && (
                      <Link
                        href={`/sessions/${sessionId}`}
                        className="w-full bg-blue-600 hover:bg-blue-500 transition-colors text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                      >
                        View detailed evaluations →
                      </Link>
                    )}
                    <div className="flex items-center justify-center gap-5 text-xs">
                      <button
                        onClick={() => exportReport(descRef.current, sorted)}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        ↓ Export PDF
                      </button>
                      <span className="text-slate-700">·</span>
                      <button onClick={reset} className="text-slate-400 hover:text-white transition-colors">
                        ← New search
                      </button>
                    </div>
                  </div>
                )}

                {phase === 'done' && error && (
                  <button
                    onClick={reset}
                    className="w-full border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition-colors py-2.5 rounded-xl text-sm"
                  >
                    ← New search
                  </button>
                )}

                {/* AI reasoning — open while running, disclosure once done */}
                {thinkingText && phase === 'running' && <ThinkingFeed text={thinkingText} streaming />}
                {thinkingText && phase === 'done' && (
                  <div className="border-t border-slate-800 pt-4">
                    <button
                      onClick={() => setShowReasoning(s => !s)}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showReasoning ? '▾ Hide AI reasoning' : '▸ Show AI reasoning'}
                    </button>
                    {showReasoning && (
                      <div className="mt-3">
                        <ThinkingFeed text={thinkingText} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: results */}
            <div className="lg:col-span-3">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {phase === 'done' && !error
                    ? `${totalDone} relevant tender${totalDone !== 1 ? 's' : ''}`
                    : phase === 'running'
                    ? 'Matches appearing…'
                    : 'Search failed'}
                </h2>
                {phase === 'done' && !error && matches.length > 0 && (
                  <span className="text-xs text-slate-600">sorted by relevance</span>
                )}
              </div>

              {/* Error state */}
              {phase === 'done' && error && (
                <div className="space-y-4">
                  <SearchError message={error} onRetry={reset} />
                  {error.toLowerCase().includes('free demo searches') && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-200">Ready for a private workspace?</p>
                        <p className="text-xs text-slate-400 mt-1">Create a free account to keep going and save your analyses.</p>
                      </div>
                      <Link href="/login" className="text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                        Create account
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Real cards */}
              {!error && (
                <div className="space-y-3">
                  {sorted.map((notice, i) => (
                    <TenderCard key={notice.id} notice={notice} index={i} />
                  ))}

                  {/* Skeleton placeholders while loading */}
                  {Array.from({ length: skeletonsToShow }).map((_, i) => (
                    <SkeletonCard key={`skel-${i}`} delay={i * 100} />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {phase === 'done' && !error && matches.length === 0 && (
                <div className="text-center py-16 text-slate-500 animate-fade-in">
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
