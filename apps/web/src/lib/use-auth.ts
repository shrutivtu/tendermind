'use client'

// Shared client-side auth state.
// Fetches /api/auth/me once on mount; the tm_auth cookie does the real work.

import { useEffect, useState, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  organizationId: string
  role: string
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (alive) setUser(data?.user ?? null) })
      .catch(() => { /* signed-out is the default */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const signOut = useCallback(async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    window.location.href = '/'
  }, [])

  return { user, loading, signOut }
}
