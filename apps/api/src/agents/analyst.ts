// Analyst Agent
// Runs as a background job after Scout completes.
// Reads matches from DB, evaluates each tender strategically, writes results back to DB.
// No SSE — the /sessions/:id page polls/streams from DB instead.

import Anthropic from '@anthropic-ai/sdk'
import postgres from 'postgres'
import type { MatchedNotice } from './scout.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalystInput {
  sessionId:          string
  companyDescription: string
  matches: AnalystNotice[]
}

export interface AnalystNotice {
  id: string
  title: string
  country: string
  cpvCodes: string[]
  estimatedValue: number | null
  currency: string | null
  deadline: string | null
  buyerName: string | null
  scoutScore: number
  scoutReason: string
  fit: 'perfect' | 'good' | 'weak'
}

export interface TenderEvaluation {
  noticeId:        string
  recommendation:  'pursue' | 'consider' | 'skip'
  priority:        number
  winProbability:  'high' | 'medium' | 'low'
  estimatedEffort: 'low' | 'medium' | 'high'
  risks:           string[]
  strengths:       string[]
  keyRequirement:  string
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const RECORD_EVALUATION_TOOL: Anthropic.Tool = {
  name: 'record_evaluation',
  description: 'Record a strategic bid evaluation for a specific tender.',
  input_schema: {
    type: 'object' as const,
    properties: {
      notice_id:        { type: 'string' },
      recommendation:   { type: 'string', enum: ['pursue', 'consider', 'skip'],
                          description: 'pursue = strong bid; consider = worth exploring; skip = not worth the effort' },
      priority:         { type: 'number', description: '1-5 (5 = highest). value × win probability × strategic fit' },
      win_probability:  { type: 'string', enum: ['high', 'medium', 'low'] },
      estimated_effort: { type: 'string', enum: ['low', 'medium', 'high'],
                          description: 'Effort to prepare a competitive bid' },
      risks:            { type: 'array', items: { type: 'string' },
                          description: 'Up to 3 specific risks: eligibility, competition, local presence, etc.' },
      strengths:        { type: 'array', items: { type: 'string' },
                          description: 'Up to 3 reasons this company is well positioned' },
      key_requirement:  { type: 'string',
                          description: 'The single most important thing to verify or prepare before bidding' },
    },
    required: ['notice_id', 'recommendation', 'priority', 'win_probability',
               'estimated_effort', 'risks', 'strengths', 'key_requirement'],
  },
}

const WRITE_SUMMARY_TOOL: Anthropic.Tool = {
  name: 'write_summary',
  description: 'Write the final strategic summary after evaluating all tenders.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary:          { type: 'string',
                          description: '3-5 sentence strategic overview: which tenders to prioritise, why, and what to do first.' },
      immediate_action: { type: 'string',
                          description: 'The single most important action the company should take in the next 48 hours.' },
    },
    required: ['summary', 'immediate_action'],
  },
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(input: AnalystInput): string {
  const tenderList = input.matches.map((m, i) => `
[${i + 1}] ID: ${m.id}
    Title: ${m.title}
    Country: ${m.country} | Buyer: ${m.buyerName ?? 'Unknown'}
    Value: ${m.estimatedValue ? `€${m.estimatedValue.toLocaleString()}` : 'Not disclosed'}
    Deadline: ${m.deadline ?? 'Not specified'}
    CPV codes: ${m.cpvCodes.join(', ') || 'None'}
    Scout score: ${m.scoutScore}/100 (${m.fit} fit)
    Scout reasoning: ${m.scoutReason}`).join('\n')

  return `You are a senior EU procurement strategist with 15 years of experience helping SMEs win public contracts.

COMPANY PROFILE:
${input.companyDescription}

TENDERS FOUND BY SCOUT AGENT:
${tenderList}

YOUR TASK:
For each tender call record_evaluation with a strategic assessment. Consider:
- Is this contract value realistic for an SME vs large system integrators?
- Likely minimum turnover/headcount requirements?
- Local presence advantage for that country?
- Incumbent contractor risk?
- Bid preparation cost vs contract value?

A high Scout relevance score does NOT mean it is worth bidding on. Think like a consultant.

After evaluating ALL tenders, call write_summary with your strategic overview and the single most important immediate action.`
}

