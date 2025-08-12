import crypto from 'crypto'
import { data } from '../../core/db.js'
import { metrics } from '../../metrics.js'
import { cache } from '../../core/cache.js'

/**
 * Registers all v1 API routes.
 * @param {import('fastify').FastifyInstance} fastify - The Fastify instance.
 */
export async function apiRoutes (fastify) {
  // --- Authorization Hook ---
  // Checks if a valid admin session exists.
  const authorize = (request, reply, done) => {
    if (request.session.isAdmin) {
      done()
    } else {
      return reply.code(401).send({ message: 'Unauthorized: Admin session required.' })
    }
  }

  // --- Cache Invalidation Helper ---
  /** FIX: Invalidates all list-based cache entries to prevent serving stale data. */
  const clearCheckListCache = () => {
    const keys = cache.keys()
    const listKeys = keys.filter(k => k.startsWith('checks_list_p'))
    if (listKeys.length > 0) {
      cache.del(listKeys)
      fastify.log.info(`Cache invalidated for keys: ${listKeys.join(', ')}`)
    }
  }

  // === SESSION MANAGEMENT ===
  // POST /session/login
  fastify.post('/session/login', async (request, reply) => {
    const { secret } = request.body
    const expectedSecret = process.env.ADMIN_SECRET

    if (!secret || typeof secret !== 'string' || !expectedSecret) {
      return reply.code(400).send({ message: 'Invalid request' })
    }

    // Constant-time comparison to prevent timing attacks
    const secretBuffer = Buffer.from(secret, 'utf8')
    const expectedBuffer = Buffer.from(expectedSecret, 'utf8')

    if (secretBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(secretBuffer, expectedBuffer)) {
      return reply.code(401).send({ message: 'Invalid admin secret' })
    }

    request.session.isAdmin = true
    return reply.code(200).send({ message: 'Login successful' })
  })

  // POST /session/logout
  fastify.post('/session/logout', async (request, reply) => {
    if (request.session) {
      await request.session.destroy()
    }
    return reply.code(204).send()
  })

  // GET /session/status
  fastify.get('/session/status', { preHandler: [authorize] }, (request, reply) => {
    return reply.code(200).send({ isAdmin: true })
  })

  // === CORE API ===
  // GET /config
  fastify.get('/config', async (request, reply) => {
    return reply.send({ appTitle: process.env.APP_TITLE })
  })

  // GET /checks
  fastify.get('/checks', async (request, reply) => {
    const page = parseInt(request.query.page, 10) || 1
    const limit = parseInt(request.query.limit, 10) || 20

    const cacheKey = `checks_list_p${page}_l${limit}`
    const cachedResult = cache.get(cacheKey)
    if (cachedResult) {
      return reply.send(cachedResult)
    }

    const result = data.getAllChecks({ page, limit })
    cache.set(cacheKey, result, 10)
    return reply.send(result)
  })

  // POST /checks
  fastify.post('/checks', { preHandler: [authorize] }, async (request, reply) => {
    const { name, schedule, grace } = request.body
    if (!name || !schedule || !grace) {
      return reply.code(400).send({ message: 'Missing required fields: name, schedule, grace' })
    }
    const newCheck = data.createCheck({ name, schedule, grace })
    metrics.updateMetricsForCheck(newCheck)
    clearCheckListCache()
    return reply.code(201).send(newCheck)
  })

  // DELETE /checks/:uuid
  fastify.delete('/checks/:uuid', { preHandler: [authorize] }, async (request, reply) => {
    const checkToDelete = data.getCheckByUuid(request.params.uuid)
    if (!checkToDelete) {
      return reply.code(404).send({ message: 'Check not found' })
    }
    data.deleteCheck(request.params.uuid)
    metrics.removeMetricsForCheck(checkToDelete)
    clearCheckListCache()
    return reply.code(204).send()
  })

  // POST /checks/:uuid/fail
  fastify.post('/checks/:uuid/fail', { preHandler: [authorize] }, async (request, reply) => {
    const { uuid } = request.params
    const { reason } = request.body || {}

    const updatedCheck = data.recordFailure(uuid, reason)
    if (!updatedCheck) {
      return reply.code(404).send({ message: 'Check not found' })
    }
    metrics.updateMetricsForCheck(updatedCheck)
    clearCheckListCache()
    return reply.code(200).send(updatedCheck)
  })

  // POST /checks/:uuid/maintenance
  fastify.post('/checks/:uuid/maintenance', { preHandler: [authorize] }, async (request, reply) => {
    const updatedCheck = data.toggleMaintenance(request.params.uuid)
    if (!updatedCheck) {
      return reply.code(404).send({ message: 'Check not found' })
    }
    metrics.updateMetricsForCheck(updatedCheck)
    clearCheckListCache()
    return reply.code(200).send(updatedCheck)
  })
}
