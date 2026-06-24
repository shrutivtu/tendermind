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
}
