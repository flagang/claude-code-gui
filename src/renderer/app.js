// Claude Code GUI - Renderer Process
// No require() available - uses window.api from preload and global Terminal from xterm.js <script>

;(function() {
  'use strict'

  // ── State ──
  const sessions = new Map() // id -> { terminal, element, meta }
  window.sessions = sessions // expose globally for model-selector
  let activeSessionId = null
  window.activeSessionId = null // expose globally for model-selector
  let selectedProjectCwd = null // 当前选中的项目目录

  // ── DOM helpers ──
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => document.querySelectorAll(sel)

  // ── Create xterm.js Terminal ──
  function createTerminal(container) {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#45475a',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#74c7ec',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#74c7ec',
        brightWhite: '#a6adc8',
      },
      allowProposedApi: true,
    })

    term.open(container)

    // Delayed fit after render
    requestAnimationFrame(() => fitTerminal(term, container))
    return term
  }

  // ── Manual fit (replaces addon-fit) ──
  function fitTerminal(term, container) {
    if (!container || !term.element) return
    const core = term._core
    if (!core || !core._renderService) return

    const dims = core._renderService.dimensions
    if (!dims || !dims.css) return

    const cellWidth = dims.css.cell.width
    const cellHeight = dims.css.cell.height
    if (!cellWidth || !cellHeight) return

    const cols = Math.max(1, Math.floor(container.clientWidth / cellWidth))
    const rows = Math.max(1, Math.floor(container.clientHeight / cellHeight))

    if (term.cols !== cols || term.rows !== rows) {
      term.resize(cols, rows)
    }
  }

  // ── Default cwd ──
  function defaultCwd() {
    return window._defaultCwd || '~'
  }

  // ── Shorten path for display ──
  function shortPath(cwd) {
    return cwd.replace(/^\/Users\/[^/]+/, '~')
  }

  // ── Spawn a new session ──
  async function spawnSession(options) {
    options = options || {}
    options.cwd = options.cwd || selectedProjectCwd || defaultCwd()
    const historySessionId = options.historySessionId
    const historyModel = options.model
    const historyTitle = options.title
    // Resume existing Claude session from history
    if (historySessionId) {
      options.resume = historySessionId
    }

    // If this exact history session is already open, just switch to it
    // Allow multiple sessions with the same cwd (different history sessions)
    if (historySessionId) {
      for (const [id, session] of sessions.entries()) {
        if (session.meta.historySessionId === historySessionId) {
          switchSession(id)
          return id
        }
      }
    }

    // Pass model from history if available
    if (historyModel) {
      options.model = historyModel
    }

    const meta = await window.api.spawnSession(options)
    const id = meta.id
    // Store current model in meta (main process passes back the effective model)
    meta.historySessionId = historySessionId
    meta.currentModel = meta.model
    // Store title from history if available
    if (historyTitle) {
      meta.title = historyTitle
    }

    // Hide placeholder
    const placeholder = $('.terminal-placeholder')
    if (placeholder) placeholder.style.display = 'none'

    // Create terminal container
    const container = document.createElement('div')
    container.className = 'terminal-container'
    container.dataset.sessionId = id
    container.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:none;'

    const terminalArea = $('.terminal-area')
    terminalArea.style.position = 'relative'
    terminalArea.appendChild(container)

    // Create xterm instance
    const term = createTerminal(container)

    // Terminal input -> PTY
    term.onData(function(data) {
      window.api.ptyWrite(id, data)
    })

    // Store session
    meta.historySessionId = historySessionId
    sessions.set(id, { terminal: term, element: container, meta: meta })

    // Add tab
    // Use session title if available (from history), otherwise use directory name
    // Truncate to 60 chars to match history display
    let tabName = meta.title || options.name || meta.cwd.split('/').pop() || 'session'
    if (tabName.length > 60) {
      tabName = tabName.substring(0, 60) + '...'
    }
    addTab(id, tabName)

    // Switch to it
    switchSession(id)

    // Resize PTY
    window.api.ptyResize(id, term.cols, term.rows)

    // If we have a history session id, load and print history
    if (historySessionId) {
      setTimeout(async () => {
        try {
          const messages = await window.api.getHistoryMessages(historySessionId)
          if (messages.length > 0) {
            term.write('\x1b[1;30m' + '─'.repeat(Math.min(term.cols || 60, 80)) + '\x1b[0m\r\n')
            term.write('\x1b[90m[恢复历史对话 - 共' + messages.length + '条消息]\x1b[0m\r\n')
            messages.forEach((msg, index) => {
              // Simple formatting: user input in gray
              term.write('\x1b[90m❯ ' + msg + '\x1b[0m\r\n')
            })
            term.write('\x1b[1;30m' + '─'.repeat(Math.min(term.cols || 60, 80)) + '\x1b[0m\r\n\r\n')
          }
          // Refocus terminal after writing history
          term.focus()
        } catch (e) {
          console.error('Failed to load history messages:', e)
        }
      }, 300)
    }

    return id
  }

  // ── Switch active session ──
  function switchSession(id) {
    // Hide all
    sessions.forEach(function(s) {
      s.element.style.display = 'none'
    })

    var session = sessions.get(id)
    if (!session) return

    session.element.style.display = 'block'
    activeSessionId = id
    window.activeSessionId = id

    // Update tabs
    $$('.tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.sessionId === id)
    })

    // Update status bar
    var items = $$('.status-item')
    if (items[0]) {
      items[0].innerHTML = '<span class="status-dot"></span> Running'
    }
    if (items[1]) {
      items[1].textContent = session.meta.cwd
    }

    // Update model selector display to current session's model
    if (window.modelSelector && session.meta.currentModel) {
      window.modelSelector.setCurrentModel(session.meta.currentModel)
    }

    // Focus & refit
    session.terminal.focus()
    setTimeout(function() {
      fitTerminal(session.terminal, session.element)
      window.api.ptyResize(id, session.terminal.cols, session.terminal.rows)
    }, 50)
  }

  // ── Kill session ──
  async function killSession(id) {
    await window.api.killSession(id)

    var session = sessions.get(id)
    if (session) {
      session.terminal.dispose()
      session.element.remove()
      sessions.delete(id)
    }

    // Remove tab
    var tab = $(`.tab[data-session-id="${id}"]`)
    if (tab) tab.remove()

    // Switch away
    if (activeSessionId === id) {
      var remaining = Array.from(sessions.keys())
      if (remaining.length > 0) {
        switchSession(remaining[remaining.length - 1])
      } else {
        activeSessionId = null
        showPlaceholder()
      }
    }
  }

  // ── Tab UI ──
  function addTab(id, name) {
    var tabs = $('.tabs')
    var tab = document.createElement('div')
    tab.className = 'tab active'
    tab.dataset.sessionId = id
    tab.innerHTML = '<span class="tab-label">' + name + '</span><span class="tab-close">&times;</span>'

    tab.addEventListener('click', function(e) {
      if (e.target.classList.contains('tab-close')) {
        killSession(id)
      } else {
        switchSession(id)
      }
    })

    $$('.tab').forEach(function(t) { t.classList.remove('active') })
    tabs.appendChild(tab)
  }


  // ── Placeholder ──
  function showPlaceholder() {
    var p = $('.terminal-placeholder')
    if (p) p.style.display = 'block'
    var items = $$('.status-item')
    if (items[0]) items[0].innerHTML = '<span class="status-dot"></span> Ready'
  }

  // ── Resize handler ──
  var resizeTimer
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function() {
      var session = sessions.get(activeSessionId)
      if (!session) return
      fitTerminal(session.terminal, session.element)
      window.api.ptyResize(activeSessionId, session.terminal.cols, session.terminal.rows)
    }, 100)
  })

  // ── Format date ──
  function formatHistoryDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Within last 24 hours: show time
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    }
    // Otherwise: show date
    return date.toLocaleDateString([], {month: 'short', day: 'numeric'})
  }

  // ── Load and render history by project groups ──
  async function loadHistory() {
    var historyList = $('.history-list')
    if (!historyList) return

    try {
      const result = await window.api.listHistory()
      const projects = result && result.projects ? result.projects : []
      if (projects.length === 0) {
        historyList.innerHTML = '<div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center;">No history found</div>'
        return
      }

      historyList.innerHTML = ''
      projects.forEach(function(project, index) {
        // Default: first project expanded, others collapsed
        const expanded = index === 0
        addProjectGroup(project, expanded)
      })
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  // ── Add a project group with collapsible sessions ──
  function addProjectGroup(project, expanded) {
    var historyList = $('.history-list')
    var group = document.createElement('div')
    group.className = 'project-group ' + (expanded ? 'expanded' : 'collapsed')
    group.dataset.encodedName = project.encodedName
    group.dataset.cwd = project.fullPath

    // Project header with toggle
    var header = document.createElement('div')
    header.className = 'project-header'
    header.innerHTML = `
      <span class="project-toggle">▼</span>
      <span class="project-name">${shortPath(project.fullPath)}</span>
      <span class="project-count">${project.sessionCount}</span>
    `

    // Sessions container
    var sessionsContainer = document.createElement('div')
    sessionsContainer.className = 'project-sessions'

    // Add all sessions for this project
    project.sessions.forEach(function(session) {
      addSessionToGroup(session, project.encodedName, sessionsContainer)
    })

    // Select, expand and collapse on click
    header.addEventListener('click', function() {
      // Select this project
      selectedProjectCwd = project.fullPath

      // Remove selected class from all headers
      $$('.project-header').forEach(h => h.classList.remove('selected'))
      // Add selected class to this header
      header.classList.add('selected')

      // Close all other project groups
      $$('.project-group').forEach(g => {
        if (g !== group) {
          g.classList.remove('expanded')
          g.classList.add('collapsed')
        }
      })

      // Toggle this group
      const isCollapsed = group.classList.contains('collapsed')
      group.classList.toggle('collapsed', !isCollapsed)
      group.classList.toggle('expanded', isCollapsed)
    })

    group.appendChild(header)
    group.appendChild(sessionsContainer)
    historyList.appendChild(group)
  }

  // ── Add a single session item to a project group ──
  function addSessionToGroup(history, projectEncoded, container) {
    var item = document.createElement('div')
    item.className = 'history-item'
    item.dataset.cwd = history.cwd || ''
    item.dataset.sessionId = history.sessionId

    var dir = shortPath(history.cwd || '')
    var name = history.cwd ? history.cwd.split('/').pop() : 'unknown'
    var date = formatHistoryDate(history.startedAt)

    // Model class for color dot
    function getModelClass(model) {
      if (!model) return ''
      const lower = model.toLowerCase()
      if (lower.includes('opus')) return 'opus'
      if (lower.includes('sonnet')) return 'sonnet'
      if (lower.includes('haiku')) return 'haiku'
      return 'sonnet'
    }

    var modelDot = history.model ? `<span class="history-model-dot model-dot ${getModelClass(history.model)}"></span>` : ''

    // Build meta parts
    var metaParts = []
    if (dir && !history.title) metaParts.push(dir)
    if (history.messageCount) metaParts.push(`${history.messageCount} 条消息`)
    metaParts.push(date)

    var html = ''
    if (history.title) {
      // Have AI-generated title - show it as the main heading
      html =
        '<div class="history-title">' + modelDot + history.title + '</div>' +
        '<div class="history-meta">' + metaParts.join(' &middot; ') + '</div>'
    } else {
      // No title - fallback to original display
      html =
        '<div class="history-cwd">' + modelDot + name + '</div>' +
        '<div class="history-meta">' + metaParts.join(' &middot; ') + '</div>'
    }

    item.innerHTML = html + '<span class="history-delete" title="Delete">×</span>'

    // Click on body to open session
    item.addEventListener('click', function(e) {
      if (!e.target.classList.contains('history-delete') && history.cwd) {
        spawnSession({
          cwd: history.cwd,
          historySessionId: history.sessionId,
          model: history.model,
          title: history.title
        })
      }
    })

    // Delete button
    var deleteBtn = item.querySelector('.history-delete')
    deleteBtn.addEventListener('click', async function(e) {
      e.stopPropagation()
      try {
        await window.api.deleteHistory({
          projectEncoded: projectEncoded,
          sessionId: history.sessionId
        })
        item.remove()
        // If this was the last session in the project, remove the project group
        const sessions = container.querySelectorAll('.history-item')
        if (sessions.length === 0) {
          const group = container.parentNode
          if (group) group.remove()
        }
      } catch (e) {
        console.error('Failed to delete history:', e)
        alert('删除失败: ' + e.message)
      }
    })

    container.appendChild(item)
  }

  // ── Add history item to sidebar ── (keep for compatibility, not used anymore)
  function addHistoryItem(history) {
    var list = $('.history-list')
    var item = document.createElement('div')
    item.className = 'history-item'
    item.dataset.cwd = history.cwd || ''

    var dir = shortPath(history.cwd || '')
    var name = history.cwd ? history.cwd.split('/').pop() : 'unknown'
    var date = formatHistoryDate(history.startedAt)

    // Model class for color dot
    function getModelClass(model) {
      if (!model) return ''
      const lower = model.toLowerCase()
      if (lower.includes('opus')) return 'opus'
      if (lower.includes('sonnet')) return 'sonnet'
      if (lower.includes('haiku')) return 'haiku'
      return 'sonnet'
    }

    var modelDot = history.model ? `<span class="history-model-dot model-dot ${getModelClass(history.model)}"></span>` : ''

    // Build meta parts
    var metaParts = []
    if (dir) metaParts.push(dir)
    if (history.messageCount) metaParts.push(`${history.messageCount} 条消息`)
    metaParts.push(date)

    var html = ''
    if (history.title) {
      // Have AI-generated title - show it as the main heading
      html =
        '<div class="history-title">' + modelDot + history.title + '</div>' +
        '<div class="history-meta">' + metaParts.join(' &middot; ') + '</div>'
    } else {
      // No title - fallback to original display
      html =
        '<div class="history-cwd">' + modelDot + name + '</div>' +
        '<div class="history-meta">' + metaParts.join(' &middot; ') + '</div>'
    }

    item.innerHTML = html + '<span class="history-delete" title="Delete">×</span>'

    // Click on body to open session
    item.addEventListener('click', function(e) {
      if (!e.target.classList.contains('history-delete') && history.cwd) {
        spawnSession({
          cwd: history.cwd,
          historySessionId: history.sessionId,
          model: history.model,
          title: history.title
        })
      }
    })

    // Delete button
    var deleteBtn = item.querySelector('.history-delete')
    deleteBtn.addEventListener('click', async function(e) {
      e.stopPropagation()
      if (!confirm('确认删除此历史会话吗？\n\n' + dir + ' (' + name + ')')) {
        return
      }
      try {
        await window.api.deleteHistory(history.pid + '.json')
        item.remove()
      } catch (e) {
        console.error('Failed to delete history:', e)
        alert('删除失败: ' + e.message)
      }
    })

    list.appendChild(item)
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function() {
    // PTY data -> terminal
    window.api.onPtyData(function(id, data) {
      var session = sessions.get(id)
      if (session) session.terminal.write(data)
    })

    // PTY exit
    window.api.onPtyExit(function(id, exitCode) {
      var session = sessions.get(id)
      if (session) {
        session.terminal.write('\r\n\x1b[90m[Process exited with code ' + exitCode + ']\x1b[0m\r\n')
      }
    })

    // New Session button (sidebar)
    var newBtn = $('.sidebar-footer .btn')
    if (newBtn) newBtn.addEventListener('click', function() { spawnSession() })

    // Start Session button (placeholder)
    var startBtn = $('.terminal-placeholder .btn')
    if (startBtn) startBtn.addEventListener('click', function() { spawnSession() })

    // New Tab button
    var newTabBtn = $('.tabbar-actions .btn-icon')
    if (newTabBtn) newTabBtn.addEventListener('click', function() { spawnSession() })

    // Set default cwd from preload
    window._defaultCwd = window.api.defaultCwd || '~'

    // Load history
    loadHistory()
  })

})()
