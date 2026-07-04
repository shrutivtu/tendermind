'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ResetPasswordPage() {
  const [token, setToken] = useState('')
  const [tokenChecked, setTokenChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Token comes via ?token=… — read client-side to avoid a Suspense boundary
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setToken(params.get('token') ?? '')
    setTokenChecked(true)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      // Reset endpoint signs the user in — go straight to the dashboard
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
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
          <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
          <p className="text-slate-400 text-sm mt-3">
            You&apos;ll be signed in right after.
          </p>
        </div>

        {tokenChecked && !token ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-sm text-red-300 text-center leading-relaxed">
            This page needs a reset link to work.{' '}
            <Link href="/forgot-password" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
              Request a new one →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                placeholder="Same password again"
                minLength={8}
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
              {loading ? 'Resetting...' : 'Set new password'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
