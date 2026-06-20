import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Navbar ───────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-semibold text-white tracking-tight">TenderMind</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
          <Link
            href="/search"
            className="text-sm bg-blue-600 hover:bg-blue-500 transition-colors text-white font-medium px-4 py-2 rounded-lg"
          >
            Start searching →
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-32 px-6 overflow-hidden">
        {/* Subtle background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live EU procurement data · Updated daily
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            €420 billion in EU contracts.
            <br />
            <span className="text-blue-400">Find the ones you can win.</span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            TenderMind uses AI to scan the EU&apos;s official tender database,
            match opportunities to your company, and give you a bid/no-bid
            recommendation — in under two minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/search"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 transition-all text-white font-semibold px-8 py-3.5 rounded-lg text-base shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
            >
              Find tenders for my business →
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition-colors font-medium px-6 py-3.5 rounded-lg text-base"
            >
              View past sessions
            </Link>
          </div>

          {/* Social proof strip */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-slate-500">
            <span>🇪🇺 27 EU member states</span>
            <span className="hidden sm:block text-slate-700">·</span>
            <span>📋 700,000+ active tenders</span>
            <span className="hidden sm:block text-slate-700">·</span>
            <span>✅ Bid/no-bid recommendation</span>
            <span className="hidden sm:block text-slate-700">·</span>
            <span>⚡ Results in &lt;2 minutes</span>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-slate-800/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-blue-400 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">From description to decision in minutes</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-6">
                <span className="text-blue-400 font-bold text-sm">01</span>
              </div>
              <h3 className="text-lg font-semibold mb-3">Describe your company</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tell us in plain English what your company does — your services, sector, and target markets. No forms, no CPV codes.
              </p>
              <div className="mt-6 rounded-lg bg-slate-800/60 border border-slate-700/50 p-3 text-xs text-slate-400 italic">
                &ldquo;We build custom software for public sector organisations in Europe...&rdquo;
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-6">
                <span className="text-blue-400 font-bold text-sm">02</span>
              </div>
              <h3 className="text-lg font-semibold mb-3">Scout searches live</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Our AI scans the EU&apos;s official procurement journal and surfaces the tenders most relevant to your business — ranked by fit, filtered by deadline.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Results appear in real time
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-6">
                <span className="text-blue-400 font-bold text-sm">03</span>
              </div>
              <h3 className="text-lg font-semibold mb-3">Analyst evaluates each match</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Claude analyses every tender against your profile — returning a bid/no-bid recommendation, win probability, key risks, and competitive strengths.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">Pursue</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">Consider</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-xs">Skip</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-slate-800/60">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to find your next contract?</h2>
          <p className="text-slate-400 mb-8">Describe your company and get matched opportunities in under two minutes. Free to use.</p>
          <Link
            href="/search"
            className="inline-block bg-blue-600 hover:bg-blue-500 transition-all text-white font-semibold px-8 py-3.5 rounded-lg shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
          >
            Find tenders for my business →
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
          <p>Data from <a href="https://ted.europa.eu" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors underline underline-offset-2">TED — EU Official Procurement Journal</a></p>
        </div>
      </footer>

    </div>
  )
}
