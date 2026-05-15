const pty = require('node-pty')
const path = require('path')
const os = require('os')
const providerConfig = require('./provider-config')

const sessions = new Map()

function spawnSession(id, options = {}) {
  const cwd = options.cwd || os.homedir()
  const model = options.model || ''
  const resume = options.resume || ''

  // 日志输出
  if (resume) {
    console.log(`[SESSION ${id}] 恢复会话: ${resume}`)
    console.log(`[SESSION ${id}] 工作目录: ${cwd}`)
  }

  const shell = process.env.SHELL || '/bin/zsh'
  const env = { ...process.env }

  // Inject provider environment variables
  const providerEnv = providerConfig.getCurrentEnv()
  Object.assign(env, providerEnv)

  // If no model specified in options, use current default from config
  const effectiveModel = model || providerConfig.getCurrentModel()

  // 构建命令：先 cd 到目录，然后运行 claude
  let commandParts = []
  if (cwd) {
    // 转义目录路径中的空格和特殊字符
    const escapedCwd = cwd.replace(/(["'$`\\])/g, '\\$1')
    commandParts.push(`cd "${escapedCwd}"`)
  }

  let claudeCmd = 'claude'
  if (effectiveModel) claudeCmd += ` --model ${effectiveModel}`
  if (resume) claudeCmd += ` --resume ${resume}`
  commandParts.push(claudeCmd)

  const fullCommand = commandParts.join(' && ')

  // 生成 shell 并执行命令
  const ptyProcess = pty.spawn(shell, ['-c', fullCommand], {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd: os.homedir(), // 初始从 home 开始，然后 cd 到目标目录
    env,
  })

  const session = {
    id,
    pid: ptyProcess.pid,
    pty: ptyProcess,
    cwd,
    model: effectiveModel || 'sonnet',
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
