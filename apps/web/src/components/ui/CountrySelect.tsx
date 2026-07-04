'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface Option {
  code: string
  label: string
}

interface CountrySelectProps {
  options: readonly Option[]
  value: string
  onChange: (value: string) => void
}

export function CountrySelect({ options, value, onChange }: CountrySelectProps) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.code === value) ?? options[0]!

  // Recompute panel position relative to the trigger whenever it opens,
  // and keep it pinned while scrolling/resizing.
  useLayoutEffect(() => {
    if (!open) return

    function updateRect() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 8, left: r.left, width: r.width })
    }

    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  // Close on outside click (trigger lives in the form, panel lives in a portal)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div ref={triggerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          w-full flex items-center justify-between gap-3
          bg-slate-900 border rounded-xl px-4 py-3
          text-sm text-slate-100 font-medium
          transition-all duration-200 text-left
          ${open
            ? 'border-blue-500 ring-1 ring-blue-500/30'
            : 'border-slate-700 hover:border-slate-500'
          }
        `}
      >
        <span className="truncate">{selected.label}</span>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel — portaled to <body> so it can't be trapped behind a
          sibling that creates its own stacking context (e.g. transform-based
          entrance animations elsewhere on the page). */}
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        >
          {/* Search hint */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] font-medium text-slate-600 uppercase tracking-widest">
              Filter by country
            </p>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1 scrollbar-thin">
            {options.map(opt => {
              const isSelected = opt.code === value
              return (
                <li key={opt.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(opt.code); setOpen(false) }}
                    className={`
                      w-full flex items-center justify-between px-4 py-2.5 text-sm text-left
                      transition-colors duration-100
                      ${isSelected
                        ? 'bg-blue-600/20 text-blue-300'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                      }
                    `}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
