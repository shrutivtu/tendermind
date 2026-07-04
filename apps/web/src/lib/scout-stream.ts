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
  source: string            // 'ted' | 'find-tender'
  score: number
  reason: string
  fit: 'perfect' | 'good' | 'weak'
}

export interface ScoutCallbacks {
  onStatus:     (message: string) => void
  onCandidates: (count: number, total: number) => void
  onThinking:   (text: string) => void
  onMatch:      (notice: MatchedNotice) => void
  onSessionId:  (id: string) => void
  onDone:       (total: number) => void
  onError:      (message: string) => void
}

// Discriminated union of all SSE event shapes emitted by the Scout agent
export type SSEEvent =
  | { type: 'status';     message: string }
  | { type: 'candidates'; count: number; totalSearched: number }
  | { type: 'thinking';   text: string }
  | { type: 'match';      notice: MatchedNotice }
  | { type: 'session_id'; id: string }
  | { type: 'done';       totalMatches: number }
  | { type: 'error';      message: string }

// Exported for unit testing — parses one SSE line into a typed event object.
// Returns null for blank lines, comments, or malformed JSON.
export function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) return null
  try {
    return JSON.parse(line.slice(6)) as SSEEvent
  } catch {
    return null
  }
}

export async function runScout(
  description: string,
  country: string | undefined,
  callbacks: ScoutCallbacks
): Promise<void> {
  const res = await fetch(`${API_URL}/api/agents/scout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ description, country }),
  })

  if (!res.ok || !res.body) {
    let message = `API error ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    callbacks.onError(message)
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
      const event = parseSSELine(line)
      if (!event) continue
      switch (event.type) {
        case 'status':     callbacks.onStatus(event.message); break
        case 'candidates': callbacks.onCandidates(event.count, event.totalSearched); break
        case 'thinking':   callbacks.onThinking(event.text); break
        case 'match':      callbacks.onMatch(event.notice); break
        case 'session_id': callbacks.onSessionId(event.id); break
        case 'done':       callbacks.onDone(event.totalMatches); break
        case 'error':      callbacks.onError(event.message); break
      }
    }
  }
}
