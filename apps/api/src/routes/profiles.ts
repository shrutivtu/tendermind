// Company profiles — save and retrieve what the user told us about their company
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client.js'
import { companyProfiles } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const CreateProfileSchema = z.object({
  sessionId:   z.string().min(1),
  name:        z.string().optional(),
  description: z.string().min(10).max(2000),
  country:     z.string().length(3).optional(), // ISO 3166-1 alpha-3
  cpvCodes:    z.array(z.string()).optional(),
  keywords:    z.array(z.string()).optional(),
})

export const profilesRoute: FastifyPluginAsync = async (app) => {
  // POST /api/profiles — create or update profile for a session
  app.post('/api/profiles', async (req, reply) => {
    const body = CreateProfileSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { sessionId, name, description, country, cpvCodes, keywords } = body.data

    // Upsert by sessionId — one profile per browser session for MVP
    const [profile] = await db
      .insert(companyProfiles)
      .values({ sessionId, name, description, country, cpvCodes, keywords })
      .onConflictDoNothing()
      .returning()

    if (!profile) {
      // Already exists — update
      const [updated] = await db
        .update(companyProfiles)
        .set({ name, description, country, cpvCodes, keywords })
        .where(eq(companyProfiles.sessionId, sessionId))
        .returning()
      return reply.send(updated)
    }

    return reply.status(201).send(profile)
  })

  // GET /api/profiles/:sessionId
  app.get<{ Params: { sessionId: string } }>(
    '/api/profiles/:sessionId',
    async (req, reply) => {
      const [profile] = await db
        .select()
        .from(companyProfiles)
        .where(eq(companyProfiles.sessionId, req.params.sessionId))
        .limit(1)

      if (!profile) return reply.status(404).send({ error: 'Profile not found' })
      return reply.send(profile)
    }
  )
}
