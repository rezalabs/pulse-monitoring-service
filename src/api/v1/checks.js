import { data } from '../../core/db.js'
import { metrics } from '../../metrics.js'
import { cache } from '../../core/cache.js'

/**
 * Registers all v1 API routes.
 * @param {import('fastify').FastifyInstance} fastify - The Fastify instance.
 */
export async function apiRoutes (fastify) {
  // --- Authorization Hook ---
  const authorize = (request, reply, done) => {
    const authHeader = request.headers.authorization
    const expected = `Bearer ${process.env.ADMIN_SECRET}`
    if (!process.env.ADMIN_SECRET || authHeader !== expected) {
      return reply.code(401).send({ message: 'Unauthorized: Invalid or missing Admin Secret.' })
    }
    done()
  }

  // --- Cache Invalidation Helper ---
  const clearCheckListCache = () => {
    const keys = cache.keys()
    const checkListKeys = keys.filter(k => k.startsWith('checks_list_'))
    if (checkListKeys.length > 0) {
      cache.del(checkListKeys)
      fastify.log.info(`Invalidated ${checkListKeys.length} list caches.`)
    }
  }

  // --- Route Definitions ---

  // GET /config - Provide public frontend configuration
  fastify.get('/config', async (request, reply) => {
    return reply.send({
      appTitle: process.env.APP_TITLE
    })
  })

  // GET /checks - List all checks with pagination and caching
  fastify.get('/checks', async (request, reply) => {
    const page = parseInt(request.query.page, 10) || 1
    const limit = parseInt(request.query.limit, 10) || 20
    const cacheKey = `checks_list_p${page}_l${limit}`

    const cachedResult = cache.get(cacheKey)
    if (cachedResult) {
      return reply.send(cachedResult)
    }

    const result = data.getAllChecks({ page, limit })
    cache.set(cacheKey, result)
    return reply.send(result)
  })

  // POST /checks - Create a new check
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

  // DELETE /checks/:uuid - Delete a check
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

  // POST /checks/:uuid/maintenance - Toggle maintenance mode
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
