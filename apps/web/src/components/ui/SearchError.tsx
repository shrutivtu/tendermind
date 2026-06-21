interface SearchErrorProps {
  message: string
  onRetry: () => void
}

export function SearchError({ message, onRetry }: SearchErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-5 animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <span className="text-red-400 text-2xl font-bold">!</span>
      </div>

      <div className="space-y-1.5">
        <p className="text-slate-100 font-semibold">Something went wrong</p>
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{message}</p>
      </div>

      <button
        onClick={onRetry}
        className="text-sm text-blue-400 hover:text-blue-300 border border-slate-700 hover:border-slate-500 px-5 py-2 rounded-lg transition-colors"
      >
        ← Try again
      </button>
    </div>
  )
}
