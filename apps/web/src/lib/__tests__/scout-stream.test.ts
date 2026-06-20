import { describe, it, expect } from 'vitest'
import { parseSSELine } from '../scout-stream'

describe('parseSSELine', () => {
  it('returns null for empty lines', () => {
    expect(parseSSELine('')).toBeNull()
  })

  it('returns null for SSE comment lines', () => {
    expect(parseSSELine(': keep-alive')).toBeNull()
    expect(parseSSELine(': ping')).toBeNull()
  })

  it('returns null for event-type lines (not data)', () => {
    expect(parseSSELine('event: message')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseSSELine('data: {broken')).toBeNull()
    expect(parseSSELine('data: not-json')).toBeNull()
  })

  it('parses a status event', () => {
    const result = parseSSELine('data: {"type":"status","message":"Searching EU tenders..."}')
    expect(result).toEqual({ type: 'status', message: 'Searching EU tenders...' })
  })

  it('parses a candidates event', () => {
    const result = parseSSELine('data: {"type":"candidates","count":42,"totalSearched":3500}')
    expect(result).toEqual({ type: 'candidates', count: 42, totalSearched: 3500 })
  })

  it('parses a match event with notice payload', () => {
    const notice = {
      id: '00123456-2024',
      title: 'Software development services',
      score: 0.87,
      fit: 'perfect',
    }
    const result = parseSSELine(`data: ${JSON.stringify({ type: 'match', notice })}`)
    expect(result).toEqual({ type: 'match', notice })
    expect(result?.notice.score).toBe(0.87)
  })

  it('parses a session_id event', () => {
    const result = parseSSELine('data: {"type":"session_id","id":"f47ac10b-58cc-4372-a567-0e02b2c3d479"}')
    expect(result).toEqual({ type: 'session_id', id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  })

  it('parses a done event', () => {
    const result = parseSSELine('data: {"type":"done","totalMatches":7}')
    expect(result).toEqual({ type: 'done', totalMatches: 7 })
  })

  it('parses an error event', () => {
    const result = parseSSELine('data: {"type":"error","message":"TED API timeout"}')
    expect(result).toEqual({ type: 'error', message: 'TED API timeout' })
  })

  it('handles data with extra whitespace in the JSON', () => {
    const result = parseSSELine('data: {"type":"done","totalMatches":0}')
    expect(result?.type).toBe('done')
  })
})
