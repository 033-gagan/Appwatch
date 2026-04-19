const { app, ipcMain, Notification, Tray, Menu, nativeImage, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc/registerIpc');
const { createRuntime } = require('./runtime');
const { createAutoLaunchService } = require('./services/autoLaunchService');
const { createDailyLogService } = require('./services/dailyLogService');
const { createDataStore } = require('./services/dataStore');
const { createTimerService } = require('./services/timerService');
const dateUtils = require('./utils/date');
const { createTrayManager } = require('./ui/tray');
const { createWindowManager } = require('./ui/windows');

try {
  app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('temp'), 'AppWatchCache'));
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (_) {}

const runtime = createRuntime();
const srcDir = path.join(__dirname, '..');

const store = createDataStore({ app, fs, path, dateUtils });
const windows = createWindowManager({
  BrowserWindow,
  screen,
  path,
  fs,
  runtime,
  srcDir
});
const autoLaunchService = createAutoLaunchService({ app });
const dailyLogService = createDailyLogService({
  runtime,
  store,
  dateUtils,
  getMainWindow: () => runtime.mainWindow
});
const timerService = createTimerService({
  runtime,
  store,
  dateUtils,
  Notification,
  getMainWindow: () => runtime.mainWindow,
  getFloatWindow: () => runtime.floatWindow
});
dailyLogService.setTimerApi(timerService);

const trayManager = createTrayManager({
  Tray,
  Menu,
  nativeImage,
  runtime,
  actions: {
    showMainWindow: () => windows.showMainWindow(),
    toggleFloat: () => {
      runtime.floatEnabled = !runtime.floatEnabled;
      if (runtime.floatEnabled) windows.showFloatWindow();
      else windows.hideFloatWindow();
      trayManager.refreshTrayMenu();
    },
    quit: () => {
      runtime.isQuitting = true;
      timerService.stopTimer(true);
      app.quit();
    }
  }
});

registerIpc({
  ipcMain,
  runtime,
  store,
  timerService,
  dailyLogService,
  autoLaunchService,
  windows,
  Notification,
  dateUtils
});

app.whenReady().then(() => {
  const data = store.loadData();
  let needsSave = false;

  if (dailyLogService.backfillDailyLogFromHistory(data)) needsSave = true;
  if (dailyLogService.normalizeStoredDates(data)) needsSave = true;

  if (needsSave) store.saveData(data);

  windows.createMainWindow();
  windows.createFloatWindow();
  trayManager.createTray();
});

setInterval(() => dailyLogService.checkMidnightReset(), 60000);

app.on('window-all-closed', (event) => event.preventDefault());
app.on('activate', () => {
  if (!runtime.mainWindow) windows.createMainWindow();
});
app.on('before-quit', () => {
  runtime.isQuitting = true;
  timerService.stopTimer(true);
});
