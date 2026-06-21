'use client'

const STEPS = [
  {
    step: '01',
    color: 'text-blue-400',
    title: 'Understand your company',
    desc: 'TenderMind reads your company description and learns what you do — your sector, services, and capabilities — so it can find tenders that genuinely match, not just keyword hits.',
  },
  {
    step: '02',
    color: 'text-purple-400',
    title: 'Scan live EU tenders',
    desc: 'We search 3,500+ tenders published in the last 48 hours across all 27 EU member states and surface the most relevant opportunities for your business.',
  },
  {
    step: '03',
    color: 'text-emerald-400',
    title: 'Score and explain each match',
    desc: 'Every tender gets a relevance score (0–100) and a plain-English explanation of why it fits your profile. Only tenders scoring 50+ are shown.',
  },
]

const FIT_GUIDE = [
  {
    range: '90–100',
    wrapClass: 'bg-emerald-500/10 border-emerald-500/20',
    numClass:  'text-emerald-400',
    lblClass:  'text-emerald-300',
    label: '⭐ Perfect fit',
    desc: 'Direct match to your core capabilities',
  },
  {
    range: '70–89',
    wrapClass: 'bg-blue-500/10 border-blue-500/20',
    numClass:  'text-blue-400',
    lblClass:  'text-blue-300',
    label: '✓ Good fit',
    desc: 'Strong overlap, worth pursuing',
  },
  {
    range: '50–69',
    wrapClass: 'bg-slate-500/10 border-slate-500/20',
    numClass:  'text-slate-400',
    lblClass:  'text-slate-300',
    label: '~ Weak fit',
    desc: 'Partial match, review carefully',
  },
]

export function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full shadow-2xl animate-fade-in-scale"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">How TenderMind works</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {STEPS.map(({ step, color, title, desc }) => (
            <div key={step} className="flex gap-4">
              <div className={`text-2xl font-bold ${color} opacity-60 shrink-0 w-8`}>{step}</div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Score guide</p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            {FIT_GUIDE.map(({ range, wrapClass, numClass, lblClass, label, desc }) => (
              <div key={range} className={`border rounded-lg p-3 ${wrapClass}`}>
                <div className={`font-bold text-base mb-1 ${numClass}`}>{range}</div>
                <div className={lblClass}>{label}</div>
                <div className="text-slate-500 mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
