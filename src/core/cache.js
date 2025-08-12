import NodeCache from 'node-cache'

/**
 * Standard TTL for cached items in seconds.
 * A short TTL ensures data freshness while still providing a significant performance boost.
 */
const standardTTL = 10 // 10 seconds

/**
 * Caching layer for the application.
 * useClones: false - improves performance by returning direct references. This is safe
 * as the data retrieved from the database is immutable for the duration of a request.
 */
const cache = new NodeCache({ stdTTL: standardTTL, useClones: false })

console.log('In-memory cache system initialized.')

export { cache }
