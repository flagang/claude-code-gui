const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const ptyManager = require('./pty')
const ch = require('../shared/channels')

let mainWindow

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
    mainWindow.webContents.openDevTools()
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
