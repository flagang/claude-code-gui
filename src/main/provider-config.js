const fs = require('fs')
const path = require('path')
const os = require('os')

// 配置文件路径: ~/.claude/claude-code-gui/settings.json
function getConfigPath() {
  return path.join(os.homedir(), '.claude', 'claude-code-gui', 'settings.json')
}

// 确保配置目录存在
function ensureConfigDir() {
  const configDir = path.dirname(getConfigPath())
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

// 生成唯一 ID
function generateId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// 创建默认配置
function createDefaultConfig() {
  const defaultApiKey = process.env.ANTHROPIC_AUTH_TOKEN || ''
  const defaultBaseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

  return {
    providers: [
      {
        id: 'default-anthropic',
        name: 'Anthropic',
        apiKey: defaultApiKey,
        baseUrl: defaultBaseUrl,
        defaultModel: 'claude-3-5-sonnet-latest',
        models: [
          'claude-3-5-sonnet-latest',
          'claude-3-opus-latest',
          'claude-3-haiku-latest',
        ],
      },
    ],
    currentProviderId: 'default-anthropic',
    currentModel: 'claude-3-5-sonnet-latest',
  }
}

// 加载配置
function loadConfig() {
  ensureConfigDir()
  const configPath = getConfigPath()

  if (!fs.existsSync(configPath)) {
    const defaultConfig = createDefaultConfig()
    saveConfig(defaultConfig)
    return defaultConfig
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    console.error('Failed to parse config, using default:', e)
    const defaultConfig = createDefaultConfig()
    saveConfig(defaultConfig)
    return defaultConfig
  }
}

// 保存配置
function saveConfig(config) {
  ensureConfigDir()
  const configPath = getConfigPath()
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error('Failed to save config:', e)
    return false
  }
}

// 获取当前激活的供应商
function getCurrentProvider() {
  const config = loadConfig()
  return config.providers.find(p => p.id === config.currentProviderId) || config.providers[0]
}

// 获取当前激活的模型
function getCurrentModel() {
  const config = loadConfig()
  const provider = getCurrentProvider()
  if (!provider) return config.currentModel || 'claude-3-5-sonnet-latest'
  // 如果当前模型不在供应商的列表中，使用供应商的默认模型
  if (!provider.models.includes(config.currentModel)) {
    return provider.defaultModel
  }
  return config.currentModel
}

// 获取当前供应商的环境变量映射
function getCurrentEnv() {
  const provider = getCurrentProvider()
  if (!provider) return {}
  return {
    ANTHROPIC_AUTH_TOKEN: provider.apiKey || '',
    ANTHROPIC_BASE_URL: provider.baseUrl || '',
  }
}

// 验证配置
function validateConfig(config) {
  if (!Array.isArray(config.providers)) {
    return false
  }
  for (const p of config.providers) {
    if (!p.id || typeof p.id !== 'string') return false
    if (!p.name || typeof p.name !== 'string') return false
    if (!Array.isArray(p.models)) return false
  }
  if (!config.currentProviderId) return false
  return true
}

// 获取 Claude Code 原生配置文件路径
function getClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

// 更新 Claude Code 原生 settings.json 中的 env 模型配置
function updateClaudeSettingsEnv() {
  const provider = getCurrentProvider()
  if (!provider || !Array.isArray(provider.models) || provider.models.length === 0) {
    return false
  }

  const claudeSettingsPath = getClaudeSettingsPath()
  let claudeSettings = {}

  // 如果文件存在，读取现有配置
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      const content = fs.readFileSync(claudeSettingsPath, 'utf8')
      claudeSettings = JSON.parse(content)
    } catch (e) {
      console.error('Failed to parse Claude Code settings.json:', e)
      claudeSettings = {}
    }
  }

  // 确保 env 对象存在
  if (!claudeSettings.env || typeof claudeSettings.env !== 'object') {
    claudeSettings.env = {}
  }

  const models = provider.models
  const maxSlots = 5

  // 5个模型槽位，按顺序映射（Opus, Sonnet, Haiku, Custom 1, Custom 2）
  const slotPrefixes = [
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_CUSTOM_MODEL_OPTION',
    'ANTHROPIC_CUSTOM_MODEL_OPTION2',
  ]

  // ANTHROPIC_MODEL 始终设置为第一个模型
  claudeSettings.env['ANTHROPIC_MODEL'] = models[0]

  // 按顺序填充每个槽位，多余的清理
  for (let i = 0; i < maxSlots; i++) {
    const prefix = slotPrefixes[i]
    if (i < models.length) {
      // 有模型则填充
      claudeSettings.env[prefix] = models[i]
      claudeSettings.env[prefix + '_NAME'] = models[i]
      claudeSettings.env[prefix + '_DESCRIPTION'] = models[i]
      // CUSTOM_MODEL_OPTION 额外设置 NAME 字段（Claude Code 需要）
      if (prefix === 'ANTHROPIC_CUSTOM_MODEL_OPTION') {
        claudeSettings.env[prefix + '_NAME'] = models[i]
      }
    } else {
      // 没有模型则清理该槽位所有相关 env 变量
      delete claudeSettings.env[prefix]
      delete claudeSettings.env[prefix + '_NAME']
      delete claudeSettings.env[prefix + '_DESCRIPTION']
    }
  }

  // 把当前供应商的 ANTHROPIC_AUTH_TOKEN 和 ANTHROPIC_BASE_URL 也同步过去
  if (provider.apiKey) {
    claudeSettings.env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
  }
  if (provider.baseUrl) {
    claudeSettings.env.ANTHROPIC_BASE_URL = provider.baseUrl
  }

  // 保存回文件
  try {
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2), 'utf8')
    console.log(`Updated Claude Code settings.json with ${models.length} models`)
    return true
  } catch (e) {
    console.error('Failed to save Claude Code settings.json:', e)
    return false
  }
}

module.exports = {
  getConfigPath,
  loadConfig,
  saveConfig,
  createDefaultConfig,
  getCurrentProvider,
  getCurrentModel,
  getCurrentEnv,
  validateConfig,
  generateId,
  updateClaudeSettingsEnv,
}
