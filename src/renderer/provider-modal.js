// Claude Code GUI - Provider Configuration Modal
// No require() available - runs in renderer context as global

;(function() {
  'use strict'

  // State
  let currentConfig = null
  let editingProviderId = null
  let isDirty = false

  // DOM helpers
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => document.querySelectorAll(sel)

  // Generate unique ID
  function generateId() {
    return 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  // Open main provider config modal
  function openModal() {
    loadConfig().then(() => {
      renderProviderList()
      $('#provider-modal').classList.add('active')
      isDirty = false
    })
  }

  // Close main modal
  function closeModal() {
    $('#provider-modal').classList.remove('active')
    if (isDirty && window.modelSelector) {
      window.modelSelector.refresh()
    }
  }

  // Open add/edit form modal
  function openFormModal(provider = null) {
    editingProviderId = provider ? provider.id : null
    $('#provider-form-title').textContent = provider ? '编辑供应商' : '添加供应商'
    // Fill form if editing
    if (provider) {
      $('#provider-name').value = provider.name || ''
      $('#provider-apiKey').value = provider.apiKey || ''
      $('#provider-baseUrl').value = provider.baseUrl || ''
      $('#provider-defaultModel').value = provider.defaultModel || ''
      $('#provider-models').value = (provider.models || []).join('\n')
    } else {
      // Empty form for add
      $('#provider-name').value = ''
      $('#provider-apiKey').value = ''
      $('#provider-baseUrl').value = 'https://api.anthropic.com'
      $('#provider-defaultModel').value = 'claude-3-5-sonnet-latest'
      $('#provider-models').value = 'claude-3-5-sonnet-latest\nclaude-3-opus-latest\nclaude-3-haiku-latest'
    }
    $('#provider-form-modal').classList.add('active')
  }

  // Close form modal
  function closeFormModal() {
    $('#provider-form-modal').classList.remove('active')
    editingProviderId = null
  }

  // Load config from main
  async function loadConfig() {
    currentConfig = await window.api.loadProviderConfig()
  }

  // Save config to main
  async function saveConfig(shouldUpdateClaudeSettings = false) {
    const result = await window.api.saveProviderConfig(currentConfig, shouldUpdateClaudeSettings)
    if (result.success) {
      isDirty = true
    }
    return result.success
  }

  // Render provider list
  function renderProviderList() {
    const listEl = $('#provider-list')
    listEl.innerHTML = ''

    if (!currentConfig || !currentConfig.providers || currentConfig.providers.length === 0) {
      listEl.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-muted);">No providers configured</div>'
      return
    }

    currentConfig.providers.forEach(provider => {
      const item = document.createElement('div')
      item.className = 'provider-item' + (provider.id === currentConfig.currentProviderId ? ' active' : '')
      item.dataset.providerId = provider.id

      const modelCount = provider.models ? provider.models.length : 0
      const defaultModel = provider.defaultModel || ''

      item.innerHTML = `
        <span class="provider-dot"></span>
        <div class="provider-item-info">
          <div class="provider-item-name">${escapeHtml(provider.name)}</div>
          <div class="provider-item-meta">${modelCount} models · Default: ${escapeHtml(defaultModel)}</div>
        </div>
        <div class="provider-item-actions">
          <button class="btn-icon" title="Edit">✏️</button>
          <button class="btn-icon" title="Delete">🗑️</button>
        </div>
      `

      // Click on item to select as current
      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return
        setCurrentProvider(provider.id)
      })

      // Edit button
      const editBtn = item.querySelector('.provider-item-actions button:first-child')
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openFormModal(provider)
      })

      // Delete button
      const deleteBtn = item.querySelector('.provider-item-actions button:last-child')
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteProvider(provider.id)
      })

      listEl.appendChild(item)
    })
  }

  // Set current provider
  function setCurrentProvider(providerId) {
    if (!currentConfig) return
    currentConfig.currentProviderId = providerId
    // Find the provider and set currentModel to its defaultModel if not in list
    const provider = currentConfig.providers.find(p => p.id === providerId)
    if (provider) {
      if (!provider.models.includes(currentConfig.currentModel)) {
        currentConfig.currentModel = provider.defaultModel
      }
    }
    isDirty = true
    renderProviderList()
  }

  // Delete provider
  function deleteProvider(providerId) {
    if (!currentConfig || !currentConfig.providers) return
    if (currentConfig.providers.length <= 1) {
      alert('至少需要保留一个供应商配置')
      return
    }
    if (!confirm('确认删除此供应商吗？')) return

    currentConfig.providers = currentConfig.providers.filter(p => p.id !== providerId)
    // If deleted was current, pick first available
    if (currentConfig.currentProviderId === providerId && currentConfig.providers.length > 0) {
      currentConfig.currentProviderId = currentConfig.providers[0].id
      const provider = currentConfig.providers[0]
      currentConfig.currentModel = provider.defaultModel
    }
    isDirty = true
    renderProviderList()
  }

  // Save form (add/edit)
  function saveForm() {
    const name = $('#provider-name').value.trim()
    const apiKey = $('#provider-apiKey').value
    const baseUrl = $('#provider-baseUrl').value.trim()
    const defaultModel = $('#provider-defaultModel').value.trim()
    const modelsText = $('#provider-models').value

    if (!name) {
      alert('请输入供应商名称')
      return
    }
    if (!defaultModel) {
      alert('请输入默认模型')
      return
    }

    // Parse models from text (one per line)
    const models = modelsText.split('\n')
      .map(line => line.trim())
      .filter(line => line)

    if (models.length === 0) {
      alert('至少需要添加一个模型')
      return
    }

    const providerData = {
      name,
      apiKey,
      baseUrl,
      defaultModel,
      models,
    }

    if (editingProviderId) {
      // Edit existing
      const idx = currentConfig.providers.findIndex(p => p.id === editingProviderId)
      if (idx >= 0) {
        currentConfig.providers[idx] = {
          ...currentConfig.providers[idx],
          ...providerData,
          id: editingProviderId,
        }
      }
    } else {
      // Add new
      providerData.id = generateId()
      currentConfig.providers.push(providerData)
      // Select as current
      currentConfig.currentProviderId = providerData.id
      currentConfig.currentModel = providerData.defaultModel
    }

    isDirty = true
    closeFormModal()
    renderProviderList()
  }

  // HTML escape
  function escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // Bind all events
  function init() {
    // Main modal events
    if ($('#provider-modal')) {
      // Click overlay to close
      $('#provider-modal').addEventListener('click', (e) => {
        if (e.target.id === 'provider-modal') {
          closeModal()
        }
      })

      $('.modal-close').addEventListener('click', closeModal)
      $('#cancel-provider').addEventListener('click', closeModal)

      $('#save-provider').addEventListener('click', async () => {
        // When saving provider configuration (adding/editing/deleting), update Claude Code settings.json
        await saveConfig(true)
        closeModal()
      })

      $('#add-provider-btn').addEventListener('click', () => {
        openFormModal()
      })
    }

    // Form modal events
    if ($('#provider-form-modal')) {
      $('#provider-form-modal').addEventListener('click', (e) => {
        if (e.target.id === 'provider-form-modal') {
          closeFormModal()
        }
      })

      $('.modal-close-form').addEventListener('click', closeFormModal)
      $('#cancel-provider-form').addEventListener('click', closeFormModal)
      $('#save-provider-form').addEventListener('click', saveForm)
    }

    // Open config button from toolbar
    if ($('#open-config-btn')) {
      $('#open-config-btn').addEventListener('click', openModal)
    }

    // Expose globally
    window.providerModal = {
      openModal,
      closeModal,
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})()
