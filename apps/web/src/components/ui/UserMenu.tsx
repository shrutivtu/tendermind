'use client'

// Header auth widget: "Sign in" link when logged out, name + menu when logged in.
// Drop into any page header — it manages its own auth state via useAuth.

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/use-auth'

export function UserMenu() {
  const { user, loading, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reserve space while checking — avoids the header jumping
  if (loading) return <div className="w-8 h-8" aria-hidden />

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm text-slate-400 hover:text-white transition-colors"
      >
        Sign in
      </Link>
    )
  }

  const displayName = user.name?.trim() || user.email.split('@')[0]
  const initial = (displayName[0] ?? '?').toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full border border-slate-700 hover:border-slate-500 pl-1 pr-3 py-1 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
          {initial}
        </span>
        <span className="text-sm text-slate-300 max-w-[10rem] truncate">{displayName}</span>
        <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden py-1">
          <div className="px-4 py-2 border-b border-slate-800">
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <button
            onClick={() => void signOut()}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
