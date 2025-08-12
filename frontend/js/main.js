/**
 * @file Main entry point for the frontend application.
 * @note For future maintainability, consider refactoring this monolithic file
 * into smaller modules (e.g., ui.js, state.js, events.js).
 * @note The current polling mechanism is inefficient at scale. For a more robust
 * real-time experience, migrating to WebSockets is recommended.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const THEME_KEY = 'pulseTheme'
  const POLLING_INTERVAL_MS = 30000

  // --- Element Selectors ---
  const appElement = document.getElementById('app')
  const appTitle = document.getElementById('app-title')
  const checkListContainer = document.getElementById('check-list-container')
  const paginationContainer = document.getElementById('pagination-container')
  const addCheckBtn = document.getElementById('add-check-btn')
  const themeToggleBtn = document.getElementById('theme-toggle-btn')
  const sunIcon = document.getElementById('sun-icon')
  const moonIcon = document.getElementById('moon-icon')
  const logoutBtn = document.getElementById('logout-btn')

  // Check Modal
  const checkModalBackdrop = document.getElementById('check-modal-backdrop')
  const checkForm = document.getElementById('check-form')
  const checkModalTitle = document.getElementById('check-modal-title')
  const checkCancelBtn = document.getElementById('check-cancel-btn')

  // Secret (Login) Modal
  const secretModalBackdrop = document.getElementById('secret-modal-backdrop')
  const secretForm = document.getElementById('secret-form')
  const secretInput = document.getElementById('admin-secret')
  const secretCancelBtn = document.getElementById('secret-cancel-btn')
  const secretErrorMsg = document.getElementById('secret-error-msg')

  // Confirmation Modal
  const confirmModalBackdrop = document.getElementById('confirm-modal-backdrop')
  const confirmModalTitle = document.getElementById('confirm-modal-title')
  const confirmModalContent = document.getElementById('confirm-modal-content')
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn')
  const confirmActionBtn = document.getElementById('confirm-action-btn')

  // --- State ---
  let currentPage = 1
  const limit = 20
  let adminAction = { resolve: null, reject: null }
  const confirmAction = { resolve: null }
  let isAdmin = false
  let pollTimeoutId = null

  // --- Utility Functions ---

  /** FIX: Replaced manual time formatting with modern, efficient, and localized Intl API. */
  const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto', style: 'short' })
  function formatRelativeTime (unixTimestamp) {
    if (!unixTimestamp) return 'never'
    const seconds = Math.floor((new Date(unixTimestamp * 1000) - Date.now()) / 1000)
    const absSeconds = Math.abs(seconds)

    if (absSeconds < 60) return rtf.format(seconds, 'second')
    if (absSeconds < 3600) return rtf.format(Math.floor(seconds / 60), 'minute')
    if (absSeconds < 86400) return rtf.format(Math.floor(seconds / 3600), 'hour')
    if (absSeconds < 2592000) return rtf.format(Math.floor(seconds / 86400), 'day')
    if (absSeconds < 31536000) return rtf.format(Math.floor(seconds / 2592000), 'month')
    return rtf.format(Math.floor(seconds / 31536000), 'year')
  }

  // --- Theme Management ---
  function applyTheme (theme) {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    sunIcon.classList.toggle('hidden', theme === 'dark')
    moonIcon.classList.toggle('hidden', theme === 'light')
  }

  // --- Admin Session & Authorization ---
  function updateAdminStatus (newStatus) {
    isAdmin = newStatus
    logoutBtn.classList.toggle('hidden', !isAdmin)
  }

  async function handleLogout () {
    try {
      await window.pulseApi.logout()
    } catch (error) {
      console.error('Logout failed, ignoring:', error)
    } finally {
      updateAdminStatus(false)
    }
  }

  function requestAdminAction () {
    if (isAdmin) {
      return Promise.resolve(true)
    }
    secretErrorMsg.textContent = ''
    openModal(secretModalBackdrop, secretInput)
    return new Promise((resolve, reject) => {
      adminAction = { resolve, reject }
    })
  }

  // --- Modal & Accessibility Management ---
  let lastFocusedElement
  function openModal (modalBackdrop, elementToFocus) {
    lastFocusedElement = document.activeElement
    modalBackdrop.classList.remove('hidden')
    appElement.setAttribute('aria-hidden', 'true')
    if (elementToFocus) elementToFocus.focus()
    document.addEventListener('keydown', trapFocus)
  }

  function closeModal (modalBackdrop) {
    modalBackdrop.classList.add('hidden')
    appElement.setAttribute('aria-hidden', 'false')
    document.removeEventListener('keydown', trapFocus)
    if (lastFocusedElement) lastFocusedElement.focus()
  }

  function trapFocus (e) {
    const activeModal = document.querySelector('.modal-backdrop:not(.hidden) .modal')
    if (!activeModal || e.key !== 'Tab') return

    const focusableElements = Array.from(activeModal.querySelectorAll(
      'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.hasAttribute('disabled'))

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) { // Shift + Tab
      if (document.activeElement === firstElement) {
        lastElement.focus()
        e.preventDefault()
      }
    } else { // Tab
      if (document.activeElement === lastElement) {
        firstElement.focus()
        e.preventDefault()
      }
    }
  }

  function showConfirmation ({ title, contentHTML, confirmText = 'Confirm', confirmClass = 'button-primary' }) {
    confirmModalTitle.textContent = title
    confirmModalContent.innerHTML = '' // Clear previous
    confirmModalContent.append(...contentHTML) // Append nodes safely
    confirmActionBtn.textContent = confirmText
    confirmActionBtn.className = `button-primary ${confirmClass}`

    openModal(confirmModalBackdrop, confirmActionBtn)

    return new Promise((resolve) => {
      confirmAction.resolve = resolve
    })
  }

  // --- UI Rendering ---

  /** FIX: Rewritten to use DOM APIs to prevent Stored XSS vulnerabilities. */
  function renderChecks (checks) {
    if (!checkListContainer) return
    checkListContainer.innerHTML = '' // Clear previous content safely

    if (checks.length === 0 && currentPage === 1) {
      const emptyMessage = document.createElement('p')
      emptyMessage.className = 'no-checks-message'
      emptyMessage.textContent = 'No checks have been configured. Click "Add New Check" to get started.'
      checkListContainer.appendChild(emptyMessage)
      return
    }

    const host = `${window.location.protocol}//${window.location.host}`
    const fragment = document.createDocumentFragment()

    for (const check of checks) {
      const checkItem = document.createElement('div')
      checkItem.className = 'check-item'
      checkItem.dataset.status = check.status
      checkItem.dataset.uuid = check.uuid

      // Info Column
      const checkInfo = document.createElement('div')
      checkInfo.className = 'check-info'

      const nameDiv = document.createElement('div')
      nameDiv.className = 'name'
      nameDiv.textContent = check.name // SAFE: Using textContent to prevent XSS
      const statusSpan = document.createElement('span')
      statusSpan.className = 'details'
      statusSpan.textContent = ` (${check.status})`
      nameDiv.appendChild(statusSpan)

      const detailsDiv = document.createElement('div')
      detailsDiv.className = 'details'
      detailsDiv.title = check.last_ping_at ? new Date(check.last_ping_at * 1000).toLocaleString() : 'N/A'
      const duration = check.last_ping_duration_ms !== null ? `${check.last_ping_duration_ms}ms` : 'N/A'
      detailsDiv.textContent = `Last event: ${formatRelativeTime(check.last_ping_at)} • Duration: ${duration}`

      // ADDED: Display schedule and grace period
      const scheduleDiv = document.createElement('div')
      scheduleDiv.className = 'details schedule-info'
      scheduleDiv.appendChild(document.createTextNode('Schedule: '))
      const scheduleBold = document.createElement('b')
      scheduleBold.textContent = check.schedule
      scheduleDiv.appendChild(scheduleBold)
      scheduleDiv.appendChild(document.createTextNode(' • Grace: '))
      const graceBold = document.createElement('b')
      graceBold.textContent = check.grace
      scheduleDiv.appendChild(graceBold)

      const pingUrlDiv = document.createElement('div')
      pingUrlDiv.className = 'ping-url'
      const codeEl = document.createElement('code')
      codeEl.textContent = `${host}/ping/${check.uuid}` // SAFE
      pingUrlDiv.appendChild(codeEl)

      checkInfo.appendChild(nameDiv)
      checkInfo.appendChild(detailsDiv)
      checkInfo.appendChild(scheduleDiv) // ADDED

      if (check.last_error) {
        const errorDiv = document.createElement('div')
        errorDiv.className = 'error-reason'
        errorDiv.title = 'Last error reason'
        errorDiv.textContent = check.last_error // SAFE
        checkInfo.appendChild(errorDiv)
      }
      checkInfo.appendChild(pingUrlDiv)

      // Actions Column
      const actionsDiv = document.createElement('div')
      actionsDiv.className = 'check-item-actions'
      actionsDiv.innerHTML = `
        <button class="action-button maintenance-btn" aria-label="Toggle Maintenance Mode"><img src="/assets/maintenance.svg" alt="" role="presentation"/></button>
        <button class="action-button delete-btn" aria-label="Delete Check"><img src="/assets/delete.svg" alt="" role="presentation"/></button>
      `

      checkItem.appendChild(checkInfo)
      checkItem.appendChild(actionsDiv)
      fragment.appendChild(checkItem)
    }
    checkListContainer.appendChild(fragment)
  }

  function renderPagination (meta) {
    if (!meta || meta.totalPages <= 1) {
      paginationContainer.innerHTML = ''
      return
    }
    paginationContainer.innerHTML = `
      <div class="pagination">
        <button class="page-btn" ${meta.page === 1 ? 'disabled' : ''} data-page="${meta.page - 1}">Previous</button>
        <span>Page ${meta.page} of ${meta.totalPages}</span>
        <button class="page-btn" ${meta.page === meta.totalPages ? 'disabled' : ''} data-page="${meta.page + 1}">Next</button>
      </div>`
  }

  // --- Data Loading ---
  async function loadConfig () {
    try {
      const config = await window.pulseApi.getAppConfig()
      const title = config.appTitle || 'Pulse Monitor'
      appTitle.textContent = title
      document.title = title
    } catch (error) {
      console.error('Failed to load app config:', error)
    }
  }

  async function loadAndRenderChecks (page = 1) {
    clearTimeout(pollTimeoutId)
    try {
      currentPage = page
      const { checks, meta } = await window.pulseApi.getChecks({ page, limit })
      renderChecks(checks)
      renderPagination(meta)
    } catch (error) {
      console.error('Failed to load checks:', error)
      checkListContainer.innerHTML = '<p class="error-message">Error: Could not load checks. Is the backend running?</p>'
      paginationContainer.innerHTML = ''
      if (error.status === 401) updateAdminStatus(false)
    } finally {
      pollTimeoutId = setTimeout(() => loadAndRenderChecks(currentPage), POLLING_INTERVAL_MS)
    }
  }

  // --- Event Listeners ---
  themeToggleBtn.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'))
  logoutBtn.addEventListener('click', handleLogout)

  addCheckBtn.addEventListener('click', () => {
    checkModalTitle.textContent = 'Add New Check'
    checkForm.reset()
    openModal(checkModalBackdrop, document.getElementById('name'))
  })

  checkCancelBtn.addEventListener('click', () => closeModal(checkModalBackdrop))
  checkModalBackdrop.addEventListener('click', (e) => {
    if (e.target === checkModalBackdrop) closeModal(checkModalBackdrop)
  })

  checkForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await requestAdminAction()
      const formData = new FormData(checkForm)
      const data = { name: formData.get('name'), schedule: formData.get('schedule'), grace: formData.get('grace') }
      await window.pulseApi.createCheck(data)
      closeModal(checkModalBackdrop)
      loadAndRenderChecks(1)
    } catch (error) {
      if (error) {
        console.error(`Failed to create check: ${error.message}`)
        if (error.status !== 401) {
          const content = document.createTextNode(`Failed to create check: ${error.message}`)
          showConfirmation({ title: 'Error', contentHTML: [content], confirmText: 'OK', confirmClass: 'button-danger' })
        }
      }
    }
  })

  checkListContainer.addEventListener('click', async (e) => {
    const actionButton = e.target.closest('.action-button')
    if (!actionButton) return
    const checkItem = actionButton.closest('.check-item')
    if (!checkItem) return

    const uuid = checkItem.dataset.uuid
    const checkName = checkItem.querySelector('.name').textContent.split('(')[0].trim() // Safe, from textContent

    if (actionButton.classList.contains('delete-btn')) {
      // FIX: Build confirmation message safely to prevent any potential XSS.
      const content = [
        document.createTextNode('Are you sure you want to delete the check "'),
        Object.assign(document.createElement('b'), { textContent: checkName }),
        document.createTextNode('"? This action cannot be undone.')
      ]
      const confirmed = await showConfirmation({ title: 'Delete Check', contentHTML: content, confirmText: 'Delete', confirmClass: 'button-danger' })
      if (!confirmed) return
      try {
        await requestAdminAction()
        await window.pulseApi.deleteCheck(uuid)
        const currentItemCount = document.querySelectorAll('.check-item').length
        loadAndRenderChecks(currentItemCount === 1 && currentPage > 1 ? currentPage - 1 : currentPage)
      } catch (error) {
        if (error) console.error(`Failed to delete check: ${error.message}`)
      }
    } else if (actionButton.classList.contains('maintenance-btn')) {
      try {
        await requestAdminAction()
        await window.pulseApi.toggleMaintenance(uuid)
        loadAndRenderChecks(currentPage)
      } catch (error) {
        if (error) console.error(`Failed to toggle maintenance: ${error.message}`)
      }
    }
  })

  paginationContainer.addEventListener('click', (e) => {
    if (e.target.matches('.page-btn') && !e.target.disabled) {
      loadAndRenderChecks(parseInt(e.target.dataset.page, 10))
    }
  })

  // Login Modal Logic
  secretForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!adminAction.resolve) return
    const secret = secretInput.value
    try {
      await window.pulseApi.login(secret)
      updateAdminStatus(true)
      closeModal(secretModalBackdrop)
      secretForm.reset()
      adminAction.resolve(true)
    } catch (error) {
      secretErrorMsg.textContent = 'Invalid secret.'
      console.error('Login failed:', error)
      updateAdminStatus(false)
    }
  })

  secretCancelBtn.addEventListener('click', () => {
    if (adminAction.reject) adminAction.reject(null)
    closeModal(secretModalBackdrop)
  })
  secretModalBackdrop.addEventListener('click', (e) => {
    if (e.target === secretModalBackdrop) secretCancelBtn.click()
  })

  // Confirmation Modal Logic
  confirmCancelBtn.addEventListener('click', () => {
    if (confirmAction.resolve) confirmAction.resolve(false)
    closeModal(confirmModalBackdrop)
  })
  confirmActionBtn.addEventListener('click', () => {
    if (confirmAction.resolve) confirmAction.resolve(true)
    closeModal(confirmModalBackdrop)
  });

  // --- Initial Load ---
  (async function initialize () {
    const savedTheme = localStorage.getItem(THEME_KEY)
    const preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    applyTheme(savedTheme || preferredTheme)
    try {
      await window.pulseApi.checkAuthStatus()
      updateAdminStatus(true)
    } catch (e) {
      updateAdminStatus(false)
    }
    loadConfig()
    loadAndRenderChecks(1)
  })()
})