// ─── DB writes ────────────────────────────────────────────────────────────────

async function saveEvaluation(
  sql: postgres.Sql,
  sessionId: string,
  ev: TenderEvaluation
): Promise<void> {
  await sql`
    INSERT INTO tender_evaluations
      (session_id, notice_id, recommendation, priority, win_probability,
       estimated_effort, risks, strengths, key_requirement)
    VALUES
      (${sessionId}, ${ev.noticeId}, ${ev.recommendation}, ${ev.priority},
       ${ev.winProbability}, ${ev.estimatedEffort},
       ${sql.array(ev.risks)}, ${sql.array(ev.strengths)},
       ${ev.keyRequirement})
    ON CONFLICT DO NOTHING
  `
}

async function markComplete(
  sql: postgres.Sql,
  sessionId: string,
  summary: string
): Promise<void> {
  await sql`
    UPDATE search_sessions SET
      status           = 'complete',
      analyst_summary  = ${summary},
      completed_at     = NOW()
    WHERE id = ${sessionId}
  `
}

async function markError(
  sql: postgres.Sql,
  sessionId: string,
  message: string
): Promise<void> {
  await sql`
    UPDATE search_sessions SET
      status        = 'error',
      error_message = ${message}
    WHERE id = ${sessionId}
  `
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runAnalystAgent(
  input: AnalystInput,
  sql: postgres.Sql
): Promise<void> {
  console.log(`[Analyst] Starting for session ${input.sessionId} — ${input.matches.length} tenders`)

  try {
    const evaluations = new Map<string, TenderEvaluation>()
    let summaryText = ''

    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 6000,
      tools: [RECORD_EVALUATION_TOOL, WRITE_SUMMARY_TOOL],
      messages: [{ role: 'user', content: buildPrompt(input) }],
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_stop' &&
        // @ts-ignore
        event.content_block?.type === 'tool_use'
      ) {
        // @ts-ignore
        const name  = event.content_block.name
        // @ts-ignore
        const ti    = event.content_block.input

        if (name === 'record_evaluation') {
          const ev: TenderEvaluation = {
            noticeId:        ti.notice_id,
            recommendation:  ti.recommendation,
            priority:        ti.priority,
            winProbability:  ti.win_probability,
            estimatedEffort: ti.estimated_effort,
            risks:           ti.risks    ?? [],
            strengths:       ti.strengths ?? [],
            keyRequirement:  ti.key_requirement,
          }
          evaluations.set(ev.noticeId, ev)
          await saveEvaluation(sql, input.sessionId, ev)
          console.log(`[Analyst] Saved evaluation for ${ev.noticeId} → ${ev.recommendation}`)
        }

        if (name === 'write_summary') {
          summaryText = ti.summary
          if (ti.immediate_action) summaryText += `\n\n**Immediate action:** ${ti.immediate_action}`
        }
      }
    }

    // Fallback: pick up any tool calls from final message
    const final = await stream.finalMessage()
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue
      const ti = block.input as any

      if (block.name === 'record_evaluation' && !evaluations.has(ti.notice_id)) {
        const ev: TenderEvaluation = {
          noticeId: ti.notice_id, recommendation: ti.recommendation,
          priority: ti.priority, winProbability: ti.win_probability,
          estimatedEffort: ti.estimated_effort,
          risks: ti.risks ?? [], strengths: ti.strengths ?? [],
          keyRequirement: ti.key_requirement,
        }
        evaluations.set(ev.noticeId, ev)
        await saveEvaluation(sql, input.sessionId, ev)
      }

      if (block.name === 'write_summary' && !summaryText) {
        summaryText = ti.summary
        if (ti.immediate_action) summaryText += `\n\n**Immediate action:** ${ti.immediate_action}`
      }
    }

    await markComplete(sql, input.sessionId, summaryText)
    console.log(`[Analyst] Session ${input.sessionId} complete — ${evaluations.size} evaluations saved`)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Analyst] Error for session ${input.sessionId}:`, message)
    await markError(sql, input.sessionId, message)
  }
}
