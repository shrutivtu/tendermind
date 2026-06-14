'use client'

// Client-side SSE helper for the Scout agent
// Parses the event stream and calls typed callbacks.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export interface MatchedNotice {
  id: string
  title: string
  buyerName: string | null
  country: string
  cpvCodes: string[]
  estimatedValue: number | null
  currency: string | null
  deadline: string | null
  publicationDate: string
  url: string
  score: number
  reason: string
  fit: 'perfect' | 'good' | 'weak'
}

export interface ScoutCallbacks {
  onStatus:     (message: string) => void
  onCandidates: (count: number, total: number) => void
  onThinking:   (text: string) => void
  onMatch:      (notice: MatchedNotice) => void
  onSessionId:  (id: string) => void   // emitted once DB session row is created
  onDone:       (total: number) => void
  onError:      (message: string) => void
}

export async function runScout(
  description: string,
  country: string | undefined,
  callbacks: ScoutCallbacks
): Promise<void> {
  const res = await fetch(`${API_URL}/api/agents/scout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, country }),
  })

  if (!res.ok || !res.body) {
    callbacks.onError(`API error ${res.status}`)
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
      try {
        const event = JSON.parse(line.slice(6))
        switch (event.type) {
          case 'status':     callbacks.onStatus(event.message); break
          case 'candidates': callbacks.onCandidates(event.count, event.totalSearched); break
          case 'thinking':   callbacks.onThinking(event.text); break
          case 'match':      callbacks.onMatch(event.notice); break
          case 'session_id': callbacks.onSessionId(event.id); break
          case 'done':       callbacks.onDone(event.totalMatches); break
          case 'error':      callbacks.onError(event.message); break
        }
      } catch { /* ignore parse errors on keep-alive pings */ }
    }
  }
}
