import 'dotenv/config'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import path from 'path'
import { fileURLToPath } from 'url'
import { data } from './src/core/db.js'
import { scheduler } from './src/core/scheduler.js'
import { metrics } from './src/metrics.js'
import { apiRoutes } from './src/api/v1/checks.js'

// --- Environment Variable Validation ---
const requiredEnv = ['PORT', 'APP_TITLE', 'ADMIN_SECRET', 'SESSION_SECRET']
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}.`)
    console.error('Please create a .env file based on .env.example.')
    process.exit(1)
  }
}
if (process.env.ADMIN_SECRET === 'change-this-super-secret-key' || process.env.SESSION_SECRET === 'change-this-very-strong-session-secret') {
  console.warn('Warning: Default secret keys are in use. Please change ADMIN_SECRET and SESSION_SECRET in your .env file for production.')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// FIX: Enabled structured logging for all environments.
// This is critical for diagnostics and monitoring in production.
// In development, `pino-pretty` can be used for readability if installed (`npm i -D pino-pretty`).
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined
  }
})

// --- Plugin Registration ---

// Register cookie and session management for authentication
fastify.register(fastifyCookie)
fastify.register(fastifySession, {
  secret: process.env.SESSION_SECRET,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Send cookie only over HTTPS in production
    httpOnly: true, // Prevent client-side script access
    maxAge: 86400000 // 1 day
  },
  cookieName: 'pulse-session'
})

// --- Route Registration Order ---
// 1. Register specific, high-priority routes first.
fastify.register(async function (instance) {
  // Prometheus metrics endpoint
  instance.get('/metrics', async (req, reply) => {
    reply.header('Content-Type', metrics.registry.contentType)
    return metrics.registry.metrics()
  })

  // The heartbeat ping endpoint
  instance.get('/ping/:uuid', (req, reply) => {
    const { uuid } = req.params
    const duration = req.query.duration ? parseInt(req.query.duration, 10) : null

    if (!uuid) {
      return reply.code(400).send({ message: 'Missing check UUID.' })
    }

    try {
      const updatedCheck = data.recordPing(uuid, duration)
      if (updatedCheck) {
        // Only update metrics if the ping wasn't ignored (e.g. for a maintenance check)
        if (updatedCheck.status !== 'maintenance') {
          metrics.updateMetricsForCheck(updatedCheck)
        }
        return reply.code(200).send({ message: 'OK' })
      } else {
        return reply.code(404).send({ message: 'Check not found.' })
      }
    } catch (error) {
      instance.log.error(error, `Failed to record ping for UUID: ${uuid}`)
      return reply.code(500).send({ message: 'Internal server error while recording ping.' })
    }
  })
})

// 2. Register all API routes under /api/v1
fastify.register(apiRoutes, { prefix: '/api/v1' })

// 3. Register static file server for the frontend.
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'frontend')
  // Let the notFoundHandler below handle SPA routing.
})

// 4. Set a Not Found handler to support SPA routing (client-side routing).
// Any GET request that does not match an API route or a static file will be served the main index.html.
fastify.setNotFoundHandler((request, reply) => {
  if (request.method === 'GET' && !request.raw.url.startsWith('/api')) {
    return reply.sendFile('index.html', path.join(__dirname, 'frontend'))
  }
  return reply.code(404).send({ error: 'Not Found', message: `Route ${request.method}:${request.url} not found` })
})

// --- Server Startup ---
async function start () {
  try {
    data.setup()
    metrics.hydrateMetrics()
    scheduler.startStatusEngine()
    scheduler.startWebhookScheduler()

    await fastify.listen({ port: process.env.PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
