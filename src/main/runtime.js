function createRuntime() {
  return {
    mainWindow: null,
    floatWindow: null,
    tray: null,
    isQuitting: false,
    activeAppId: null,
    activeSeconds: 0,
    activeAppMeta: null,
    timerInterval: null,
    timerPaused: false,
    floatEnabled: false,
    timerStartedAtMs: null,
    timerBaseSeconds: 0
  };
}

module.exports = { createRuntime };
