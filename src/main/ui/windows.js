function createWindowManager({ BrowserWindow, screen, path, fs, runtime, srcDir }) {
  function resolveWindowIcon() {
    const pngIcon = path.join(srcDir, '..', 'assets', 'icon.png');
    const icoIcon = path.join(srcDir, '..', 'assets', 'icon.ico');
    if (fs.existsSync(pngIcon)) return pngIcon;
    if (fs.existsSync(icoIcon)) return icoIcon;
    return undefined;
  }

  function createMainWindow() {
    runtime.mainWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      transparent: false,
      backgroundColor: '#0d0d0f',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
      icon: resolveWindowIcon(),
      show: false
    });

    runtime.mainWindow.loadFile(path.join(srcDir, 'index.html'));
    runtime.mainWindow.once('ready-to-show', () => runtime.mainWindow.show());
    runtime.mainWindow.on('close', (event) => {
      if (runtime.isQuitting) return;
      event.preventDefault();
      runtime.mainWindow.hide();
    });
    runtime.mainWindow.on('closed', () => {
      runtime.mainWindow = null;
    });

    return runtime.mainWindow;
  }

  function createFloatWindow() {
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    runtime.floatWindow = new BrowserWindow({
      width: 180,
      height: 80,
      x: width - 200,
      y: 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    runtime.floatWindow.loadFile(path.join(srcDir, 'float.html'));
    runtime.floatWindow.hide();
    runtime.floatWindow.on('closed', () => {
      runtime.floatWindow = null;
    });

    return runtime.floatWindow;
  }

  function showMainWindow() {
    if (runtime.mainWindow) runtime.mainWindow.show();
  }

  function focusMainWindow() {
    if (runtime.mainWindow) {
      runtime.mainWindow.show();
      runtime.mainWindow.focus();
    }
  }

  function hideMainWindow() {
    if (runtime.mainWindow) runtime.mainWindow.hide();
  }

  function showFloatWindow() {
    if (runtime.floatWindow) runtime.floatWindow.show();
  }

  function hideFloatWindow() {
    if (runtime.floatWindow) runtime.floatWindow.hide();
  }

  return {
    createFloatWindow,
    createMainWindow,
    focusMainWindow,
    hideFloatWindow,
    hideMainWindow,
    showFloatWindow,
    showMainWindow
  };
}

module.exports = { createWindowManager };
