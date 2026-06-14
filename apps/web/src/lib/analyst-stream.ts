// Analyst agent SSE client
// Connects to POST /api/agents/analyst and fires callbacks for each event.

import type { MatchedNotice } from './scout-stream'

export interface TenderEvaluation {
  noticeId:          string
  recommendation:    'pursue' | 'consider' | 'skip'
  priority:          number      // 1–5, 5 = highest
  winProbability:    'high' | 'medium' | 'low'
  estimatedEffort:   'low' | 'medium' | 'high'
  risks:             string[]
  strengths:         string[]
  keyRequirement:    string
}

export interface AnalystCallbacks {
  onStatus:     (msg: string) => void
  onThinking:   (text: string) => void
  onEvaluation: (ev: TenderEvaluation) => void
  onSummary:    (text: string) => void
  onDone:       () => void
  onError:      (msg: string) => void
}

export async function runAnalyst(
  companyDescription: string,
  matches: MatchedNotice[],
  callbacks: AnalystCallbacks
) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  // Map MatchedNotice → analyst notice shape
  const analystMatches = matches.map(m => ({
    id:             m.id,
    title:          m.title,
    country:        m.country,
    cpvCodes:       m.cpvCodes,
    estimatedValue: m.estimatedValue,
    currency:       m.currency ?? null,
    deadline:       m.deadline ?? null,
    buyerName:      m.buyerName ?? null,
    scoutScore:     m.score,
    scoutReason:    m.reason,
    fit:            m.fit,
  }))

  let res: Response
  try {
    res = await fetch(`${API}/api/agents/analyst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyDescription, matches: analystMatches }),
    })
  } catch (err) {
    callbacks.onError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  if (!res.ok || !res.body) {
    callbacks.onError(`API error: ${res.status} ${res.statusText}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue

      let event: any
      try { event = JSON.parse(raw) } catch { continue }

      switch (event.type) {
        case 'status':     callbacks.onStatus(event.message);            break
        case 'thinking':   callbacks.onThinking(event.text);             break
        case 'evaluation': callbacks.onEvaluation(event.evaluation);     break
        case 'summary':    callbacks.onSummary(event.text);              break
        case 'done':       callbacks.onDone();                           break
        case 'error':      callbacks.onError(event.message);             break
      }
    }
  }
}
