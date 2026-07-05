import type { FastifyPluginAsync } from 'fastify'
import postgres from 'postgres'
import { getAuthUser } from '../lib/auth.js'
import { sweepStaleSessions } from '../lib/stale-sessions.js'

// Comma-separated list of account emails allowed to access /api/admin/*
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
)

export const adminRoute: FastifyPluginAsync = async (app) => {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

  app.get('/api/admin/stats', async (req, reply) => {
    const user = await getAuthUser(req, sql)
    if (!user || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
      return reply.status(403).send({ error: 'Admin access required' })
    }

    // Self-heal sessions whose run died mid-flight before reporting stats
    await sweepStaleSessions(sql)

    const [notices, sessionAgg, recentSessions] = await Promise.all([
      // Per-source notice counts + data freshness (updated_at is bumped on
      // every ingestion upsert, so MAX(updated_at) = last successful write)
      sql<{ source: string; count: number; lastUpdated: string | null; upcomingDeadlines: number }[]>`
        SELECT
          source,
          COUNT(*)::int                                        AS count,
          MAX(updated_at)                                      AS "lastUpdated",
          COUNT(*) FILTER (WHERE deadline > NOW())::int        AS "upcomingDeadlines"
        FROM notices
        GROUP BY source
        ORDER BY source
      `,
      sql<{ total: number; complete: number; error: number; running: number; last7d: number; last7dComplete: number }[]>`
        SELECT
          COUNT(*)::int                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'complete')::int                       AS complete,
          COUNT(*) FILTER (WHERE status = 'error')::int                          AS error,
          COUNT(*) FILTER (WHERE status IN ('scout_running','analyst_running'))::int AS running,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS last7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'
                             AND status = 'complete')::int                       AS "last7dComplete"
        FROM search_sessions
      `,
      sql<{ id: string; status: string; matchCount: number; description: string; createdAt: string; completedAt: string | null }[]>`
        SELECT
          id,
          status,
          match_count                    AS "matchCount",
          LEFT(company_description, 500) AS description,
          created_at                     AS "createdAt",
          completed_at                   AS "completedAt"
        FROM search_sessions
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ])

    return reply.send({
      notices,
      sessions: sessionAgg[0],
      recentSessions,
      generatedAt: new Date().toISOString(),
    })
  })
}
