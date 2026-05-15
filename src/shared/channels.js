// IPC channel names - shared between main and renderer
module.exports = {
  // Session management
  SESSION_SPAWN: 'session:spawn',
  SESSION_KILL: 'session:kill',
  SESSION_LIST: 'session:list',
  // History discovery
  HISTORY_LIST: 'history:list',
  HISTORY_GET_MESSAGES: 'history:get-messages',
  HISTORY_DELETE: 'history:delete',
  // PTY data flow
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  // Provider configuration
  PROVIDER_LOAD: 'provider:load',
  PROVIDER_SAVE: 'provider:save',
  PROVIDER_GET_CURRENT: 'provider:get-current',
}
