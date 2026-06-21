'use client'

import { useRef } from 'react'

export function ThinkingFeed({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">AI reasoning</p>
      <div
        ref={ref}
        className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-slate-400 leading-relaxed"
      >
        <span className="text-emerald-400">scout@tendermind:~$ </span>
        <span className="text-slate-300">{text}</span>
        <span className="animate-pulse text-emerald-400">▊</span>
      </div>
    </div>
  )
}
