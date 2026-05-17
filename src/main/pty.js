const pty = require('node-pty')
const path = require('path')
const fs = require('fs')
const os = require('os')
const providerConfig = require('./provider-config')

const sessions = new Map()

function findClaudePath() {
  // 尝试常见安装路径
  const candidates = [
    // nvm 路径
    ...(process.env.NVM_DIR ? [
      path.join(process.env.NVM_DIR, 'versions', 'node', process.version, 'bin', 'claude'),
      path.join(process.env.NVM_DIR, 'versions', 'node', '*', 'bin', 'claude'),
    ] : []),
    // 常见的 node 全局 bin 路径
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
    path.join(os.homedir(), 'node_modules', '.bin', 'claude'),
  ]

  for (const candidate of candidates) {
    if (candidate.includes('*')) continue // skip glob, use shell resolve
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

// 缓存 claude 路径
let cachedClaudePath = null

function getClaudePath() {
  if (cachedClaudePath) return cachedClaudePath

  // 1. 优先从 PATH 找
  try {
    const result = require('child_process').execSync('command -v claude', { encoding: 'utf8', shell: '/bin/zsh' }).trim()
    if (result && fs.existsSync(result)) {
      cachedClaudePath = result
      return result
    }
  } catch (e) { /* not found in PATH */ }

  // 2. 从常见路径找
  const found = findClaudePath()
  if (found) {
    cachedClaudePath = found
    return found
  }

  // 3. 最后尝试通过 nvm 加载
  try {
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm')
    const result = require('child_process').execSync(
      `export NVM_DIR="${nvmDir}" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && command -v claude`,
      { encoding: 'utf8', shell: '/bin/zsh' }
    ).trim()
    if (result && fs.existsSync(result)) {
      cachedClaudePath = result
      return result
    }
  } catch (e) { /* nvm resolve failed */ }

  // 4. 保底：直接返回 claude，让 shell 自己处理
  return 'claude'
}

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

  // 确保工作目录存在
  const targetCwd = cwd || os.homedir()
  try {
    if (!fs.existsSync(targetCwd)) {
      fs.mkdirSync(targetCwd, { recursive: true })
      console.log(`[SESSION ${id}] 创建目录: ${targetCwd}`)
    }
  } catch (e) {
    console.error(`[SESSION ${id}] 无法创建目录 ${targetCwd}:`, e.message)
  }

  // 构建命令：先 cd 到目录，然后运行 claude
  let commandParts = []
  if (cwd) {
    // 转义目录路径中的空格和特殊字符
    const escapedCwd = cwd.replace(/(["'$`\\])/g, '\\$1')
    commandParts.push(`cd "${escapedCwd}"`)
  }

  let claudeCmd = getClaudePath()
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
