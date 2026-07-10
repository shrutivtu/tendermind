// Scout SSE endpoint
// Streams Scout agent events to the browser in real time.
// On completion the Scout saves the session to DB and fires the Analyst as a
// background job — the browser then navigates to /sessions/:id to see results.

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import postgres from 'postgres'
import { runScoutAgent, type AgentEvent } from '../agents/scout.js'
import { enforceSearchLimit, getRequestContext, recordSearchUsage } from '../lib/auth.js'

const ScoutRequestSchema = z.object({
  description:        z.string().min(10).max(2000),
  country:            z.string().length(3).optional(),
  cpvCodes:           z.array(z.string()).optional(),
  includeHistorical:  z.boolean().optional(),
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

    const ctx = await getRequestContext(req, reply, sql)

    // Log every search request so live traffic is visible in Render logs —
    // who searched (or 'anonymous' + session), from where, and for what.
    const forwarded = req.headers['x-forwarded-for']
    const clientIp =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ?? req.ip
    const requestLog = {
      description: body.data.description.slice(0, 500),
      country: body.data.country ?? null,
      user: ctx.user?.email ?? 'anonymous',
      anonSession: ctx.user ? undefined : ctx.anonymousSessionId,
      ip: clientIp,
    }

    const limit = await enforceSearchLimit(req, sql, ctx)
    if (!limit.allowed) {
      req.log.warn({ scout: requestLog, limit: limit.limit, window: limit.window }, 'scout search rate-limited')
      return reply.status(429).send({
        error: ctx.user
          ? `You have used your ${limit.limit} AI searches for this ${limit.window}.`
          : `You have used your ${limit.limit} free demo searches for this ${limit.window}.`,
        code: ctx.user ? 'USER_LIMIT_REACHED' : 'ANON_LIMIT_REACHED',
        limit: limit.limit,
        window: limit.window,
      })
    }
    req.log.info({ scout: requestLog }, 'scout search requested')
    await recordSearchUsage(req, sql, ctx)

    const origin = (req.headers.origin as string) ?? 'http://localhost:3000'
    const setCookie = reply.getHeader('Set-Cookie')
    reply.raw.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin':      origin,
      'Access-Control-Allow-Credentials': 'true',
      ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
    })

    const send = (event: AgentEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000)

    try {
      await runScoutAgent(
        {
          description:        body.data.description,
          country:            body.data.country,
          cpvCodes:           body.data.cpvCodes,
          includeHistorical:  body.data.includeHistorical,
        },
        sql,
        send,
        ctx
      )
    } finally {
      clearInterval(keepAlive)
      reply.raw.end()
    }
  })
}
