/**
 * @file Main entry point for the Pulse frontend application.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const SECRET_KEY = 'pulseAdminSecret';
  const SECRET_EXPIRY_KEY = 'pulseAdminSecretExpiry';
  const THEME_KEY = 'pulseTheme';

  // --- Element Selectors ---
  const appTitle = document.getElementById('app-title');
  const checkListContainer = document.getElementById('check-list-container');
  const paginationContainer = document.getElementById('pagination-container');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const checkForm = document.getElementById('check-form');
  const modalTitle = document.getElementById('modal-title');
  const addCheckBtn = document.getElementById('add-check-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const secretModalBackdrop = document.getElementById('secret-modal-backdrop');
  const secretForm = document.getElementById('secret-form');
  const secretInput = document.getElementById('admin-secret');
  const secretCancelBtn = document.getElementById('secret-cancel-btn');
  const secretModalTitle = document.getElementById('secret-modal-title');
  const rememberDurationSelect = document.getElementById('remember-duration');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');
  const logoutBtn = document.getElementById('logout-btn');

  // --- State ---
  let currentPage = 1;
  const limit = 20;
  let adminActionResolver = null;

  // --- Utility Functions ---
  function formatRelativeTime(unixTimestamp) {
    if (!unixTimestamp) return 'never';
    const now = new Date();
    const past = new Date(unixTimestamp * 1000);
    const seconds = Math.floor((now - past) / 1000);
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds} seconds ago`;
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} years ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    return `${Math.floor(seconds / 60)} minutes ago`;
  }

  // --- Theme Management ---
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    sunIcon.classList.toggle('hidden', theme === 'dark');
    moonIcon.classList.toggle('hidden', theme === 'light');
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  }

  // --- Admin Secret Management ---
  function forgetAdminSecret() {
    sessionStorage.removeItem(SECRET_KEY);
    sessionStorage.removeItem(SECRET_EXPIRY_KEY);
    updateLogoutButtonVisibility();
  }

  function updateLogoutButtonVisibility() {
    logoutBtn.classList.toggle('hidden', !sessionStorage.getItem(SECRET_KEY));
  }

  function getAdminSecret(title) {
    const storedSecret = sessionStorage.getItem(SECRET_KEY);
    const expiry = sessionStorage.getItem(SECRET_EXPIRY_KEY);
    if (storedSecret && (expiry === 'session' || (expiry && Date.now() < parseInt(expiry, 10)))) {
      return Promise.resolve(storedSecret);
    }
    forgetAdminSecret();
    secretModalTitle.textContent = title;
    secretModalBackdrop.classList.remove('hidden');
    secretInput.focus();
    return new Promise((resolve) => { adminActionResolver = resolve; });
  }

  // --- UI Rendering ---
  function renderChecks(checks) {
    if (!checkListContainer) return;

    if (checks.length === 0 && currentPage === 1) {
      checkListContainer.innerHTML = '<p class="no-checks-message">No checks have been configured. Click "Add New Check" to get started.</p>';
      return;
    }

    checkListContainer.innerHTML = checks.map(check => {
      const lastPingRelative = formatRelativeTime(check.last_ping_at);
      const lastPingAbsolute = check.last_ping_at ? new Date(check.last_ping_at * 1000).toLocaleString() : 'N/A';
      const duration = check.last_ping_duration_ms !== null ? `${check.last_ping_duration_ms}ms` : 'N/A';
      const host = `${window.location.protocol}//${window.location.host}`;
      const errorReasonHtml = check.last_error ? `<div class="error-reason" title="Last error reason">${check.last_error}</div>` : '';

      return `
                <div class="check-item" data-status="${check.status}" data-uuid="${check.uuid}">
                    <div class="check-info">
                        <div class="name">${check.name} <span class="details">(${check.status})</span></div>
                        <div class="details" title="${lastPingAbsolute}">
                            Last event: ${lastPingRelative} &bull; Duration: ${duration}
                        </div>
                        ${errorReasonHtml}
                        <div class="ping-url">
                           <code>${host}/ping/${check.uuid}</code>
                        </div>
                    </div>
                    <div class="check-item-actions">
                        <button class="action-button maintenance-btn" title="Toggle Maintenance Mode">
                            <img src="/assets/maintenance.svg" alt="Maintenance"/>
                        </button>
                        <button class="action-button delete-btn" title="Delete Check">
                             <img src="/assets/delete.svg" alt="Delete"/>
                        </button>
                    </div>
                </div>
            `;
    }).join('');
  }

  function renderPagination(meta) {
    if (meta.totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }
    paginationContainer.innerHTML = `
            <div class="pagination">
                <button class="page-btn" ${meta.page === 1 ? 'disabled' : ''} data-page="${meta.page - 1}">Previous</button>
                <span>Page ${meta.page} of ${meta.totalPages}</span>
                <button class="page-btn" ${meta.page === meta.totalPages ? 'disabled' : ''} data-page="${meta.page + 1}">Next</button>
            </div>`;
  }

  // --- Data Loading ---
  async function loadConfig() {
    try {
      const config = await window.pulseApi.getAppConfig();
      const title = config.appTitle || 'Pulse Monitor';
      appTitle.textContent = title;
      document.title = title;
    } catch (error) {
      console.error('Failed to load app config:', error);
    }
  }

  async function loadAndRenderChecks(page = 1) {
    try {
      currentPage = page;
      const { checks, meta } = await window.pulseApi.getChecks({ page, limit });
      renderChecks(checks);
      renderPagination(meta);
    } catch (error) {
      console.error('Failed to load checks:', error);
      checkListContainer.innerHTML = `<p class="error-message">Error: Could not load checks. Is the backend running?</p>`;
      paginationContainer.innerHTML = '';
    }
  }

  // --- Modal Handling ---
  function showCheckModal() {
    modalBackdrop.classList.remove('hidden');
  }

  function hideCheckModal() {
    modalBackdrop.classList.add('hidden');
    checkForm.reset();
  }

  function hideSecretModal() {
    secretModalBackdrop.classList.add('hidden');
    secretForm.reset();
  }

  // --- Event Listeners ---
  themeToggleBtn.addEventListener('click', toggleTheme);
  logoutBtn.addEventListener('click', forgetAdminSecret);

  addCheckBtn.addEventListener('click', () => {
    modalTitle.textContent = 'Add New Check';
    showCheckModal();
  });

  cancelBtn.addEventListener('click', hideCheckModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) hideCheckModal();
  });

  checkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adminSecret = await getAdminSecret('Confirm to Save Check');
    if (!adminSecret) return;
    const formData = new FormData(checkForm);
    const data = { name: formData.get('name'), schedule: formData.get('schedule'), grace: formData.get('grace') };
    try {
      await window.pulseApi.createCheck(data, adminSecret);
      hideCheckModal();
      loadAndRenderChecks(1);
    } catch (error) {
      alert(`Failed to create check: ${error.message}`);
    }
  });

  checkListContainer.addEventListener('click', async (e) => {
    const checkItem = e.target.closest('.check-item');
    if (!checkItem) return;
    const uuid = checkItem.dataset.uuid;
    const checkName = checkItem.querySelector('.name').textContent;

    if (e.target.closest('.delete-btn')) {
      if (!confirm(`Are you sure you want to delete the check "${checkName}"?`)) return;
      const adminSecret = await getAdminSecret('Confirm to Delete Check');
      if (!adminSecret) return;
      try {
        await window.pulseApi.deleteCheck(uuid, adminSecret);
        const currentItemCount = document.querySelectorAll('.check-item').length;
        loadAndRenderChecks(currentItemCount === 1 && currentPage > 1 ? currentPage - 1 : currentPage);
      } catch (error) {
        alert(`Failed to delete check: ${error.message}`);
      }
    } else if (e.target.closest('.maintenance-btn')) {
      const adminSecret = await getAdminSecret('Confirm to Toggle Maintenance');
      if (!adminSecret) return;
      try {
        await window.pulseApi.toggleMaintenance(uuid, adminSecret);
        loadAndRenderChecks(currentPage);
      } catch (error) {
        alert(`Failed to toggle maintenance: ${error.message}`);
      }
    }
  });

  paginationContainer.addEventListener('click', (e) => {
    if (e.target.matches('.page-btn') && !e.target.disabled) {
      loadAndRenderChecks(parseInt(e.target.dataset.page, 10));
    }
  });

  secretForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!adminActionResolver) return;
    const secret = secretInput.value;
    const duration = rememberDurationSelect.value;
    if (secret && duration !== '0') {
      sessionStorage.setItem(SECRET_KEY, secret);
      if (duration === 'session') {
        sessionStorage.setItem(SECRET_EXPIRY_KEY, 'session');
      } else {
        const expiryTime = Date.now() + (parseInt(duration, 10) * 1000);
        sessionStorage.setItem(SECRET_EXPIRY_KEY, expiryTime);
      }
      updateLogoutButtonVisibility();
    }
    adminActionResolver(secret);
    hideSecretModal();
  });

  secretCancelBtn.addEventListener('click', () => {
    if (adminActionResolver) adminActionResolver(null);
    hideSecretModal();
  });

  secretModalBackdrop.addEventListener('click', (e) => {
    if (e.target === secretModalBackdrop) {
      if (adminActionResolver) adminActionResolver(null);
      hideSecretModal();
    }
  });

  // --- Initial Load ---
  (function initialize() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    applyTheme(savedTheme || preferredTheme);
    updateLogoutButtonVisibility();
    loadConfig();
    loadAndRenderChecks(1);
    setInterval(() => loadAndRenderChecks(currentPage), 30000);
  })();
});