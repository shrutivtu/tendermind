'use client'

import { useState } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      setSent(true)
      if (data.devResetUrl) setDevResetUrl(data.devResetUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-slate-100 font-bold text-lg flex items-center gap-2">
            <span className="text-blue-400">⬡</span> TenderMind
          </Link>
          <Link href="/login" className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-14">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-slate-400 text-sm mt-3">
            Enter your account email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-sm text-emerald-300 leading-relaxed">
              If an account exists for <strong className="text-emerald-200">{email}</strong>, a reset
              link is on its way. The link is valid for 1 hour.
            </div>

            {devResetUrl && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-sm">
                <p className="text-amber-300 font-semibold mb-2">Local development</p>
                <p className="text-slate-400 text-xs mb-3">
                  No email provider is configured, so here&apos;s your reset link directly:
                </p>
                <Link
                  href={devResetUrl.replace(/^https?:\/\/[^/]+/, '')}
                  className="inline-block bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 px-4 py-2 rounded-lg text-xs font-medium transition-colors break-all"
                >
                  Open reset link →
                </Link>
              </div>
            )}

            <p className="text-center text-xs text-slate-600">
              Didn&apos;t get it?{' '}
              <button onClick={() => { setSent(false); setDevResetUrl('') }} className="text-blue-400 hover:text-blue-300">
                Try again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="you@company.com"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white font-semibold py-3 rounded-xl"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
