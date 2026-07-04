'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Demo simulation data ─────────────────────────────────────────────────────
const DEMO_SCENARIOS = [
  {
    description: 'We build patient management software and EHR integrations for hospitals across Europe.',
    tenders: [
      { title: 'Hospital Information System Modernisation', place: '🇩🇪 Munich', value: '€2.4M', score: 94, verdict: 'Pursue' as const },
      { title: 'EHR Integration Framework — Regional Health', place: '🇫🇷 Lyon', value: '€870K', score: 88, verdict: 'Pursue' as const },
      { title: 'Clinical Data Analytics Platform', place: '🇬🇧 NHS Trust', value: '£1.1M', score: 79, verdict: 'Consider' as const },
    ],
  },
  {
    description: 'Structural engineering consultancy specialising in bridges and public infrastructure.',
    tenders: [
      { title: 'Motorway Bridge Inspection & Renewal', place: '🇳🇱 Utrecht', value: '€5.2M', score: 92, verdict: 'Pursue' as const },
      { title: 'Pedestrian Bridge Design Competition', place: '🇸🇪 Gothenburg', value: '€640K', score: 85, verdict: 'Pursue' as const },
      { title: 'Port Infrastructure Feasibility Study', place: '🇪🇸 Valencia', value: '€380K', score: 74, verdict: 'Consider' as const },
    ],
  },
  {
    description: 'We provide cloud migration, DevOps, and managed Kubernetes for the public sector.',
    tenders: [
      { title: 'Government Cloud Platform Migration', place: '🇮🇪 Dublin', value: '€3.1M', score: 96, verdict: 'Pursue' as const },
      { title: 'Container Platform for Tax Authority', place: '🇵🇱 Warsaw', value: '€1.5M', score: 87, verdict: 'Pursue' as const },
      { title: 'Legacy System Cloud Assessment', place: '🇧🇪 Brussels', value: '€290K', score: 71, verdict: 'Consider' as const },
    ],
  },
]

const SECTORS_ROW_A = [
  '💻 IT & Software', '🏗️ Construction', '🏥 Healthcare', '⚡ Energy', '🔬 R&D Services',
  '🚆 Transport', '🌱 Environment', '📡 Telecoms', '🛡️ Security',
]
const SECTORS_ROW_B = [
  '📊 Consulting', '🎓 Education', '💧 Water & Utilities', '🏛️ Architecture', '🚚 Logistics',
  '⚖️ Legal Services', '🧪 Laboratory', '🖨️ Print & Media', '🍽️ Catering',
]

const STATS = [
  { value: 2, prefix: '€', suffix: 'T+', label: 'EU procurement market / year', decimals: 0 },
  { value: 28, prefix: '', suffix: '', label: 'countries covered (EU + UK)', decimals: 0 },
  { value: 3500, prefix: '', suffix: '+', label: 'new notices ingested daily', decimals: 0 },
  { value: 2, prefix: '<', suffix: ' min', label: 'from description to decision', decimals: 0 },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Counts from 0 → target once `started` flips true. */
function useCountUp(target: number, started: boolean, duration = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!started) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, started, duration])
  return value
}

/** True once the element scrolls into view (fires once). */
function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ─── Live demo simulation ─────────────────────────────────────────────────────
type DemoPhase = 'typing' | 'searching' | 'results'

