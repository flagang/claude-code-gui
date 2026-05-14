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

  // List historical sessions from ~/.claude/sessions/
  ipcMain.handle(ch.HISTORY_LIST, () => {
    const historyDir = path.join(os.homedir(), '.claude', 'sessions')
    const history = []

    try {
      if (!fs.existsSync(historyDir)) {
        return []
      }

      const files = fs.readdirSync(historyDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue

        try {
          const filePath = path.join(historyDir, file)
          const content = fs.readFileSync(filePath, 'utf8')
          const data = JSON.parse(content)

          history.push({
            pid: data.pid,
            sessionId: data.sessionId,
            cwd: data.cwd || '',
            startedAt: data.startedAt || 0,
            version: data.version || '',
            entrypoint: data.entrypoint || 'cli',
          })
        } catch (e) {
          // Skip invalid JSON files
          continue
        }
      }

      // Sort by startedAt, newest first
      history.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    } catch (e) {
      // If directory not accessible, return empty
      return []
    }

    return history
  })

  // Get historical messages for a specific session from ~/.claude/history.jsonl
  ipcMain.handle(ch.HISTORY_GET_MESSAGES, (event, sessionId) => {
    const historyFile = path.join(os.homedir(), '.claude', 'history.jsonl')
    const messages = []

    try {
      if (!fs.existsSync(historyFile)) {
        return []
      }

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
    } catch (e) {
      return []
    }

    return messages
  })

  // Delete a historical session file
  ipcMain.handle(ch.HISTORY_DELETE, (event, filename) => {
    const historyFile = path.join(os.homedir(), '.claude', 'sessions', filename)
    try {
      if (fs.existsSync(historyFile)) {
        fs.unlinkSync(historyFile)
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
