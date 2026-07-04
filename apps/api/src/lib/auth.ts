import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyReply, FastifyRequest } from 'fastify'
import postgres from 'postgres'

const scrypt = promisify(scryptCb)

const AUTH_COOKIE = 'tm_auth'
const ANON_COOKIE = 'tm_anon'
const AUTH_TTL_SECONDS = 60 * 60 * 24 * 7
const ANON_TTL_SECONDS = 60 * 60 * 24 * 90
const ANON_SEARCH_LIMIT = Number(process.env.ANON_SEARCH_LIMIT ?? 2)
const USER_MONTHLY_SEARCH_LIMIT = Number(process.env.USER_MONTHLY_SEARCH_LIMIT ?? 10)

// Comma-separated list of account emails exempt from search limits
const UNLIMITED_SEARCH_EMAILS = new Set(
  (process.env.UNLIMITED_SEARCH_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
)

export interface AuthUser {
  id: string
  email: string
  name: string | null
  organizationId: string
  role: string
}

export interface RequestContext {
  user: AuthUser | null
  anonymousSessionId: string
}

interface JwtPayload {
  sub: string
  email: string
  org: string
  role: string
  exp: number
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production')
  }
  return 'dev-only-change-me'
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const idx = part.indexOf('=')
        if (idx === -1) return [part, '']
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))]
      })
  )
}

function cookieOptions(maxAge: number): string {
  if (process.env.NODE_ENV === 'production') {
    return `Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAge}`
  }
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

function setCookie(reply: FastifyReply, name: string, value: string, maxAge: number): void {
  appendSetCookie(reply, `${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`)
}

function clearCookie(reply: FastifyReply, name: string): void {
  appendSetCookie(reply, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

function appendSetCookie(reply: FastifyReply, cookie: string): void {
  const existing = reply.getHeader('Set-Cookie')
  if (!existing) {
    reply.header('Set-Cookie', cookie)
    return
  }
  reply.header('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [String(existing), cookie])
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const key = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt:${salt}:${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const key = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(hash, 'base64url')
  if (expected.length !== key.length) return false
  return timingSafeEqual(expected, key)
}

export function signJwt(payload: Omit<JwtPayload, 'exp'>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS,
  }))
  const signature = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const expected = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function setAuthCookie(reply: FastifyReply, user: AuthUser): void {
  const token = signJwt({
    sub: user.id,
    email: user.email,
    org: user.organizationId,
    role: user.role,
  })
  setCookie(reply, AUTH_COOKIE, token, AUTH_TTL_SECONDS)
}

export function clearAuthCookie(reply: FastifyReply): void {
  clearCookie(reply, AUTH_COOKIE)
}

export async function getAuthUser(req: FastifyRequest, sql: postgres.Sql): Promise<AuthUser | null> {
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE]
  if (!token) return null
  const payload = verifyJwt(token)
  if (!payload) return null

  const rows = await sql<AuthUser[]>`
    SELECT
      u.id,
      u.email,
      u.name,
      om.organization_id AS "organizationId",
      om.role
    FROM users u
    JOIN organization_members om ON om.user_id = u.id
    WHERE u.id = ${payload.sub}
      AND om.organization_id = ${payload.org}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function ensureAnonymousSession(
  req: FastifyRequest,
  reply: FastifyReply,
  sql: postgres.Sql
): Promise<string> {
  const cookies = parseCookies(req.headers.cookie)
  const existing = cookies[ANON_COOKIE]
  if (existing) {
    const rows = await sql<{ id: string }[]>`
      UPDATE anonymous_sessions
      SET last_seen_at = NOW()
      WHERE id = ${existing}
      RETURNING id
    `
    if (rows[0]) return rows[0].id
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO anonymous_sessions DEFAULT VALUES
    RETURNING id
  `
  setCookie(reply, ANON_COOKIE, rows[0].id, ANON_TTL_SECONDS)
  return rows[0].id
}

export async function getRequestContext(
  req: FastifyRequest,
  reply: FastifyReply,
  sql: postgres.Sql
): Promise<RequestContext> {
  const [user, anonymousSessionId] = await Promise.all([
    getAuthUser(req, sql),
    ensureAnonymousSession(req, reply, sql),
  ])
  return { user, anonymousSessionId }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply, sql: postgres.Sql): Promise<AuthUser | null> {
  const user = await getAuthUser(req, sql)
  if (!user) {
    reply.status(401).send({ error: 'Sign in required' })
    return null
  }
  return user
}

function getIpHash(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0] ?? req.ip
  return createHmac('sha256', jwtSecret()).update(ip ?? 'unknown').digest('base64url')
}

export async function enforceSearchLimit(
  req: FastifyRequest,
  sql: postgres.Sql,
  ctx: RequestContext
): Promise<{ allowed: true; remaining: number } | { allowed: false; remaining: 0; limit: number; window: string }> {
  if (ctx.user) {
    if (UNLIMITED_SEARCH_EMAILS.has(ctx.user.email.toLowerCase())) {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER }
    }
    const rows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM usage_events
      WHERE event_type = 'scout_search'
        AND user_id = ${ctx.user.id}
        AND created_at >= date_trunc('month', NOW())
    `
    const used = rows[0]?.count ?? 0
    if (used >= USER_MONTHLY_SEARCH_LIMIT) {
      return { allowed: false, remaining: 0, limit: USER_MONTHLY_SEARCH_LIMIT, window: 'month' }
    }
    return { allowed: true, remaining: USER_MONTHLY_SEARCH_LIMIT - used - 1 }
  }

  const ipHash = getIpHash(req)
  const rows = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM usage_events
    WHERE event_type = 'scout_search'
      AND created_at >= NOW() - INTERVAL '24 hours'
      AND (anonymous_session_id = ${ctx.anonymousSessionId} OR ip_hash = ${ipHash})
  `
  const used = rows[0]?.count ?? 0
  if (used >= ANON_SEARCH_LIMIT) {
    return { allowed: false, remaining: 0, limit: ANON_SEARCH_LIMIT, window: 'day' }
  }
  return { allowed: true, remaining: ANON_SEARCH_LIMIT - used - 1 }
}

export async function recordSearchUsage(
  req: FastifyRequest,
  sql: postgres.Sql,
  ctx: RequestContext
): Promise<void> {
  await sql`
    INSERT INTO usage_events (event_type, user_id, organization_id, anonymous_session_id, ip_hash)
    VALUES (
      'scout_search',
      ${ctx.user?.id ?? null},
      ${ctx.user?.organizationId ?? null},
      ${ctx.user ? null : ctx.anonymousSessionId},
      ${ctx.user ? null : getIpHash(req)}
    )
  `
}

export async function claimAnonymousSessions(
  sql: postgres.Sql,
  anonymousSessionId: string,
  user: AuthUser
): Promise<void> {
  await sql.begin(async tx => {
    await tx`
      UPDATE anonymous_sessions
      SET claimed_by_user_id = ${user.id}, claimed_at = NOW()
      WHERE id = ${anonymousSessionId}
    `
    await tx`
      UPDATE search_sessions
      SET user_id = ${user.id},
          organization_id = ${user.organizationId},
          expires_at = NULL
      WHERE anonymous_session_id = ${anonymousSessionId}
        AND user_id IS NULL
    `
    await tx`
      UPDATE company_profiles
      SET user_id = ${user.id},
          organization_id = ${user.organizationId}
      WHERE anonymous_session_id = ${anonymousSessionId}
        AND user_id IS NULL
    `
  })
}
