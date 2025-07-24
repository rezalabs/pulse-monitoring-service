import NodeCache from 'node-cache'

/**
 * Standard TTL for cached items in seconds.
 * A short TTL ensures data freshness while still providing a significant performance boost.
 */
const standardTTL = 10 // 10 seconds

const cache = new NodeCache({ stdTTL: standardTTL, checkperiod: 120 })

console.log('In-memory cache system initialized.')

export { cache }
