import { createHash, randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import postgres from 'postgres'
import { z } from 'zod'
import {
  claimAnonymousSessions,
  clearAuthCookie,
  ensureAnonymousSession,
  getAuthUser,
  hashPassword,
  setAuthCookie,
  verifyPassword,
  type AuthUser,
} from '../lib/auth.js'

const RegisterSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase().trim()),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
  organizationName: z.string().min(1).max(160).optional(),
})

const LoginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
})

const ForgotPasswordSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase().trim()),
})

const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
})

const RESET_TOKEN_TTL_MINUTES = 60
const RESET_REQUESTS_PER_HOUR = 5

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export const authRoute: FastifyPluginAsync = async (app) => {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

  app.get('/api/auth/me', async (req, reply) => {
    const user = await getAuthUser(req, sql)
    if (!user) return reply.status(401).send({ error: 'Not signed in' })
    return reply.send({ user })
  })

  app.post('/api/auth/register', async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const anonymousSessionId = await ensureAnonymousSession(req, reply, sql)
    const { email, password, name } = body.data
    const organizationName = body.data.organizationName ?? (name ? `${name}'s workspace` : 'My workspace')
    const passwordHash = await hashPassword(password)

    try {
      const user = await sql.begin(async tx => {
        const users = await tx<{ id: string; email: string; name: string | null }[]>`
          INSERT INTO users (email, name, password_hash)
          VALUES (${email}, ${name ?? null}, ${passwordHash})
          RETURNING id, email, name
        `
        const orgs = await tx<{ id: string }[]>`
          INSERT INTO organizations (name)
          VALUES (${organizationName})
          RETURNING id
        `
        await tx`
          INSERT INTO organization_members (organization_id, user_id, role)
          VALUES (${orgs[0].id}, ${users[0].id}, 'owner')
        `
        return {
          id: users[0].id,
          email: users[0].email,
          name: users[0].name,
          organizationId: orgs[0].id,
          role: 'owner',
        } satisfies AuthUser
      })

      setAuthCookie(reply, user)
      await claimAnonymousSessions(sql, anonymousSessionId, user)
      return reply.status(201).send({ user })
    } catch (err) {
      if (err instanceof Error && err.message.includes('duplicate key')) {
        return reply.status(409).send({ error: 'An account with this email already exists' })
      }
      req.log.error(err)
      return reply.status(500).send({ error: 'Could not create account' })
    }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const body = LoginSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const anonymousSessionId = await ensureAnonymousSession(req, reply, sql)
    const rows = await sql<(AuthUser & { passwordHash: string })[]>`
      SELECT
        u.id,
        u.email,
        u.name,
        u.password_hash AS "passwordHash",
        om.organization_id AS "organizationId",
        om.role
      FROM users u
      JOIN organization_members om ON om.user_id = u.id
      WHERE u.email = ${body.data.email}
      ORDER BY om.created_at ASC
      LIMIT 1
    `
    const user = rows[0]
    if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
      return reply.status(401).send({ error: 'Invalid email or password' })
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
    }
    setAuthCookie(reply, authUser)
    await claimAnonymousSessions(sql, anonymousSessionId, authUser)
    return reply.send({ user: authUser })
  })

  app.post('/api/auth/logout', async (_req, reply) => {
    clearAuthCookie(reply)
    return reply.send({ ok: true })
  })

  app.post('/api/auth/forgot-password', async (req, reply) => {
    const body = ForgotPasswordSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    // Always return the same response so the endpoint can't be used to
    // probe which emails have accounts.
    const genericResponse: { ok: true; devResetUrl?: string } = { ok: true }

    const users = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${body.data.email} LIMIT 1
    `
    const user = users[0]
    if (!user) return reply.send(genericResponse)

    // Throttle: cap reset requests per user per hour
    const recent = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM password_reset_tokens
      WHERE user_id = ${user.id}
        AND created_at >= NOW() - INTERVAL '1 hour'
    `
    if ((recent[0]?.count ?? 0) >= RESET_REQUESTS_PER_HOUR) {
      return reply.send(genericResponse)
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${hashResetToken(token)}, ${expiresAt})
    `

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    const resetUrl = `${webUrl}/reset-password?token=${token}`

    // TODO: send resetUrl by email once an email provider is configured.
    // Until then, surface it in dev so the flow is usable locally.
    if (process.env.NODE_ENV !== 'production') {
      req.log.info({ resetUrl }, 'password reset link (dev)')
      genericResponse.devResetUrl = resetUrl
    } else {
      req.log.error('forgot-password requested but no email provider is configured')
    }

    return reply.send(genericResponse)
  })

  app.post('/api/auth/reset-password', async (req, reply) => {
    const body = ResetPasswordSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const tokens = await sql<{ id: string; userId: string }[]>`
      SELECT id, user_id AS "userId"
      FROM password_reset_tokens
      WHERE token_hash = ${hashResetToken(body.data.token)}
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `
    const resetToken = tokens[0]
    if (!resetToken) {
      return reply.status(400).send({ error: 'This reset link is invalid or has expired. Please request a new one.' })
    }

    const passwordHash = await hashPassword(body.data.password)
    await sql.begin(async tx => {
      await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${resetToken.userId}`
      await tx`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${resetToken.id}`
    })

    // Sign the user in with their fresh credentials
    const rows = await sql<AuthUser[]>`
      SELECT
        u.id,
        u.email,
        u.name,
        om.organization_id AS "organizationId",
        om.role
      FROM users u
      JOIN organization_members om ON om.user_id = u.id
      WHERE u.id = ${resetToken.userId}
      ORDER BY om.created_at ASC
      LIMIT 1
    `
    const user = rows[0]
    if (user) setAuthCookie(reply, user)
    return reply.send({ ok: true, user: user ?? null })
  })
}
