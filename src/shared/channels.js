// IPC channel names - shared between main and renderer
module.exports = {
  // Session management
  SESSION_SPAWN: 'session:spawn',
  SESSION_KILL: 'session:kill',
  SESSION_LIST: 'session:list',
  // History discovery
  HISTORY_LIST: 'history:list',
  // PTY data flow
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
}
