# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
nvm use                    # Switch to Node 22
npm install               # Install dependencies
npx @electron/rebuild     # Rebuild node-pty for Electron (run once after install)
npm run dev               # Start in development mode with DevTools open (port 9333)
npm start                 # Start in production mode
```

## Architecture

This is a **pure JavaScript Electron application** that provides a graphical desktop client for the Claude Code CLI, with multi-session management.

### Process Architecture (Electron)
- **Main Process**: [`src/main/index.js`](src/main/index.js) - Creates BrowserWindow, registers IPC handlers, manages app lifecycle
- **Preload**: [`preload.js`](preload.js) - Uses `contextBridge` to expose a limited API to the renderer
- **Renderer Process**: [`index.html`](index.html) + [`src/renderer/app.js`](src/renderer/app.js) - UI layer, handles user interaction and terminal rendering
- **No build step** - all JS/CSS runs directly as-is, keeping development simple

### Core Components

**Main Process:**
- [`src/main/pty.js`](src/main/pty.js) - Manages all PTY sessions via `node-pty`. Each Claude Code CLI runs in its own PTY. Provides: `spawnSession`, `killSession`, `writeSession`, `resizeSession`.
- IPC handlers for: session spawning/killing, history discovery, history loading, history deletion
- Automatically reads Claude Code session data from `~/.claude/sessions/` and enriches from `~/.claude/projects/`

**Renderer Process:**
- Uses `xterm.js` (loaded from CDN in index.html) for terminal rendering
- Manual terminal fitting (no addon required) calculates cols/rows based on container size
- State management: `sessions` Map stores terminal instances + metadata
- UI: top tab bar for switching, left sidebar for active/history sessions, main terminal area

**Shared:**
- [`src/shared/channels.js`](src/shared/channels.js) - IPC channel name constants

### Key Design Principles
- **Minimal dependencies**: Only Electron, xterm.js, node-pty - no frontend framework
- **Pure JavaScript**: No TypeScript, no transpiler, directly editable
- **macOS native first**: Uses `vibrancy`, `titleBarStyle: hiddenInset`, Catppuccin dark theme

### Data Flow
```
Renderer (user input) → contextBridge → ipcRenderer → ipcMain → node-pty → Claude Code CLI
Claude Code CLI → node-pty (onData) → ipcMain (send) → ipcRenderer (on) → xterm.js (write)
```

### IPC Pattern
- Handle/invoke pattern for async requests (spawn, list, kill)
- Send/on pattern for streaming PTY data and events
- All communication goes through the preload contextBridge for security (contextIsolation enabled)

## Project Structure
```
├── index.html              # Main HTML with CSS styles, loads xterm.js
├── preload.js              # Electron preload - contextBridge API exposure
├── package.json
├── src/
│   ├── main/
│   │   ├── index.js        # Main entry, IPC handlers registration
│   │   └── pty.js          # PTY session management
│   ├── renderer/
│   │   └── app.js          # Renderer logic, xterm integration, UI
│   └── shared/
│       └── channels.js     # IPC channel names
```

## Technology Stack
- Electron 28
- xterm.js 6 (terminal rendering)
- node-pty 1 (pseudoterminal)
- Vanilla JavaScript (no framework)
- Native HTML/CSS for styling
