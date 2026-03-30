const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Avoid cache permission errors in restricted locations (e.g., synced folders).
try {
  app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('temp'), 'AppWatchCache'));
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (_) {}

let mainWindow;
let floatWindow;
let tray;
let isQuitting = false;

// ── Timer state lives HERE in main process ────────────────────────────────────
let activeAppId   = null;
let activeSeconds = 0;
let timerInterval = null;
let floatEnabled  = false;
let timerStartedAtMs = null;
let timerBaseSeconds = 0;

const dataFile = path.join(app.getPath('userData'), 'appwatch-data.json');

// ── Data helpers ──────────────────────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (e) {}
  return { apps: [], history: [], limits: {} };
}

function saveData(data) {
  try { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2)); } catch(e) {}
}

function getCurrentActiveSeconds() {
  if (!activeAppId || timerStartedAtMs == null) return activeSeconds;
  const elapsed = Math.max(0, Math.floor((Date.now() - timerStartedAtMs) / 1000));
  return timerBaseSeconds + elapsed;
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer(appId, currentSeconds) {
  stopTimer(false); // stop any existing timer first

  activeAppId   = appId;
  activeSeconds = Number.isFinite(Number(currentSeconds)) ? Number(currentSeconds) : 0;
  timerBaseSeconds = activeSeconds;
  timerStartedAtMs = Date.now();

  timerInterval = setInterval(() => {
    activeSeconds = getCurrentActiveSeconds();

    // Push tick to both windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('timer-tick', { appId: activeAppId, seconds: activeSeconds });
    }
    if (floatEnabled && floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible()) {
      floatWindow.webContents.send('float-update', { seconds: activeSeconds });
    }

    // Save every second to disk — fixes the 30s save bug
    const data = loadData();
    const app = data.apps.find(a => a.id === activeAppId);
    if (app) {
      app.todaySeconds = activeSeconds;
      saveData(data);
    }

    // Check limits
    const data2 = loadData();
    const limit = data2.limits[activeAppId];
    if (limit && limit.enabled && activeSeconds === limit.minutes * 60) {
      const trackingApp = data2.apps.find(a => a.id === activeAppId);
      if (trackingApp) {
        new Notification({
          title: 'AppWatch — Limit Reached',
          body: `You have used ${trackingApp.name} for ${limit.minutes} minutes today!`
        }).show();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('limit-alert', { appId: activeAppId, name: trackingApp.name, minutes: limit.minutes });
        }
      }
    }
  }, 1000);
}

function stopTimer(logHistory = true) {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
  activeSeconds = getCurrentActiveSeconds();

  if (activeAppId && logHistory) {
    const data = loadData();
    const trackingApp = data.apps.find(a => a.id === activeAppId);
    if (trackingApp && activeSeconds > 0) {
      // Save final seconds
      trackingApp.todaySeconds = activeSeconds;
      // Log session
      data.history.unshift({
        appId:   activeAppId,
        appName: trackingApp.name,
        appIcon: trackingApp.icon,
        seconds: activeSeconds,
        date:    new Date().toLocaleDateString(),
        timestamp: Date.now()
      });
      if (data.history.length > 200) data.history.length = 200;
      saveData(data);
    }
  }

  // Tell both windows tracking stopped
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer-stopped', { appId: activeAppId });
  }
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send('float-update', { seconds: activeSeconds, paused: true });
  }

  activeAppId   = null;
  activeSeconds = 0;
  timerStartedAtMs = null;
  timerBaseSeconds = 0;
}

