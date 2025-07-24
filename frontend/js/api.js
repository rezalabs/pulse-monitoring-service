/**
 * @file API wrapper for interacting with the Pulse backend.
 */

const API_BASE = '/api/v1'

/**
 * A helper function to handle fetch requests and JSON parsing.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options for the fetch request.
 * @returns {Promise<object>} - The JSON response.
 */
async function fetchJson (url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(errorData.message || 'An API error occurred.')
  }
  // Handle responses with no content, like DELETE
  if (response.status === 204) {
    return null
  }
  return response.json()
}

/**
 * Fetches all checks from the backend with pagination.
 * @param {object} params - Pagination parameters.
 * @param {number} params.page - The page number to fetch.
 * @param {number} params.limit - The number of items per page.
 * @returns {Promise<{checks: Array<object>, meta: object}>} - A list of check objects and pagination metadata.
 */
function getChecks ({ page = 1, limit = 50 }) {
  return fetchJson(`${API_BASE}/checks?page=${page}&limit=${limit}`)
}

/**
 * Creates a new check.
 * @param {object} data - The check data { name, schedule, grace }.
 * @param {string} adminSecret - The admin secret key.
 * @returns {Promise<object>} - The newly created check object.
 */
function createCheck (data, adminSecret) {
  return fetchJson(`${API_BASE}/checks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSecret}`
    },
    body: JSON.stringify(data)
  })
}

/**
 * Deletes a check.
 * @param {string} uuid - The UUID of the check to delete.
 * @param {string} adminSecret - The admin secret key.
 * @returns {Promise<null>}
 */
function deleteCheck (uuid, adminSecret) {
  return fetchJson(`${API_BASE}/checks/${uuid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminSecret}` }
  })
}

/**
 * Toggles the maintenance mode for a check.
 * @param {string} uuid - The UUID of the check.
 * @param {string} adminSecret - The admin secret key.
 * @returns {Promise<object>} - The updated check object.
 */
function toggleMaintenance (uuid, adminSecret) {
  return fetchJson(`${API_BASE}/checks/${uuid}/maintenance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminSecret}` }
  })
}

window.pulseApi = {
  getChecks,
  createCheck,
  deleteCheck,
  toggleMaintenance
}
