import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import { authRoute } from './routes/auth.js'
import { profilesRoute } from './routes/profiles.js'
import { agentsRoute } from './routes/agents.js'
import { sessionsRoute } from './routes/sessions.js'

const app = Fastify({ logger: { level: 'info' } })

await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
})

await app.register(sensible)
await app.register(authRoute)
await app.register(profilesRoute)
await app.register(agentsRoute)
await app.register(sessionsRoute)

// Health check (Render pings /healthz)
app.get('/healthz', async () => ({ status: 'ok' }))
app.get('/health', async () => ({
  status: 'ok',
  service: 'tendermind-api',
  timestamp: new Date().toISOString(),
}))

const port = Number(process.env.API_PORT ?? 3001)

try {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`\n🚀 TenderMind API running on http://localhost:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
