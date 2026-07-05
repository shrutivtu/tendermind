// Sessions REST endpoints
// GET /api/sessions          — list 20 most recent sessions (for dashboard)
// GET /api/sessions/:id      — full session with matches + evaluations
// GET /api/sessions/:id/poll — lightweight status + eval count (for polling)

import type { FastifyPluginAsync } from 'fastify'
import postgres from 'postgres'
import { getRequestContext, requireAuth } from '../lib/auth.js'
import { sweepStaleSessions } from '../lib/stale-sessions.js'

export const sessionsRoute: FastifyPluginAsync = async (app) => {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

  // ─── GET /api/sessions ───────────────────────────────────────────────────
  app.get('/api/sessions', async (req, reply) => {
    const user = await requireAuth(req, reply, sql)
    if (!user) return

    // Self-heal sessions whose run died mid-flight
    await sweepStaleSessions(sql)

    const rows = await sql`
      SELECT
        s.id,
        s.company_description,
        s.country_filter,
        s.status,
        s.match_count,
        s.top_score,
        s.created_at,
        s.completed_at,
        COUNT(e.id)::int AS eval_count
      FROM search_sessions s
      LEFT JOIN tender_evaluations e ON e.session_id = s.id
      WHERE s.organization_id = ${user.organizationId}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `
    return reply.send(rows)
  })

  // ─── GET /api/sessions/:id ───────────────────────────────────────────────
  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ctx = await getRequestContext(req, reply, sql)

    const sessions = ctx.user
      ? await sql`
          SELECT * FROM search_sessions
          WHERE id = ${id}
            AND (organization_id = ${ctx.user.organizationId} OR is_public = TRUE)
        `
      : await sql`
          SELECT * FROM search_sessions
          WHERE id = ${id}
            AND (anonymous_session_id = ${ctx.anonymousSessionId} OR is_public = TRUE)
            AND (expires_at IS NULL OR expires_at > NOW())
        `
    if (sessions.length === 0) return reply.status(404).send({ error: 'Session not found' })

    const evaluations = await sql`
      SELECT * FROM tender_evaluations
      WHERE session_id = ${id}
      ORDER BY priority DESC, created_at ASC
    `

    return reply.send({
      ...sessions[0],
      evaluations,
    })
  })

  // ─── GET /api/sessions/:id/poll ──────────────────────────────────────────
  // Lightweight endpoint the frontend polls every 3s while analyst is running.
  // Returns status + evaluation count + summary (once available).
  app.get('/api/sessions/:id/poll', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ctx = await getRequestContext(req, reply, sql)

    const sessions = ctx.user
      ? await sql`
          SELECT id, status, match_count, top_score, analyst_summary, error_message, completed_at
          FROM search_sessions
          WHERE id = ${id}
            AND (organization_id = ${ctx.user.organizationId} OR is_public = TRUE)
        `
      : await sql`
          SELECT id, status, match_count, top_score, analyst_summary, error_message, completed_at
          FROM search_sessions
          WHERE id = ${id}
            AND (anonymous_session_id = ${ctx.anonymousSessionId} OR is_public = TRUE)
            AND (expires_at IS NULL OR expires_at > NOW())
        `
    if (sessions.length === 0) return reply.status(404).send({ error: 'Not found' })

    const evalCount = await sql`
      SELECT COUNT(*)::int AS count FROM tender_evaluations WHERE session_id = ${id}
    `

    return reply.send({
      ...sessions[0],
      evalCount: evalCount[0].count,
    })
  })
}
