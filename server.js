import 'dotenv/config'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import { data } from './src/core/db.js'
import { scheduler } from './src/core/scheduler.js'
import { metrics } from './src/metrics.js'
import { apiRoutes } from './src/api/v1/checks.js'

// --- Environment Variable Validation ---
const requiredEnv = ['PORT', 'APP_TITLE', 'ADMIN_SECRET']
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}.`)
    console.error('Please create a .env file based on .env.example.')
    process.exit(1)
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production'
})

// --- Plugin & Route Registration ---

// Serve static files from the 'frontend' directory
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'frontend'),
  prefix: '/'
})

// Serve index.html for the root route
fastify.get('/', (req, reply) => {
  return reply.sendFile('index.html')
})

// Register all API routes under /api/v1
fastify.register(apiRoutes, { prefix: '/api/v1' })

// --- Core App Endpoints ---

// Prometheus metrics endpoint
fastify.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', metrics.registry.contentType)
  return metrics.registry.metrics()
})

// The heartbeat ping endpoint
fastify.get('/ping/:uuid', (req, reply) => {
  const { uuid } = req.params
  const duration = req.query.duration ? parseInt(req.query.duration, 10) : null

  if (!uuid) {
    return reply.code(400).send({ message: 'Missing check UUID.' })
  }

  try {
    const updatedCheck = data.recordPing(uuid, duration)
    if (updatedCheck) {
      metrics.updateMetricsForCheck(updatedCheck)
      return reply.code(200).send({ message: 'OK' })
    } else {
      return reply.code(404).send({ message: 'Check not found.' })
    }
  } catch (error) {
    fastify.log.error(error, `Failed to record ping for UUID: ${uuid}`)
    return reply.code(500).send({ message: 'Internal server error while recording ping.' })
  }
})

// --- Server Startup ---
async function start () {
  try {
    data.setup()
    metrics.hydrateMetrics()
    scheduler.startStatusEngine()
    scheduler.startWebhookScheduler()

    await fastify.listen({ port: process.env.PORT, host: '0.0.0.0' })
    fastify.log.info(`Server listening on port ${process.env.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
