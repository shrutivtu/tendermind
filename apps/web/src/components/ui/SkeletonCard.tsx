export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex gap-4">
        {/* Score ring placeholder */}
        <div className="w-[52px] h-[52px] rounded-full bg-slate-800 shrink-0" />

        <div className="flex-1 space-y-3">
          {/* Badge row */}
          <div className="flex gap-2 items-center">
            <div className="h-5 w-20 bg-slate-800 rounded-full" />
            <div className="h-4 w-14 bg-slate-800/70 rounded-full" />
          </div>
          {/* Title */}
          <div className="space-y-1.5">
            <div className="h-3.5 bg-slate-800 rounded w-full" />
            <div className="h-3.5 bg-slate-800 rounded w-4/5" />
          </div>
          {/* Reason */}
          <div className="space-y-1 border-l-2 border-slate-800 pl-3">
            <div className="h-3 bg-slate-800/70 rounded w-full" />
            <div className="h-3 bg-slate-800/70 rounded w-5/6" />
            <div className="h-3 bg-slate-800/70 rounded w-3/4" />
          </div>
          {/* Link row */}
          <div className="h-3 w-32 bg-slate-800/50 rounded" />
        </div>
      </div>
    </div>
  )
}
