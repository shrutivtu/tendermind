'use client'

import { useState } from 'react'
import type { MatchedNotice } from '@/lib/scout-stream'
import { FitBadge } from '@/components/ui/FitBadge'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { countryName, fmtDate, fmtValue } from '@/lib/format'

interface TenderCardProps {
  notice: MatchedNotice
  index: number
}

export function TenderCard({ notice, index }: TenderCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="group bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 animate-fade-in cursor-pointer"
      style={{ animationDelay: `${index * 80}ms` }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex gap-4">
        <ScoreRing score={notice.score} />

        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <FitBadge fit={notice.fit} />
            <span className="text-xs text-slate-500">{countryName(notice.country)}</span>
            {notice.estimatedValue && (
              <span className="text-xs text-amber-400/80 font-medium">
                {fmtValue(notice.estimatedValue)}
              </span>
            )}
            <span className="ml-auto text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
              {expanded ? '▲ less' : '▼ details'}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-2 line-clamp-2">
            {notice.title}
          </h3>

          {/* AI reason — always visible */}
          <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-blue-500/40 pl-3 mb-3">
            {notice.reason}
          </p>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 animate-fade-in">
              {notice.buyerName && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">Buyer: </span>{notice.buyerName}
                </div>
              )}
              {notice.cpvCodes.length > 0 && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">CPV codes: </span>
                  {notice.cpvCodes.join(', ')}
                </div>
              )}
              {notice.deadline && (
                <div className="text-xs text-slate-400">
                  <span className="text-slate-600">Submission deadline: </span>
                  <span className="text-orange-400">{fmtDate(notice.deadline)}</span>
                </div>
              )}
              <div className="text-xs text-slate-400">
                <span className="text-slate-600">Published: </span>{fmtDate(notice.publicationDate)}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <a
              href={notice.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              View full notice on TED →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