function LiveDemo() {
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [phase, setPhase] = useState<DemoPhase>('typing')
  const [typedLen, setTypedLen] = useState(0)
  const [visibleResults, setVisibleResults] = useState(0)

  const scenario = DEMO_SCENARIOS[scenarioIdx]!
  const fullText = scenario.description

  // Phase: typing — time-based so timer throttling can't stall the animation
  useEffect(() => {
    if (phase !== 'typing') return
    const t0 = performance.now()
    const id = setInterval(() => {
      setTypedLen(Math.min(Math.floor((performance.now() - t0) / 20), fullText.length))
    }, 35)
    return () => clearInterval(id)
  }, [phase, fullText.length])

  // Advance once typing completes
  useEffect(() => {
    if (phase !== 'typing' || typedLen < fullText.length) return
    const t = setTimeout(() => setPhase('searching'), 500)
    return () => clearTimeout(t)
  }, [phase, typedLen, fullText.length])

  // Phase: searching
  useEffect(() => {
    if (phase !== 'searching') return
    const t = setTimeout(() => setPhase('results'), 1300)
    return () => clearTimeout(t)
  }, [phase])

  // Phase: results — reveal cards one by one, hold, then next scenario
  useEffect(() => {
    if (phase !== 'results') return
    if (visibleResults < scenario.tenders.length) {
      const t = setTimeout(() => setVisibleResults(n => n + 1), 550)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setScenarioIdx(i => (i + 1) % DEMO_SCENARIOS.length)
      setTypedLen(0)
      setVisibleResults(0)
      setPhase('typing')
    }, 3400)
    return () => clearTimeout(t)
  }, [phase, visibleResults, scenario.tenders.length])

  return (
    <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 backdrop-blur-sm shadow-2xl shadow-black/50 overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
        <span className="ml-3 text-xs text-slate-500 font-mono">tendermind — scout agent</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          live
        </span>
      </div>

      <div className="p-5 space-y-4 min-h-[380px]">
        {/* Input line */}
        <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">Your company</p>
          <p className="text-sm text-slate-200 leading-relaxed min-h-[42px]">
            {fullText.slice(0, typedLen)}
            {phase === 'typing' && <span className="inline-block w-[2px] h-4 bg-blue-400 align-middle ml-0.5 animate-caret" />}
          </p>
        </div>

        {/* Searching indicator */}
        {phase === 'searching' && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 animate-fade-in">
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
              </svg>
              Scanning 14,000+ live tenders…
            </div>
            <div className="relative mt-3 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan" />
            </div>
          </div>
        )}

        {/* Result cards */}
        {phase === 'results' && (
          <div className="space-y-2.5">
            {scenario.tenders.slice(0, visibleResults).map(t => (
              <div
                key={t.title}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 animate-fade-in-up"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{t.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.place} · {t.value}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      t.verdict === 'Pursue'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {t.verdict}
                  </span>
                </div>
                {/* Match score bar */}
                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 animate-bar-grow"
                      style={{ width: `${t.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-cyan-300 w-8 text-right">{t.score}</span>
                </div>
              </div>
            ))}
            {visibleResults >= scenario.tenders.length && (
              <p className="text-xs text-slate-600 text-center pt-1 animate-fade-in">
                Analyst agent writing bid/no-bid rationale…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Spotlight card (mouse-follow glow) ───────────────────────────────────────
function SpotlightCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`)
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`)
  }, [])

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`group relative rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden transition-colors duration-300 hover:border-slate-600 ${className}`}
    >
      {/* Glow layer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(59, 130, 246, 0.14), transparent 65%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

// ─── Animated stat ────────────────────────────────────────────────────────────
function Stat({ value, prefix, suffix, label, started }: (typeof STATS)[number] & { started: boolean }) {
  const n = useCountUp(value, started)
  const display = value >= 1000 ? Math.round(n).toLocaleString('en-US') : Math.round(n).toString()
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-bold tracking-tight text-white tabular-nums">
        {prefix}{display}{suffix}
      </div>
      <div className="text-xs md:text-sm text-slate-500 mt-1.5">{label}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const stats = useInView<HTMLDivElement>()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-semibold text-white tracking-tight">TenderMind</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
          </div>
          <Link
            href="/search"
            className="text-sm bg-blue-600 hover:bg-blue-500 transition-colors text-white font-medium px-4 py-2 rounded-lg"
          >
            Get started →
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Grid backdrop */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Aurora blobs */}
        <div className="absolute -top-24 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-blob" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-cyan-500/[0.07] rounded-full blur-3xl pointer-events-none animate-blob-slow" />

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-400 mb-8 animate-fade-in-up">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live EU &amp; UK procurement data
            </div>

            <h1 className="text-4xl md:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.08] mb-6 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
              Billions in public contracts.
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                Find the ones you can win.
              </span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: '160ms' }}>
              Describe your company in one paragraph. Two AI agents scan every open
              EU and UK tender, rank the matches, and tell you which ones to bid on — and why.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
              <Link
                href="/search"
                className="bg-blue-600 hover:bg-blue-500 transition-all text-white font-semibold px-8 py-3.5 rounded-xl text-base shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                Find my tenders →
              </Link>
              <Link
                href="/search?demo=true"
                className="text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4 decoration-slate-700 hover:decoration-slate-400"
              >
                or try a sample search
              </Link>
            </div>

            <div className="mt-12 flex items-center gap-6 text-xs text-slate-600 animate-fade-in-up" style={{ animationDelay: '320ms' }}>
              <span className="flex items-center gap-1.5">🇪🇺 TED database</span>
              <span className="flex items-center gap-1.5">🇬🇧 Find a Tender</span>
              <span className="flex items-center gap-1.5">⚡ Free to try</span>
            </div>
          </div>

          {/* Right: live simulation */}
          <div className="animate-fade-in-scale" style={{ animationDelay: '300ms' }}>
            <LiveDemo />
          </div>
        </div>
      </section>

      {/* ── Sector marquee ───────────────────────────────────────────────── */}
      <section className="py-10 border-y border-slate-800/60 space-y-4 marquee-mask">
        <div className="flex w-max animate-marquee gap-3">
          {[...SECTORS_ROW_A, ...SECTORS_ROW_A].map((s, i) => (
            <span key={i} className="whitespace-nowrap px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 text-sm text-slate-400">
              {s}
            </span>
          ))}
        </div>
        <div className="flex w-max animate-marquee-reverse gap-3">
          {[...SECTORS_ROW_B, ...SECTORS_ROW_B].map((s, i) => (
            <span key={i} className="whitespace-nowrap px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 text-sm text-slate-400">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div ref={stats.ref} className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
          {STATS.map(s => (
            <Stat key={s.label} {...s} started={stats.inView} />
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-slate-800/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-blue-400 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">From description to decision in minutes</h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-6">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-5 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-blue-500/40 via-slate-700 to-blue-500/40" />

            {[
              {
                n: '01',
                title: 'Describe your company',
                body: 'One paragraph in plain English — your services, sector, target markets. No forms, no CPV codes.',
              },
              {
                n: '02',
                title: 'Scout finds your matches',
                body: 'Semantic search across every open EU & UK notice, ranked by fit and streamed to you in real time.',
              },
              {
                n: '03',
                title: 'Analyst calls bid or no-bid',
                body: 'Every match gets a recommendation, win probability, key risks, and your competitive strengths.',
              },
            ].map((step, i) => (
              <div key={step.n} className="relative text-center md:text-left animate-fade-in-scale" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="relative z-10 w-10 h-10 mx-auto md:mx-0 rounded-xl bg-slate-950 border border-blue-500/30 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/10">
                  <span className="text-blue-400 font-bold text-sm">{step.n}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bento features ───────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 border-t border-slate-800/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-blue-400 uppercase tracking-widest mb-3">Under the hood</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built like an analyst, fast like a search engine</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {/* Large card — semantic matching */}
            <SpotlightCard className="md:col-span-2 p-8">
              <p className="text-xs uppercase tracking-widest text-blue-400 mb-3">Semantic matching</p>
              <h3 className="text-xl font-semibold mb-3">Meaning, not keywords</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
                Your description and every tender are embedded into the same vector space —
                so &ldquo;we build hospital software&rdquo; matches &ldquo;clinical information system procurement&rdquo;
                even when no words overlap.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400">pgvector</span>
                <span className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400">cosine similarity</span>
                <span className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400">&lt;100ms search</span>
              </div>
            </SpotlightCard>

            {/* Bid / no-bid */}
            <SpotlightCard className="p-8">
              <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Analyst agent</p>
              <h3 className="text-xl font-semibold mb-3">A verdict, not a list</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Claude evaluates each match against your profile and writes the bid/no-bid case.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">Pursue</span>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">Consider</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-xs">Skip</span>
              </div>
            </SpotlightCard>

            {/* Live streaming */}
            <SpotlightCard className="p-8">
              <p className="text-xs uppercase tracking-widest text-cyan-400 mb-3">Real-time</p>
              <h3 className="text-xl font-semibold mb-3">Watch it think</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Results stream in live as the Scout works — no spinner, no waiting for a batch job.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Server-sent events
              </div>
            </SpotlightCard>

            {/* Coverage */}
            <SpotlightCard className="md:col-span-2 p-8">
              <p className="text-xs uppercase tracking-widest text-purple-400 mb-3">Coverage</p>
              <h3 className="text-xl font-semibold mb-3">Two markets, one search</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
                EU TED and UK Find a Tender ingested daily, normalised into one schema —
                currencies converted to EUR at ECB rates, categories mapped to a shared taxonomy.
                Sessions persist, and every report exports to PDF.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>🇪🇺 27 EU countries</span>
                <span>🇬🇧 United Kingdom</span>
                <span>💱 ECB FX rates</span>
                <span>📄 PDF export</span>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="relative py-24 px-6 border-t border-slate-800/60 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Your next contract is already published.</h2>
          <p className="text-slate-400 mb-9">It&apos;s sitting in a database of 14,000 open notices. Take two minutes and find it.</p>
          <Link
            href="/search"
            className="inline-block bg-blue-600 hover:bg-blue-500 transition-all text-white font-semibold px-10 py-4 rounded-xl text-base shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
          >
            Find my tenders →
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>TenderMind</span>
          </div>
          <p>
            Data from{' '}
            <a href="https://ted.europa.eu" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors underline underline-offset-2">TED (EU)</a>
            {' '}and{' '}
            <a href="https://www.find-tender.service.gov.uk" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors underline underline-offset-2">Find a Tender (UK)</a>
          </p>
        </div>
      </footer>

    </div>
  )
}
