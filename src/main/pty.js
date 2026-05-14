const pty = require('node-pty')
const path = require('path')
const os = require('os')

const sessions = new Map()

function spawnSession(id, options = {}) {
  const cwd = options.cwd || os.homedir()
  const model = options.model || ''
  const resume = options.resume || ''

  let args = []
  if (model) args.push('--model', model)
  if (resume) args.push('--resume', resume)

  const shell = process.env.SHELL || '/bin/zsh'
  const env = { ...process.env }

  // If claude command exists, use it; otherwise fall back to shell
  const command = 'claude'
  const finalArgs = args.length > 0 ? args : []

  let ptyProcess
  try {
    ptyProcess = pty.spawn(command, finalArgs, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    })
  } catch {
    // Fallback to shell if claude not found
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    })
  }

  const session = {
    id,
    pid: ptyProcess.pid,
    pty: ptyProcess,
    cwd,
    model: model || 'sonnet',
    createdAt: Date.now(),
  }

  sessions.set(id, session)
  return session
}

function getSession(id) {
  return sessions.get(id)
}

function killSession(id) {
  const session = sessions.get(id)
  if (!session) return false
  session.pty.kill()
  sessions.delete(id)
  return true
}

function listSessions() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    pid: s.pid,
    cwd: s.cwd,
    model: s.model,
    createdAt: s.createdAt,
    running: s.pty._writable,
  }))
}

function writeSession(id, data) {
  const session = sessions.get(id)
  if (!session) return false
  session.pty.write(data)
  return true
}

function resizeSession(id, cols, rows) {
  const session = sessions.get(id)
  if (!session) return false
  session.pty.resize(cols, rows)
  return true
}

module.exports = {
  spawnSession,
  getSession,
  killSession,
  listSessions,
  writeSession,
  resizeSession,
}