// ── Windows ───────────────────────────────────────────────────────────────────
function createWindow() {
  const pngIcon = path.join(__dirname, '../assets/icon.png');
  const icoIcon = path.join(__dirname, '../assets/icon.ico');
  const windowIcon = fs.existsSync(pngIcon) ? pngIcon : (fs.existsSync(icoIcon) ? icoIcon : undefined);

  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 900, minHeight: 600,
    frame: false, transparent: false, backgroundColor: '#0d0d0f',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    icon: windowIcon,
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createFloatWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  floatWindow = new BrowserWindow({
    width: 180, height: 80,
    x: width - 200, y: 20,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  floatWindow.loadFile(path.join(__dirname, 'float.html'));
  floatWindow.hide();
  floatWindow.on('closed', () => { floatWindow = null; });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('AppWatch');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open AppWatch', click: () => mainWindow && mainWindow.show() },
    { label: 'Toggle Float Widget', click: () => {
      if (!floatWindow) return;
      floatEnabled = !floatEnabled;
      floatEnabled ? floatWindow.show() : floatWindow.hide();
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; stopTimer(); app.quit(); } },
  ]));
  tray.on('click', () => mainWindow && mainWindow.show());
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (_, data) => { saveData(data); return true; });
ipcMain.handle('stop-tracking', () => {
  stopTimer(true);
  return loadData();
});
ipcMain.handle('reset-app-time', (_, appId) => {
  if (activeAppId === appId && timerInterval) {
    // Reset should not create a history session.
    stopTimer(false);
  }
  const data = loadData();
  const target = data.apps.find(a => a.id === appId);
  if (target) target.todaySeconds = 0;
  saveData(data);
  return data;
});
ipcMain.handle('reset-all-times', () => {
  if (timerInterval) {
    // Reset should not create a history session.
    stopTimer(false);
  }
  const data = loadData();
  data.apps.forEach(a => { a.todaySeconds = 0; });
  saveData(data);
  return data;
});
ipcMain.handle('remove-app', (_, appId) => {
  if (!appId) return loadData();

  if (activeAppId === appId && timerInterval) {
    // Removing an app should not create a session entry for that app.
    stopTimer(false);
  }

  const data = loadData();
  data.apps = (data.apps || []).filter(a => a.id !== appId);
  if (data.limits && typeof data.limits === 'object') {
    delete data.limits[appId];
  }
  data.history = (data.history || []).filter(h => h.appId !== appId);
  saveData(data);
  return data;
});

// Renderer asks: start tracking this app
ipcMain.on('start-tracking', (_, { appId, currentSeconds, icon, name }) => {
  startTimer(appId, currentSeconds);
  // Update float with app info
  if (floatEnabled && floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.show();
    floatWindow.webContents.send('float-init', { icon, name, seconds: currentSeconds });
  }
});

// Renderer asks: stop tracking
ipcMain.on('stop-tracking', () => {
  stopTimer(true);
});

// Float widget stop button
ipcMain.on('float-stop-tracking', () => {
  stopTimer(true);
});

// Float toggle from renderer
ipcMain.on('float-toggle', (_, enabled) => {
  floatEnabled = enabled;
  if (!floatWindow) return;
  if (floatEnabled) {
    floatWindow.show();
    // Send current state immediately
    if (activeAppId) {
      const data = loadData();
      const trackingApp = data.apps.find(a => a.id === activeAppId);
      if (trackingApp) {
        floatWindow.webContents.send('float-init', { icon: trackingApp.icon, name: trackingApp.name, seconds: activeSeconds });
      }
    } else {
      floatWindow.webContents.send('float-update', { seconds: 0, paused: true });
    }
  } else {
    floatWindow.hide();
  }
});

ipcMain.on('float-hide', () => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.hide();
    floatEnabled = false;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('float-hidden');
  }
});

// Get current timer state (when main window reopens)
ipcMain.handle('get-timer-state', () => ({
  activeAppId,
  activeSeconds: getCurrentActiveSeconds(),
  floatEnabled
}));

ipcMain.handle('send-notification', (_, { title, body }) => {
  new Notification({ title, body }).show();
});

ipcMain.on('float-open-main', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  else createWindow();
});

ipcMain.on('float-move-delta', (_, { dx, dy }) => {
  if (!floatWindow) return;
  const [cx, cy] = floatWindow.getPosition();
  floatWindow.setPosition(cx + Math.round(dx), cy + Math.round(dy));
});

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.hide());

// Auto-launch
function setAutoLaunch(enable) {
  app.setLoginItemSettings({ openAtLogin: enable, name: 'AppWatch' });
}
function getAutoLaunch() {
  return app.getLoginItemSettings().openAtLogin;
}
ipcMain.handle('get-auto-launch', () => getAutoLaunch());
ipcMain.handle('set-auto-launch', (_, enable) => { setAutoLaunch(enable); return getAutoLaunch(); });

// Midnight reset check
function checkMidnightReset() {
  const today = new Date().toDateString();
  const data = loadData();
  let changed = false;

  if (data._lastDate && data._lastDate !== today) {
    data.apps.forEach(a => { a.todaySeconds = 0; });
    if (activeAppId) { stopTimer(false); }
    changed = true;
  }

  if (data._lastDate !== today) {
    data._lastDate = today;
    changed = true;
  }

  if (changed) saveData(data);
}
setInterval(checkMidnightReset, 60000);

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createFloatWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => { if (!mainWindow) createWindow(); });
app.on('before-quit', () => {
  isQuitting = true;
  stopTimer(true);
});
