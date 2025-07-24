import cron from 'croner'
import { data } from './db.js'
import { metrics } from '../metrics.js'

/**
 * Parses a duration string (e.g., "10m", "1d") into milliseconds.
 * @param {string} durationStr - The duration string.
 * @returns {number} Duration in milliseconds.
 */
function parseDuration (durationStr) {
  if (typeof durationStr !== 'string') return 0
  const match = durationStr.match(/^(\d+)(ms|s|m|h|d)$/)
  if (!match) return 0
  const value = parseInt(match[1], 10)
  const unit = match[2]
  switch (unit) {
    case 'ms': return value
    case 's': return value * 1000
    case 'm': return value * 60 * 1000
    case 'h': return value * 60 * 60 * 1000
    case 'd': return value * 24 * 60 * 60 * 1000
    default: return 0
  }
}

/**
 * The core status evaluation engine. It runs every minute to check for overdue checks.
 */
function runStatusChecks () {
  const checks = data.getAllChecksUnpaginated({ activeOnly: true })
  const now = Date.now()

  for (const check of checks) {
    const scheduleMs = parseDuration(check.schedule)
    const graceMs = parseDuration(check.grace)

    // Determine the timestamp to measure against.
    // For 'new' checks, it's their creation time. For all others, it's the last ping.
    const referenceTime = (check.status === 'new' && check.created_at)
      ? check.created_at * 1000
      : check.last_ping_at * 1000

    // If there's no reference time, we can't determine if it's late.
    if (!referenceTime) continue

    const deadline = referenceTime + scheduleMs + graceMs

    if (now > deadline) {
      // Only update if the status is not already 'down' to avoid redundant writes.
      if (check.status !== 'down') {
        console.log(`Check '${check.name}' (${check.uuid}) is now DOWN. Last event was at ${new Date(referenceTime).toISOString()}.`)
        const updatedCheck = data.setCheckDown(check.id)
        if (updatedCheck) {
          metrics.updateMetricsForCheck(updatedCheck)
        }
      }
    }
  }
}

/**
 * Initializes the background job to check the status of all checks.
 */
function startStatusEngine () {
  // Run once on startup, then every minute.
  runStatusChecks()
  cron('* * * * *', { timezone: process.env.CRON_TIMEZONE || 'UTC' }, runStatusChecks)
  console.log('Status evaluation engine started. [Running every minute]')
}

/**
 * Sends a summary report to the configured webhook URL (e.g., Google Chat).
 */
async function sendWebhookReport () {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return

  console.log(`Sending scheduled webhook report to ${webhookUrl}`)
  const { checks } = data.getAllChecks()
  const downChecks = checks.filter(c => c.status === 'down')
  const upChecks = checks.filter(c => c.status === 'up')
  const newChecks = checks.filter(c => c.status === 'new')
  const maintenanceChecks = checks.filter(c => c.status === 'maintenance')

  const total = checks.length
  const summary = `${downChecks.length} DOWN, ${upChecks.length} UP, ${maintenanceChecks.length} MAINT`

  // This payload is structured for Google Chat webhooks.
  const payload = {
    cardsV2: [{
      cardId: 'pulse-summary',
      card: {
        header: {
          title: 'Pulse Monitoring Summary',
          subtitle: `${total} Checks: ${summary}`,
          imageUrl: downChecks.length > 0
            ? 'https://raw.githubusercontent.com/google-gemini/cookbook/main/py/google-search-reviews/assets/error.png'
            : 'https://raw.githubusercontent.com/google-gemini/cookbook/main/py/google-search-reviews/assets/success.png',
          imageType: 'CIRCLE'
        },
        sections: [{
          header: `DOWN Checks (${downChecks.length})`,
          collapsible: true,
          uncollapsibleWidgetsCount: downChecks.length > 0 ? 1 : 0,
          widgets: downChecks.length > 0
            ? downChecks.map(c => ({
              textParagraph: {
                text: `<b>${c.name}</b> - Last ping: ${c.last_ping_at ? new Date(c.last_ping_at * 1000).toLocaleString() : 'never'}`
              }
            }))
            : [{ textParagraph: { text: 'All monitored services are UP.' } }]
        }]
      }
    }]
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`Webhook failed with status: ${response.status}`)
    }
    console.log('Successfully sent webhook report.')
  } catch (error) {
    console.error('Failed to send webhook report:', error)
  }
}

/**
 * Schedules the webhook report based on the environment variable.
 */
function startWebhookScheduler () {
  const schedule = process.env.WEBHOOK_SCHEDULE
  const webhookUrl = process.env.WEBHOOK_URL
  const timezone = process.env.CRON_TIMEZONE || 'UTC'

  if (!schedule || !webhookUrl) {
    console.log('Webhook reporting is disabled (WEBHOOK_SCHEDULE or WEBHOOK_URL not set).')
    return
  }

  try {
    cron(schedule, { timezone }, sendWebhookReport)
    console.log(`Webhook reporting scheduled with pattern: "${schedule}" in timezone ${timezone}`)
  } catch (error) {
    console.error(`Invalid CRON pattern "${schedule}" for webhook. Webhook reporting disabled.`, error)
  }
}

export const scheduler = {
  startStatusEngine,
  startWebhookScheduler
}
