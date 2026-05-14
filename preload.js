const { contextBridge, ipcRenderer } = require('electron')

const ch = {
  SESSION_SPAWN: 'session:spawn',
  SESSION_KILL: 'session:kill',
  SESSION_LIST: 'session:list',
  HISTORY_LIST: 'history:list',
  HISTORY_GET_MESSAGES: 'history:get-messages',
  HISTORY_DELETE: 'history:delete',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
}

contextBridge.exposeInMainWorld('api', {
  spawnSession: (options) => ipcRenderer.invoke(ch.SESSION_SPAWN, options),
  killSession: (id) => ipcRenderer.invoke(ch.SESSION_KILL, id),
  listSessions: () => ipcRenderer.invoke(ch.SESSION_LIST),
  listHistory: () => ipcRenderer.invoke(ch.HISTORY_LIST),
  getHistoryMessages: (sessionId) => ipcRenderer.invoke(ch.HISTORY_GET_MESSAGES, sessionId),
  deleteHistory: (filename) => ipcRenderer.invoke(ch.HISTORY_DELETE, filename),

  ptyWrite: (id, data) => ipcRenderer.send(ch.PTY_WRITE, id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.send(ch.PTY_RESIZE, id, cols, rows),

  onPtyData: (callback) => {
    const handler = (event, id, data) => callback(id, data)
    ipcRenderer.on(ch.PTY_DATA, handler)
    return () => ipcRenderer.removeListener(ch.PTY_DATA, handler)
  },
  onPtyExit: (callback) => {
    const handler = (event, id, exitCode) => callback(id, exitCode)
    ipcRenderer.on(ch.PTY_EXIT, handler)
    return () => ipcRenderer.removeListener(ch.PTY_EXIT, handler)
  },

  platform: process.platform,
  defaultCwd: process.env.HOME + '/project/claude-code-gui',
})
