// Company profiles — save and retrieve what the user told us about their company
import type { FastifyPluginAsync } from 'fastify'
import postgres from 'postgres'
import { z } from 'zod'
import { db } from '../db/client.js'
import { companyProfiles } from '../db/schema.js'
import { and, eq, isNull } from 'drizzle-orm'
import { getRequestContext } from '../lib/auth.js'

const CreateProfileSchema = z.object({
  sessionId:   z.string().min(1).optional(),
  name:        z.string().optional(),
  description: z.string().min(10).max(2000),
  country:     z.string().length(3).optional(), // ISO 3166-1 alpha-3
  cpvCodes:    z.array(z.string()).optional(),
  keywords:    z.array(z.string()).optional(),
})

export const profilesRoute: FastifyPluginAsync = async (app) => {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

  // POST /api/profiles — create or update profile for a session
  app.post('/api/profiles', async (req, reply) => {
    const ctx = await getRequestContext(req, reply, sql)
    const body = CreateProfileSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { sessionId, name, description, country, cpvCodes, keywords } = body.data

    const existing = await db
      .select()
      .from(companyProfiles)
      .where(ctx.user
        ? eq(companyProfiles.organizationId, ctx.user.organizationId)
        : and(
            eq(companyProfiles.anonymousSessionId, ctx.anonymousSessionId),
            isNull(companyProfiles.userId)
          )
      )
      .limit(1)

    if (existing[0]) {
      const [updated] = await db
        .update(companyProfiles)
        .set({ name, description, country, cpvCodes, keywords })
        .where(eq(companyProfiles.id, existing[0].id))
        .returning()
      return reply.send(updated)
    }

    const [profile] = await db
      .insert(companyProfiles)
      .values({
        sessionId,
        userId: ctx.user?.id ?? null,
        organizationId: ctx.user?.organizationId ?? null,
        anonymousSessionId: ctx.user ? null : ctx.anonymousSessionId,
        name,
        description,
        country,
        cpvCodes,
        keywords,
      })
      .returning()

    return reply.status(201).send(profile)
  })

  // GET /api/profiles/:sessionId — legacy-compatible; ownership still comes from cookie/JWT.
  app.get<{ Params: { sessionId: string } }>(
    '/api/profiles/:sessionId',
    async (req, reply) => {
      const ctx = await getRequestContext(req, reply, sql)
      const [profile] = await db
        .select()
        .from(companyProfiles)
        .where(ctx.user
          ? eq(companyProfiles.organizationId, ctx.user.organizationId)
          : and(
              eq(companyProfiles.anonymousSessionId, ctx.anonymousSessionId),
              isNull(companyProfiles.userId)
            )
        )
        .limit(1)

      if (!profile) return reply.status(404).send({ error: 'Profile not found' })
      return reply.send(profile)
    }
  )
}
