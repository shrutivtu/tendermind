export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Powered by Claude AI · Live EU Data
        </div>

        <h1 className="text-5xl font-bold tracking-tight">
          €420 billion in EU contracts.
          <br />
          <span className="text-blue-400">Find yours.</span>
        </h1>

        <p className="text-lg text-slate-400">
          AI agents that search 700,000+ EU tenders, analyse eligibility,
          and tell you who's winning — so your business can compete.
        </p>

        <div className="flex items-center justify-center gap-4">
          <a
            href="/search"
            className="inline-block bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold px-8 py-3 rounded-lg"
          >
            Find tenders for my business →
          </a>
          <a
            href="/dashboard"
            className="inline-block border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition-colors font-semibold px-6 py-3 rounded-lg"
          >
            View past sessions
          </a>
        </div>
      </div>
    </main>
  )
}
