const RADIUS = 20
const CIRC = 2 * Math.PI * RADIUS

function scoreColor(score: number): string {
  if (score >= 90) return '#10b981' // emerald
  if (score >= 75) return '#3b82f6' // blue
  return '#64748b'                  // slate
}

export function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score)
  const dash = (score / 100) * CIRC

  return (
    <svg width="52" height="52" className="shrink-0" aria-label={`Relevance score: ${score}/100`}>
      <title>{`Relevance score: ${score}/100`}</title>
      <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="#1e293b" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={RADIUS} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${CIRC - dash}`}
        strokeDashoffset={CIRC / 4}
        strokeLinecap="round"
      />
      <text x="26" y="30" textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">
        {score}
      </text>
    </svg>
  )
}
