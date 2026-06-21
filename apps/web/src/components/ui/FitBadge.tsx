import type { MatchedNotice } from '@/lib/scout-stream'

const STYLES: Record<MatchedNotice['fit'], string> = {
  perfect: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  good:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  weak:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const LABELS: Record<MatchedNotice['fit'], string> = {
  perfect: '⭐ Perfect fit',
  good:    '✓ Good fit',
  weak:    '~ Weak fit',
}

export function FitBadge({ fit }: { fit: MatchedNotice['fit'] }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STYLES[fit]}`}>
      {LABELS[fit]}
    </span>
  )
}
