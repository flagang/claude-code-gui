// Claude Code GUI - Model Selector Dropdown
// No require() available - runs in renderer context as global

;(function() {
  'use strict'

  // State
  let currentConfig = null
  let currentProvider = null
  let currentModel = null
  let dropdownOpen = false

  // DOM helpers
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => document.querySelectorAll(sel)

  // Get model dot color class based on model name
  function getModelColorClass(modelName) {
    if (!modelName) return 'sonnet'
    const lower = modelName.toLowerCase()
    if (lower.includes('opus')) return 'opus'
    if (lower.includes('sonnet')) return 'sonnet'
    if (lower.includes('haiku')) return 'haiku'
    return 'sonnet'
  }

  // Shorten model name for display
  function shortenModelName(modelName) {
    if (!modelName) return ''
    // Remove common prefixes like claude-3- for cleaner display
    let short = modelName
      .replace(/^claude-3-/, '')
      .replace(/^claude-/, '')
      .replace(/-latest$/, '')
    if (short.length > 20) {
      return short.substring(0, 17) + '...'
    }
    return short
  }

  // Load current config from main
  async function loadCurrent() {
    const result = await window.api.getCurrentProvider()
    currentProvider = result.provider
    currentModel = result.model
    currentConfig = await window.api.loadProviderConfig()
    updateDisplay()
  }

  // Update toolbar display
  function updateDisplay() {
    const selector = $('#model-selector')
    if (!selector) return

    const colorClass = getModelColorClass(currentModel)
    const shortName = shortenModelName(currentModel)

    selector.innerHTML = `
      <span class="model-dot ${colorClass}"></span>
      <span>${escapeHtml(shortName)}</span>
    `
  }

  // Render dropdown content
  function renderDropdown() {
    const dropdown = $('#model-dropdown')
    if (!dropdown || !currentProvider || !currentProvider.models) return

    dropdown.innerHTML = ''

    // Add provider header
    const header = document.createElement('div')
    header.className = 'model-dropdown-provider'
    header.textContent = `${currentProvider.name} · Models`
    dropdown.appendChild(header)

    // Add divider
    const divider = document.createElement('div')
    divider.className = 'model-dropdown-divider'
    dropdown.appendChild(divider)

    // Add models
    currentProvider.models.forEach(model => {
      const item = document.createElement('div')
      item.className = 'model-dropdown-item' + (model === currentModel ? ' active' : '')
      item.textContent = model
      item.dataset.model = model
      item.addEventListener('click', () => {
        selectModel(model)
      })
      dropdown.appendChild(item)
    })
  }

  // Toggle dropdown
  function toggleDropdown(e) {
    e.stopPropagation()
    if (dropdownOpen) {
      closeDropdown()
    } else {
      openDropdown()
    }
  }

  // Open dropdown
  function openDropdown() {
    renderDropdown()
    $('#model-dropdown').classList.add('active')
    dropdownOpen = true
  }

  // Close dropdown
  function closeDropdown() {
    $('#model-dropdown').classList.remove('active')
    dropdownOpen = false
  }

  // Select model
  function selectModel(model) {
    currentModel = model
    // Update config
    if (currentConfig) {
      currentConfig.currentModel = model
      // Save to main in background - do NOT update Claude settings when just changing model
      window.api.saveProviderConfig(currentConfig, false)
    }
    updateDisplay()
    closeDropdown()
    // Update current session's model in memory
    updateCurrentSessionModel(model)
    // Send /model command to active session
    sendModelCommand(model)
  }

  // Update model in current session metadata
  function updateCurrentSessionModel(model) {
    const activeId = window.activeSessionId
    if (!activeId || !window.sessions) return
    const session = window.sessions.get(activeId)
    if (session && session.meta) {
      session.meta.currentModel = model
    }
  }

  // Set current model externally (when switching tabs)
  function setCurrentModel(model) {
    currentModel = model
    updateDisplay()
  }

  // Send /model command to current active session
  function sendModelCommand(model) {
    // Get active session ID from app.js (global)
    const activeId = window.activeSessionId
    if (!activeId || !window.api) {
      console.warn('No active session to send model command')
      return
    }
    // Send the command: /model {name} + carriage return (auto confirm with Enter)
    const command = `/model ${model}\r`
    window.api.ptyWrite(activeId, command)
  }

  // Click outside to close
  function handleClickOutside(e) {
    const dropdown = $('#model-dropdown')
    const selector = $('#model-selector')
    if (!dropdownOpen) return
    if (!dropdown.contains(e.target) && !selector.contains(e.target)) {
      closeDropdown()
    }
  }

  // HTML escape
  function escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // Refresh after config change
  function refresh() {
    loadCurrent()
  }

  // Init
  function init() {
    // Bind click on model selector
    const selector = $('#model-selector')
    if (selector) {
      selector.addEventListener('click', toggleDropdown)
    }

    // Click outside to close
    document.addEventListener('click', handleClickOutside)

    // Load initial config
    loadCurrent()

    // Expose globally
    window.modelSelector = {
      refresh,
      loadCurrent,
      setCurrentModel,
      getCurrentModel: () => currentModel,
      getCurrentProvider: () => currentProvider,
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})()
