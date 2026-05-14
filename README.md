# Claude Code GUI

一个 macOS 原生风格的 Claude Code 桌面客户端，为 Claude Code CLI 提供图形化多会话管理界面。

## ✅ 已实现功能

### 多会话管理
- 基于 **node-pty** 启动独立的 Claude Code 进程，每个会话拥有独立 PTY
- 顶部标签栏快速切换会话，支持关闭单个会话
- 左侧侧边栏展示会话列表，每个会话显示工作目录和模型
- 点击侧边栏会话可快速切换
- 支持 "New Session" / "New Tab" 两种方式创建会话

### 终端交互
- 基于 **xterm.js** 的全功能终端渲染，支持 256 色和 ANSI 转义序列
- 手动适配窗口大小（无需第三方 addon），窗口 resize 自动更新 PTY 尺寸
- 完整支持交互式输入（光标、退格、方向键等）
- 会话切换时保留终端回滚历史

### macOS 原生体验
- 隐藏标题栏 + 原生拖动区域
- 毛玻璃侧边栏效果 (`vibrancy: sidebar`)
- Catppuccin macOS 深色主题
- SF Mono 优先等宽字体渲染终端

## 📋 待实现功能

- [ ] 自动发现 `~/.claude/sessions/` 下的历史会话
- [ ] 工具栏模型选择器（切换 opus/sonnet/haiku）
- [ ] 命令面板 (`Cmd+Shift+P`)
- [ ] 配置面板（可视化编辑 `~/.claude/settings.json`）
- [ ] 浅色主题跟随系统切换

## 安装与运行

### 前置要求
- Node 22 LTS（通过 nvm 自动切换）
- 已安装 Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### 步骤

```bash
# 切换到 Node 22
nvm use

# 安装依赖
npm install

# 重编译 node-pty 适配 Electron（只需要做一次）
npx @electron/rebuild

# 启动应用
npm start
```

## 项目结构

```
claude-code-gui/
├── index.html              # 主页面（加载 CSS + xterm.js + renderer JS）
├── preload.js              # Electron preload 脚本（contextBridge 暴露 API）
├── package.json
├── .nvmrc                  # nvm Node 版本指定
├── .node-version
├── src/
│   ├── main/
│   │   ├── index.js        # Electron 主进程入口，IPC handlers 注册
│   │   └── pty.js          # node-pty 会话管理 (spawn/kill/write/resize)
│   ├── renderer/
│   │   └── app.js          # 渲染进程逻辑，xterm.js 集成，UI 交互
│   └── shared/
│       └── channels.js     # IPC 通道名称（当前内联也不影响，保留结构）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 28 |
| 终端 | xterm.js 6 |
| 伪终端 | node-pty 1 |
| 语言 | 纯 JavaScript（无构建工具，最小化依赖） |
| UI | 原生 HTML/CSS + 手动 DOM 操作 |

## 设计原则

- **最小化依赖**：只保留核心依赖，避免引入大型框架
- **原生优先**：使用 Electron 原生 macOS 特性，体验一致
- **纯 JS 开发**：无需编译，直接运行，易于修改

## 调试

应用启动时自动打开 DevTools，并监听 `9333` 端口供远程调试：

```bash
# DevTools 访问：http://127.0.0.1:9333
# 选择 "Claude Code GUI" 打开检查器
```

## 许可证

MIT
