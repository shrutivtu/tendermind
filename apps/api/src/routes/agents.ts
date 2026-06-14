// Scout SSE endpoint
// Streams Scout agent events to the browser in real time.
// On completion the Scout saves the session to DB and fires the Analyst as a
// background job — the browser then navigates to /sessions/:id to see results.

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import postgres from 'postgres'
import { runScoutAgent, type AgentEvent } from '../agents/scout.js'

const ScoutRequestSchema = z.object({
  description: z.string().min(10).max(2000),
  country:     z.string().length(3).optional(),
  cpvCodes:    z.array(z.string()).optional(),
})

export const agentsRoute: FastifyPluginAsync = async (app) => {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

  // POST /api/agents/scout
  // Streams SSE. Emits { type: 'session_id', id } once DB row is created
  // so the browser knows where to redirect when Scout finishes.
  app.post('/api/agents/scout', async (req, reply) => {
    const body = ScoutRequestSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const origin = (req.headers.origin as string) ?? 'http://localhost:3000'
    reply.raw.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin':      origin,
      'Access-Control-Allow-Credentials': 'true',
    })

    const send = (event: AgentEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000)

    try {
      await runScoutAgent(
        {
          description: body.data.description,
          country:     body.data.country,
          cpvCodes:    body.data.cpvCodes,
        },
        sql,
        send
      )
    } finally {
      clearInterval(keepAlive)
      reply.raw.end()
    }
  })
}
