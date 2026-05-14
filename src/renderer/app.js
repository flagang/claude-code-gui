// Claude Code GUI - Renderer Process
// No require() available - uses window.api from preload and global Terminal from xterm.js <script>

;(function() {
  'use strict'

  // ── State ──
  const sessions = new Map() // id -> { terminal, element, meta }
  let activeSessionId = null

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
    options.cwd = options.cwd || defaultCwd()
    const historySessionId = options.historySessionId

    // Check if we already have a session with this cwd - switch to it instead of duplicating
    for (const [id, session] of sessions.entries()) {
      if (session.meta.cwd === options.cwd) {
        switchSession(id)
        return id
      }
    }

    const meta = await window.api.spawnSession(options)
    const id = meta.id

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
    sessions.set(id, { terminal: term, element: container, meta: meta })

    // Add tab & sidebar
    const name = options.name || meta.cwd.split('/').pop() || 'session'
    addTab(id, name)
    addSidebarItem(id, name, meta)

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

    // Update tabs
    $$('.tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.sessionId === id)
    })

    // Update sidebar
    $$('.session-item').forEach(function(item) {
      item.classList.toggle('active', item.dataset.sessionId === id)
    })

    // Update status bar
    var items = $$('.status-item')
    if (items[0]) {
      items[0].innerHTML = '<span class="status-dot"></span> Running'
    }
    if (items[1]) {
      items[1].textContent = session.meta.cwd
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

    // Remove sidebar
    var item = $(`.session-item[data-session-id="${id}"]`)
    if (item) item.remove()

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
    tab.innerHTML = name + '<span class="tab-close">&times;</span>'

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

  // ── Sidebar UI ──
  function addSidebarItem(id, name, meta) {
    var list = $('.session-list')
    var item = document.createElement('div')
    item.className = 'session-item active'
    item.dataset.sessionId = id

    var dir = shortPath(meta.cwd)
    item.innerHTML =
      '<div class="session-name"><span class="session-dot running"></span>' + name + '</div>' +
      '<div class="session-meta">' + dir + ' &middot; ' + meta.model + '</div>'

    item.addEventListener('click', function() { switchSession(id) })

    $$('.session-item').forEach(function(i) { i.classList.remove('active') })
    list.appendChild(item)
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

  // ── Load and render history ──
  async function loadHistory() {
    var historyList = $('.history-list')
    if (!historyList) return

    try {
      const history = await window.api.listHistory()
      if (!history || history.length === 0) {
        historyList.innerHTML = '<div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center;">No history found</div>'
        return
      }

      historyList.innerHTML = ''
      history.forEach(function(item) {
        addHistoryItem(item)
      })
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  // ── Add history item to sidebar ──
  function addHistoryItem(history) {
    var list = $('.history-list')
    var item = document.createElement('div')
    item.className = 'history-item'
    item.dataset.cwd = history.cwd || ''

    var dir = shortPath(history.cwd || '')
    var name = history.cwd ? history.cwd.split('/').pop() : 'unknown'
    var date = formatHistoryDate(history.startedAt)
    var filename = history.pid + '.json'

    item.innerHTML =
      '<div class="history-cwd">' + name + '</div>' +
      '<div class="history-meta">' + dir + ' &middot; ' + date + '</div>' +
      '<span class="history-delete" title="Delete">×</span>'

    // Click on body to open session
    item.addEventListener('click', function(e) {
      if (!e.target.classList.contains('history-delete') && history.cwd) {
        spawnSession({
          cwd: history.cwd,
          historySessionId: history.sessionId
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
        await window.api.deleteHistory(filename)
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
        var dot = $(`.session-item[data-session-id="${id}"] .session-dot`)
        if (dot) {
          dot.classList.remove('running')
          dot.classList.add('idle')
        }
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
