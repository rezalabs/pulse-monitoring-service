import prom from 'prom-client'
import { data } from './core/db.js'

const registry = new prom.Registry()
prom.collectDefaultMetrics({ register: registry })

const labelNames = ['name', 'uuid']
const statusMap = { down: 0, up: 1, new: 2, maintenance: 3 }

const gauges = {
  status: new prom.Gauge({
    name: 'pulse_check_status',
    help: 'Status of a configured check. 0=DOWN, 1=UP, 2=NEW, 3=MAINTENANCE.',
    labelNames,
    registers: [registry]
  }),
  lastPingTimestamp: new prom.Gauge({
    name: 'pulse_check_last_ping_timestamp_seconds',
    help: 'The Unix timestamp of the last successful ping.',
    labelNames,
    registers: [registry]
  }),
  lastPingDuration: new prom.Gauge({
    name: 'pulse_check_last_ping_duration_ms',
    help: 'The duration in milliseconds of the last reported job.',
    labelNames,
    registers: [registry]
  }),
  consecutiveDownCount: new prom.Gauge({
    name: 'pulse_check_consecutive_down_count',
    help: 'Number of consecutive times the check has been marked down.',
    labelNames,
    registers: [registry]
  })
}

/**
 * Updates all metric gauges for a given check object.
 * @param {object} check - The check object from the database.
 */
function updateMetricsForCheck (check) {
  if (!check) return
  const labels = { name: check.name, uuid: check.uuid }
  const statusValue = statusMap[check.status] ?? 2

  gauges.status.set(labels, statusValue)
  gauges.consecutiveDownCount.set(labels, check.consecutive_down_count)

  if (check.last_ping_at) {
    gauges.lastPingTimestamp.set(labels, check.last_ping_at)
  }
  if (check.last_ping_duration_ms !== null && check.last_ping_duration_ms !== undefined) {
    gauges.lastPingDuration.set(labels, check.last_ping_duration_ms)
  }
}

/**
 * Removes all metric gauges for a given check.
 * @param {object} check - The check object to remove.
 */
function removeMetricsForCheck (check) {
  if (!check) return
  const labels = { name: check.name, uuid: check.uuid }
  Object.values(gauges).forEach(gauge => gauge.remove(labels))
}

/**
 * Hydrates all metrics from the database on application startup.
 */
function hydrateMetrics () {
  console.log('Hydrating Prometheus metrics from database...')
  const allChecks = data.getAllChecksUnpaginated()
  for (const check of allChecks) {
    updateMetricsForCheck(check)
  }
  console.log(`Metrics hydrated for ${allChecks.length} checks.`)
}

export const metrics = {
  registry,
  updateMetricsForCheck,
  removeMetricsForCheck,
  hydrateMetrics
}
