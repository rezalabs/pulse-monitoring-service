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
    // If the response is a 401, it could mean the session expired.
    // The main app logic can use this to trigger a re-login.
    if (response.status === 401) {
      const authError = new Error('Unauthorized')
      authError.status = 401
      throw authError
    }
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(errorData.message || 'An API error occurred.')
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}

/** Fetches application configuration info. */
function getAppConfig () {
  return fetchJson(`${API_BASE}/config`)
}

/** Checks if the user has an active admin session. */
function checkAuthStatus () {
  // FIX: Was using undefined API_SESSIONS
  return fetchJson(`${API_BASE}/session/status`)
}

/** Logs in as an administrator. */
function login (adminSecret) {
  // FIX: Was using undefined API_SESSIONS
  return fetchJson(`${API_BASE}/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: adminSecret })
  })
}

/** Logs out of the admin session. */
function logout () {
  // FIX: Was using undefined API_SESSIONS
  return fetchJson(`${API_BASE}/session/logout`, { method: 'POST' })
}

/** Fetches all checks from the backend with pagination. */
function getChecks ({ page = 1, limit = 50 }) {
  return fetchJson(`${API_BASE}/checks?page=${page}&limit=${limit}`)
}

/** Creates a new check. */
function createCheck (data) {
  return fetchJson(`${API_BASE}/checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

/** Deletes a check. */
function deleteCheck (uuid) {
  return fetchJson(`${API_BASE}/checks/${uuid}`, {
    method: 'DELETE'
  })
}

/** Toggles the maintenance mode for a check. */
function toggleMaintenance (uuid) {
  return fetchJson(`${API_BASE}/checks/${uuid}/maintenance`, {
    method: 'POST'
  })
}

/** Reports an explicit failure for a check. */
function failCheck (uuid, reason) {
  return fetchJson(`${API_BASE}/checks/${uuid}/fail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  })
}

window.pulseApi = {
  getAppConfig,
  checkAuthStatus,
  login,
  logout,
  getChecks,
  createCheck,
  deleteCheck,
  toggleMaintenance,
  failCheck
}
