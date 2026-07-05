import type postgres from 'postgres'

// A Scout run takes seconds and the Analyst a minute or two; both write their
// terminal status when they finish. A session still "running" after this long
// means the process died mid-run (deploy, crash, OOM) — the fire-and-forget
// Analyst has no retry, so nothing will ever finish it.
const STALE_AFTER_MINUTES = 15

// Opportunistic sweep — called from read endpoints (dashboard, admin) so
// stuck sessions self-heal without needing a separate cron.
export async function sweepStaleSessions(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE search_sessions SET
      status        = 'error',
      error_message = 'Analysis timed out — the run was interrupted before completing.',
      completed_at  = NOW()
    WHERE status IN ('scout_running', 'analyst_running')
      AND created_at < NOW() - INTERVAL '15 minutes'
    RETURNING id
  `
  return rows.length
}

export { STALE_AFTER_MINUTES }
