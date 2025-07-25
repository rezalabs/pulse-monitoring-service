/**
 * @file API wrapper for interacting with the Pulse backend.
 */

const API_BASE = '/api/v1';

/**
 * A helper function to handle fetch requests and JSON parsing.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options for the fetch request.
 * @returns {Promise<object>} - The JSON response.
 */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || 'An API error occurred.');
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

/** Fetches application configuration info. */
function getAppConfig() {
  return fetchJson(`${API_BASE}/config`);
}


/** Fetches all checks from the backend with pagination. */
function getChecks({ page = 1, limit = 50 }) {
  return fetchJson(`${API_BASE}/checks?page=${page}&limit=${limit}`);
}

/** Creates a new check. */
function createCheck(data, adminSecret) {
  return fetchJson(`${API_BASE}/checks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminSecret}`
    },
    body: JSON.stringify(data)
  });
}

/** Deletes a check. */
function deleteCheck(uuid, adminSecret) {
  return fetchJson(`${API_BASE}/checks/${uuid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminSecret}` }
  });
}

/** Toggles the maintenance mode for a check. */
function toggleMaintenance(uuid, adminSecret) {
  return fetchJson(`${API_BASE}/checks/${uuid}/maintenance`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminSecret}` }
  });
}

/** Reports an explicit failure for a check. */
function failCheck(uuid, reason, adminSecret) {
  return fetchJson(`${API_BASE}/checks/${uuid}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminSecret}`
    },
    body: JSON.stringify({ reason })
  });
}

window.pulseApi = {
  getAppConfig,
  getChecks,
  createCheck,
  deleteCheck,
  toggleMaintenance,
  failCheck,
};