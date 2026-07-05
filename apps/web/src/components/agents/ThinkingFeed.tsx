'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ThinkingFeedProps {
  text: string
  /** True while tokens are still streaming in — animates the header + caret. */
  streaming?: boolean
}

// ─── Lightweight streaming-markdown rendering ─────────────────────────────────
// Claude's reasoning arrives with real structure (bold headings, numbered
// evaluations, bullets). Rendering it as formatted content instead of a wall
// of raw text is what makes the feed readable.

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; num: string; text: string }
  | { kind: 'para'; text: string }

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const heading = line.match(/^(?:#{1,4}\s+(.+)|\*\*(.+?)\*\*:?)$/)
    if (heading) {
      blocks.push({ kind: 'heading', text: (heading[1] ?? heading[2] ?? '').replace(/[:*]+$/, '') })
      continue
    }
    const bullet = line.match(/^[-•*]\s+(.+)/)
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[1]! })
      continue
    }
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)/)
    if (numbered) {
      blocks.push({ kind: 'numbered', num: numbered[1]!, text: numbered[2]! })
      continue
    }
    blocks.push({ kind: 'para', text: line })
  }
  return blocks
}

// Inline: **bold** → bright text, [3] → candidate-reference chip
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|\[\d{1,2}\])/g).map((part, i) => {
    const bold = part.match(/^\*\*(.+)\*\*$/)
    if (bold) return <strong key={i} className="font-semibold text-slate-100">{bold[1]}</strong>
    const ref = part.match(/^\[(\d{1,2})\]$/)
    if (ref) {
      return (
        <span
          key={i}
          className="inline-flex items-center justify-center min-w-[1.4em] px-1 mx-0.5 rounded bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-semibold align-middle"
        >
          {ref[1]}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      return (
        <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest mt-4 mb-1.5 first:mt-0">
          {block.text}
        </p>
      )
    case 'bullet':
      return (
        <p className="text-[13px] text-slate-300 leading-relaxed pl-4 relative">
          <span className="absolute left-0 text-blue-400/70">•</span>
          {renderInline(block.text)}
        </p>
      )
    case 'numbered':
      return (
        <p className="text-[13px] text-slate-300 leading-relaxed pl-6 relative">
          <span className="absolute left-0 text-blue-400/70 font-semibold text-xs top-0.5">{block.num}.</span>
          {renderInline(block.text)}
        </p>
      )
    default:
      return <p className="text-[13px] text-slate-300 leading-relaxed">{renderInline(block.text)}</p>
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ThinkingFeed({ text, streaming = false }: ThinkingFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(0)

  // Live elapsed-seconds counter while the agent works
  useEffect(() => {
    if (!streaming) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [streaming])

  // Pin to the newest text while streaming — unless the reader scrolled up.
  // When opened after completion, start at the top like a document.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !streaming) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [text, streaming])

  const blocks = parseBlocks(text)

  return (
    <div
      className={`relative rounded-xl border overflow-hidden transition-colors duration-500 ${
        streaming ? 'border-blue-500/30 bg-slate-900/60' : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      {/* Animated accent line while the agent is working */}
      {streaming && (
        <div className="absolute top-0 inset-x-0 h-[2px] overflow-hidden">
          <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-scan" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <svg
          className={`w-3.5 h-3.5 ${streaming ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path d="M10 1.5l1.9 4.7 4.7 1.9-4.7 1.9L10 14.7 8.1 10 3.4 8.1l4.7-1.9L10 1.5zM16.5 12l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" />
        </svg>
        {streaming ? (
          <>
            <span className="text-xs font-medium shimmer-text">Scout is reasoning</span>
            <span className="ml-auto text-[11px] text-slate-600 tabular-nums">{elapsed}s</span>
          </>
        ) : (
          <span className="text-xs font-medium text-slate-500">Agent reasoning</span>
        )}
      </div>

      {/* Rendered reasoning */}
      <div ref={scrollRef} className="px-4 pb-4 max-h-64 overflow-y-auto scrollbar-thin reasoning-mask">
        <div className="space-y-2">
          {blocks.map((b, i) => <BlockView key={i} block={b} />)}
          {streaming && (
            <span className="inline-block w-[3px] h-3.5 rounded-full bg-blue-400/80 animate-caret" />
          )}
        </div>
      </div>
    </div>
  )
}
