import prom from 'prom-client';
import { data } from './core/db.js';

const registry = new prom.Registry();
prom.collectDefaultMetrics({ register: registry });

const labelNames = ['name', 'uuid'];
const statusMap = { 'down': 0, 'up': 1, 'new': 2, 'maintenance': 3, 'failed': 4 };

const gauges = {
  status: new prom.Gauge({
    name: 'pulse_check_status',
    help: 'Status of a configured check. 0=DOWN, 1=UP, 2=NEW, 3=MAINTENANCE, 4=FAILED.',
    labelNames,
    registers: [registry],
  }),
  lastPingTimestamp: new prom.Gauge({
    name: 'pulse_check_last_ping_timestamp_seconds',
    help: 'The Unix timestamp of the last successful or failed ping.',
    labelNames,
    registers: [registry],
  }),
  lastPingDuration: new prom.Gauge({
    name: 'pulse_check_last_ping_duration_ms',
    help: 'The duration in milliseconds of the last reported job.',
    labelNames,
    registers: [registry],
  }),
  consecutiveDownCount: new prom.Gauge({
    name: 'pulse_check_consecutive_down_count',
    help: 'Number of consecutive times the check has been marked down by timeout.',
    labelNames,
    registers: [registry],
  })
};

/**
 * Updates all metric gauges for a given check object.
 * @param {object} check - The check object from the database.
 */
function updateMetricsForCheck(check) {
  if (!check) return;
  const labels = { name: check.name, uuid: check.uuid };
  const statusValue = statusMap[check.status] ?? 2; // Default to 'new' if status is unknown

  gauges.status.set(labels, statusValue);
  gauges.consecutiveDownCount.set(labels, check.consecutive_down_count || 0);

  if (check.last_ping_at) {
    gauges.lastPingTimestamp.set(labels, check.last_ping_at);
  }
  if (check.last_ping_duration_ms !== null && check.last_ping_duration_ms !== undefined) {
    gauges.lastPingDuration.set(labels, check.last_ping_duration_ms);
  } else {
    // Ensure the gauge is reset if duration is not provided
    gauges.lastPingDuration.set(labels, 0);
  }
}

/**
 * Removes all metric gauges for a given check.
 * @param {object} check - The check object to remove.
 */
function removeMetricsForCheck(check) {
  if (!check) return;
  const labels = { name: check.name, uuid: check.uuid };
  Object.values(gauges).forEach(gauge => gauge.remove(labels));
}

/**
 * Hydrates all metrics from the database on application startup.
 */
function hydrateMetrics() {
  console.log('Hydrating Prometheus metrics from database...');
  const allChecks = data.getAllChecksUnpaginated();
  // Clear all previous metrics to handle cases where checks were deleted while offline
  Object.values(gauges).forEach(gauge => gauge.reset());
  for (const check of allChecks) {
    updateMetricsForCheck(check);
  }
  console.log(`Metrics hydrated for ${allChecks.length} checks.`);
}

export const metrics = {
  registry,
  updateMetricsForCheck,
  removeMetricsForCheck,
  hydrateMetrics
};