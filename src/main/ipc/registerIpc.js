function registerIpc({
  ipcMain,
  runtime,
  store,
  timerService,
  dailyLogService,
  autoLaunchService,
  windows,
  Notification,
  dateUtils
}) {
  function sendFloatState() {
    const floatWindow = runtime.floatWindow;
    if (!floatWindow || floatWindow.isDestroyed()) return;

    if (runtime.activeAppId) {
      const data = store.loadData();
      const trackingApp = data.apps.find((appEntry) => appEntry.id === runtime.activeAppId);
      if (trackingApp) {
        floatWindow.webContents.send('float-init', {
          icon: trackingApp.icon,
          name: trackingApp.name,
          seconds: timerService.getCurrentActiveSeconds(),
          paused: runtime.timerPaused
        });
      }
    } else {
      floatWindow.webContents.send('float-update', { seconds: 0, paused: true });
    }
  }

  ipcMain.handle('load-data', () => store.loadData());

  ipcMain.handle('save-data', (_, data) => {
    const merged = store.mergeForSafeSave(store.loadData(), data);
    store.saveData(merged);
    return true;
  });

  ipcMain.handle('stop-tracking', () => {
    timerService.stopTimer(true);
    return store.loadData();
  });

  ipcMain.handle('reset-app-time', (_, appId) => {
    if (runtime.activeAppId === appId && runtime.timerInterval) {
      timerService.stopTimer(false);
    }

    const data = store.loadData();
    const target = data.apps.find((appEntry) => appEntry.id === appId);
    if (target) target.todaySeconds = 0;
    const todayKey = dateUtils.isoDateKey();
    if (!data._resetMarkers || typeof data._resetMarkers !== 'object') data._resetMarkers = {};
    if (!data._resetMarkers[todayKey] || typeof data._resetMarkers[todayKey] !== 'object') data._resetMarkers[todayKey] = {};
    data._resetMarkers[todayKey][appId] = Date.now();
    store.saveData(data);
    return data;
  });

  ipcMain.handle('reset-all-times', () => {
    if (runtime.timerInterval) {
      timerService.stopTimer(false);
    }

    const data = store.loadData();
    data.apps.forEach((appEntry) => {
      appEntry.todaySeconds = 0;
    });
    const todayKey = dateUtils.isoDateKey();
    if (!data._resetMarkers || typeof data._resetMarkers !== 'object') data._resetMarkers = {};
    if (!data._resetMarkers[todayKey] || typeof data._resetMarkers[todayKey] !== 'object') data._resetMarkers[todayKey] = {};
    data.apps.forEach((appEntry) => {
      data._resetMarkers[todayKey][appEntry.id] = Date.now();
    });
    store.saveData(data);
    return data;
  });

  ipcMain.handle('remove-app', (_, appId) => {
    if (!appId) return store.loadData();

    if (runtime.activeAppId === appId && runtime.timerInterval) {
      timerService.stopTimer(false);
    }

    const data = store.loadData();
    data.apps = (data.apps || []).filter((appEntry) => appEntry.id !== appId);
    if (data.limits && typeof data.limits === 'object') {
      delete data.limits[appId];
    }
    data.history = (data.history || []).filter((entry) => entry.appId !== appId);
    store.saveData(data);
    return data;
  });

  ipcMain.on('start-tracking', (_, { appId, currentSeconds, icon, name }) => {
    timerService.startTimer(appId, currentSeconds);
    if (runtime.floatEnabled && runtime.floatWindow && !runtime.floatWindow.isDestroyed()) {
      windows.showFloatWindow();
      runtime.floatWindow.webContents.send('float-init', {
        icon,
        name,
        seconds: timerService.getCurrentActiveSeconds(),
        paused: false
      });
    }
  });

  ipcMain.on('stop-tracking', () => timerService.stopTimer(true));
  ipcMain.on('float-stop-tracking', () => timerService.stopTimer(true));
  ipcMain.on('float-toggle-pause', () => {
    if (!runtime.activeAppId) return;
    if (runtime.timerPaused) timerService.resumeTimer();
    else timerService.pauseTimer();
  });

  ipcMain.on('float-toggle', (_, enabled) => {
    runtime.floatEnabled = enabled;
    if (!runtime.floatWindow) return;
    if (runtime.floatEnabled) {
      windows.showFloatWindow();
      sendFloatState();
    } else {
      windows.hideFloatWindow();
    }
  });

  ipcMain.on('float-hide', () => {
    windows.hideFloatWindow();
    runtime.floatEnabled = false;
    if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
      runtime.mainWindow.webContents.send('float-hidden');
    }
  });

  ipcMain.handle('get-timer-state', () => ({
    activeAppId: runtime.activeAppId,
    activeSeconds: timerService.getCurrentActiveSeconds(),
    timerPaused: runtime.timerPaused,
    floatEnabled: runtime.floatEnabled
  }));

  ipcMain.handle('send-notification', (_, { title, body }) => {
    new Notification({ title, body }).show();
  });

  ipcMain.on('float-open-main', () => {
    if (runtime.mainWindow) windows.focusMainWindow();
    else windows.createMainWindow();
  });

  ipcMain.on('float-move-delta', (_, { dx, dy }) => {
    if (!runtime.floatWindow) return;
    const [currentX, currentY] = runtime.floatWindow.getPosition();
    runtime.floatWindow.setPosition(currentX + Math.round(dx), currentY + Math.round(dy));
  });

  ipcMain.on('window-minimize', () => {
    if (runtime.mainWindow) runtime.mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (!runtime.mainWindow) return;
    if (runtime.mainWindow.isMaximized()) runtime.mainWindow.unmaximize();
    else runtime.mainWindow.maximize();
  });

  ipcMain.on('window-close', () => windows.hideMainWindow());

  ipcMain.handle('get-auto-launch', () => autoLaunchService.getAutoLaunch());
  ipcMain.handle('set-auto-launch', (_, enable) => {
    autoLaunchService.setAutoLaunch(enable);
    return autoLaunchService.getAutoLaunch();
  });

  ipcMain.handle('get-daily-log', () => {
    const data = store.loadData();
    if (!data.dailyLog) data.dailyLog = {};
    if (dailyLogService.backfillDailyLogFromHistory(data)) store.saveData(data);
    return dailyLogService.buildMergedDailyLog(data);
  });

  ipcMain.handle('save-daily-snapshot', () => {
    if (runtime.activeAppId) {
      const data = store.loadData();
      const appEntry = data.apps.find((item) => item.id === runtime.activeAppId);
      if (appEntry) {
        appEntry.todaySeconds = timerService.getCurrentActiveSeconds();
        store.saveData(data);
      }
    }
    return true;
  });
}

module.exports = { registerIpc };
