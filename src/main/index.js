const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const ptyManager = require('./pty')
const ch = require('../shared/channels')

let mainWindow
const isDev = process.argv.some(arg => arg.includes('--remote-debugging-port'))

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpc() {
  // Spawn a new session
  ipcMain.handle(ch.SESSION_SPAWN, (event, options) => {
    const id = 's_' + Date.now()
    const session = ptyManager.spawnSession(id, options)

    // Forward PTY output to renderer
    session.pty.onData(data => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ch.PTY_DATA, id, data)
      }
    })

    session.pty.onExit(({ exitCode }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ch.PTY_EXIT, id, exitCode)
      }
      ptyManager.killSession(id)
    })

    return { id, pid: session.pid, cwd: session.cwd, model: session.model, createdAt: session.createdAt }
  })

  // Kill a session
  ipcMain.handle(ch.SESSION_KILL, (event, id) => {
    return ptyManager.killSession(id)
  })

  // List sessions
  ipcMain.handle(ch.SESSION_LIST, () => {
    return ptyManager.listSessions()
  })

  // Write data to PTY
  ipcMain.on(ch.PTY_WRITE, (event, id, data) => {
    ptyManager.writeSession(id, data)
  })

  // Resize PTY
  ipcMain.on(ch.PTY_RESIZE, (event, id, cols, rows) => {
    ptyManager.resizeSession(id, cols, rows)
  })

  // List historical sessions by project from ~/.claude/projects/
  ipcMain.handle(ch.HISTORY_LIST, () => {
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects')
    const projectsMap = new Map() // key: actual cwd from file, value: project object

    try {
      if (!fs.existsSync(projectsRoot)) {
        return { projects: [] }
      }

      // Read all project directories
      const entries = fs.readdirSync(projectsRoot, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === '.' || entry.name === '..') continue

        const projectDir = entry.name
        const projectPath = path.join(projectsRoot, projectDir)
        const sessionFiles = fs.readdirSync(projectPath, { withFileTypes: true })

        for (const file of sessionFiles) {
          if (!file.name.endsWith('.jsonl')) continue

          try {
            const sessionPath = path.join(projectPath, file.name)
            const content = fs.readFileSync(sessionPath, 'utf8')
            const lines = content.split('\n').filter(line => line.trim())

            if (lines.length === 0) continue

            const sessionId = file.name.replace(/\.jsonl$/, '')
            let startedAt = 0
            let aiTitle = null
            let firstUserMessage = null
            let lastModel = null
            let lastGitBranch = null
            let messageCount = 0
            let cwd = null

            // Parse all lines to extract metadata
            for (const line of lines) {
              try {
                const entry = JSON.parse(line)

                // Get cwd from first entry if available
                if (entry.cwd && !cwd) cwd = entry.cwd

                // Get timestamp from first entry with timestamp
                if (entry.timestamp && startedAt === 0) {
                  startedAt = new Date(entry.timestamp).getTime()
                }

                // Count user and assistant messages
                if (entry.type === 'user' || entry.type === 'assistant') {
                  messageCount++
                }

                // Extract AI-generated title
                if (entry.type === 'ai-title' && entry.aiTitle) {
                  aiTitle = entry.aiTitle
                }

                // Extract first user message if no aiTitle yet
                if (!aiTitle && !firstUserMessage && entry.type === 'user') {
                  let textContent = ''

                  // Try different possible locations for user message text
                  if (entry.message && entry.message.content) {
                    if (Array.isArray(entry.message.content)) {
                      textContent = entry.message.content
                        .filter(block => block.type === 'text')
                        .map(block => block.text)
                        .join('\n')
                        .trim()
                    } else if (typeof entry.message.content === 'string') {
                      textContent = entry.message.content.trim()
                    }
                  } else if (Array.isArray(entry.content)) {
                    textContent = entry.content
                      .filter(block => block.type === 'text')
                      .map(block => block.text)
                      .join('\n')
                      .trim()
                  } else if (typeof entry.content === 'string') {
                    textContent = entry.content.trim()
                  } else if (entry.display && typeof entry.display === 'string') {
                    // Fallback to display field if available
                    textContent = entry.display.trim()
                  } else if (entry.lastPrompt && typeof entry.lastPrompt === 'string') {
                    // Fallback to lastPrompt
                    textContent = entry.lastPrompt.trim()
                  }

                  if (textContent) {
                    // Truncate to 60 chars for display
                    firstUserMessage = textContent.length > 60
                      ? textContent.substring(0, 60) + '...'
                      : textContent
                  }
                }

                // Extract model from assistant messages (keep last one)
                if (entry.type === 'assistant' && entry.model) {
                  lastModel = entry.model
                }

                // Extract git branch (keep last one)
                if (entry.gitBranch) {
                  lastGitBranch = entry.gitBranch
                }

                // Get sessionId if available
                if (entry.sessionId && !sessionId) sessionId = entry.sessionId
              } catch (e) {
                continue
              }
            }

            // Skip files that have no messages (corrupted/incomplete)
            if (messageCount === 0) continue
            // Skip files that don't have cwd (can't group)
            if (!cwd) continue

            // If no timestamp found, use file mtime
            if (startedAt === 0) {
              const stat = fs.statSync(sessionPath)
              startedAt = stat.mtime.getTime()
            }

            // Group by actual cwd from file
            if (!projectsMap.has(cwd)) {
              projectsMap.set(cwd, {
                encodedName: projectDir, // keep original dir name for deletion
                fullPath: cwd,
                displayName: cwd.split('/').filter(Boolean).pop() || cwd,
                sessions: [],
              })
            }

            const project = projectsMap.get(cwd)
            project.sessions.push({
              sessionId,
              cwd,
              startedAt,
              title: aiTitle || firstUserMessage,
              model: lastModel,
              messageCount,
              gitBranch: lastGitBranch,
            })

          } catch (e) {
            // Skip invalid files
            continue
          }
        }

      }

      // Convert map to array and process each project
      const projects = Array.from(projectsMap.values())

      for (const project of projects) {
        // Sort sessions in project by startedAt, newest first
        project.sessions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        project.sessionCount = project.sessions.length
      }

      // Sort projects by most recent session
      projects.sort((a, b) => {
        const aLatest = a.sessions[0]?.startedAt || 0
        const bLatest = b.sessions[0]?.startedAt || 0
        return bLatest - aLatest
      })

      return { projects }
    } catch (e) {
      console.error('Error reading projects:', e)
      return { projects: [] }
    }
  })

  // Get historical messages for a specific session from ~/.claude/history.jsonl
  ipcMain.handle(ch.HISTORY_GET_MESSAGES, (event, sessionId) => {
    // First try to get full conversation from project file (more complete)
    // We need to find the session metadata to get cwd
    const historyDir = path.join(os.homedir(), '.claude', 'sessions')
    const projectsDir = path.join(os.homedir(), '.claude', 'projects')
    let messages = []

    try {
      // Look through sessions to find this sessionId and get its cwd
      if (fs.existsSync(historyDir)) {
        const files = fs.readdirSync(historyDir)
        for (const file of files) {
          if (!file.endsWith('.json')) continue

          try {
            const filePath = path.join(historyDir, file)
            const content = fs.readFileSync(filePath, 'utf8')
            const data = JSON.parse(content)

            if (data.sessionId === sessionId && data.cwd) {
              // Found it, try to read from project file
              // cwd starts with /, replacing / with - gives leading - automatically
              const encodedCwd = data.cwd.replace(/\//g, '-')
              const projectFile = path.join(projectsDir, encodedCwd, `${sessionId}.jsonl`)

              if (fs.existsSync(projectFile)) {
                const projectContent = fs.readFileSync(projectFile, 'utf8')
                const lines = projectContent.split('\n').filter(line => line.trim())

                for (const line of lines) {
                  try {
                    const entry = JSON.parse(line)
                    // Extract user messages from full conversation
                    if (entry.type === 'user' && Array.isArray(entry.content)) {
                      // Get the text content from user message
                      const textContent = entry.content
                        .filter(block => block.type === 'text')
                        .map(block => block.text)
                        .join('\n')
                        .trim()
                      if (textContent) {
                        messages.push(textContent)
                      }
                    }
                  } catch (e) {
                    continue
                  }
                }

                // If we got messages from project file, return them
                if (messages.length > 0) {
                  return messages
                }
              }

              break // Found the session, no need to search further
            }
          } catch (e) {
            continue
          }
        }
      }

      // Fallback to global history.jsonl if no project data or no messages found
      const historyFile = path.join(os.homedir(), '.claude', 'history.jsonl')
      if (fs.existsSync(historyFile)) {
        const content = fs.readFileSync(historyFile, 'utf8')
        const lines = content.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.sessionId === sessionId && data.display) {
              messages.push(data.display)
            }
          } catch (e) {
            continue
          }
        }
      }
    } catch (e) {
      return []
    }

    return messages
  })

  // Delete a historical session file
  ipcMain.handle(ch.HISTORY_DELETE, (event, { projectEncoded, sessionId }) => {
    const sessionFile = path.join(os.homedir(), '.claude', 'projects', projectEncoded, `${sessionId}.jsonl`)
    try {
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile)
        return { success: true }
      }
      return { success: false, error: 'File not found' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Kill all PTY sessions
  for (const s of ptyManager.listSessions()) {
    ptyManager.killSession(s.id)
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
