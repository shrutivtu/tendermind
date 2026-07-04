'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
    const body = mode === 'register'
      ? { email, password, name: name || undefined, organizationName: organizationName || undefined }
      : { email, password }

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
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
          <Link href="/search" className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
            Try without signing in
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-14">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === 'register' ? 'Save your tender intelligence' : 'Welcome back'}
          </h1>
          <p className="text-slate-400 text-sm mt-3">
            {mode === 'register'
              ? 'Create a free workspace to keep your searches, saved tenders, and future alerts.'
              : 'Sign in to your private TenderMind workspace.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-slate-900/70 border border-slate-800 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`text-sm font-medium rounded-lg py-2 transition-colors ${mode === 'register' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`text-sm font-medium rounded-lg py-2 transition-colors ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Your name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Workspace name</label>
                <input
                  value={organizationName}
                  onChange={e => setOrganizationName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  placeholder="Acme GmbH"
                />
              </div>
            </>
          )}

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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              {mode === 'login' && (
                <Link href="/forgot-password" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              minLength={mode === 'register' ? 8 : 1}
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
            {loading ? 'Working...' : mode === 'register' ? 'Create free workspace' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-5">
          Anonymous searches are automatically saved to your workspace when you create an account in this browser.
        </p>
      </main>
    </div>
  )
}
