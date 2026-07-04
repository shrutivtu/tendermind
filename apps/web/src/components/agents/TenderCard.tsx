'use client'

import { useState } from 'react'
import type { MatchedNotice } from '@/lib/scout-stream'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { countryName, fmtDate, fmtValue } from '@/lib/format'

interface TenderCardProps {
  notice: MatchedNotice
  index: number
}

export function TenderCard({ notice, index }: TenderCardProps) {
  const [expanded, setExpanded] = useState(false)

  const isUk = notice.source === 'find-tender'
  const meta = [
    `${isUk ? '🇬🇧' : '🇪🇺'} ${countryName(notice.country)}`,
    notice.estimatedValue ? fmtValue(notice.estimatedValue) : null,
    notice.deadline ? `due ${fmtDate(notice.deadline)}` : null,
  ].filter(Boolean)

  return (
    <div
      className="group bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 animate-fade-in cursor-pointer"
      style={{ animationDelay: `${index * 80}ms` }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex gap-4">
        <ScoreRing score={notice.score} />

        <div className="flex-1 min-w-0">
          {/* Title row — the dominant element */}
          <div className="flex items-start justify-between gap-3">
            <h3 className={`text-[15px] font-semibold text-slate-100 leading-snug ${expanded ? '' : 'line-clamp-2'}`}>
              {notice.title}
            </h3>
            <span className="shrink-0 mt-1 text-slate-600 group-hover:text-slate-400 transition-colors text-xs">
              {expanded ? '▲' : '▼'}
            </span>
          </div>

          {/* One quiet meta line */}
          <p className="text-xs text-slate-500 mt-1.5">
            {meta.join(' · ')}
          </p>

          {/* AI reason */}
          <p className={`text-xs text-slate-400 leading-relaxed border-l-2 border-blue-500/40 pl-3 mt-3 ${expanded ? '' : 'line-clamp-2'}`}>
            {notice.reason}
          </p>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-slate-800 animate-fade-in space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {notice.buyerName && (
                  <div className="sm:col-span-2 flex gap-2">
                    <dt className="text-slate-600 shrink-0">Buyer</dt>
                    <dd className="text-slate-300">{notice.buyerName}</dd>
                  </div>
                )}
                {notice.deadline && (
                  <div className="flex gap-2">
                    <dt className="text-slate-600 shrink-0">Deadline</dt>
                    <dd className="text-orange-300">{fmtDate(notice.deadline)}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-slate-600 shrink-0">Published</dt>
                  <dd className="text-slate-300">{fmtDate(notice.publicationDate)}</dd>
                </div>
                {notice.cpvCodes.length > 0 && (
                  <div className="sm:col-span-2 flex gap-2">
                    <dt className="text-slate-600 shrink-0">CPV</dt>
                    <dd className="text-slate-400">{notice.cpvCodes.join(', ')}</dd>
                  </div>
                )}
              </dl>

              <a
                href={notice.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-block text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                {isUk ? 'View on Find a Tender →' : 'View full notice on TED →'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
