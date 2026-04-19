function createTimerService({ runtime, store, dateUtils, Notification, getMainWindow, getFloatWindow }) {
  function getCurrentActiveSeconds() {
    if (!runtime.activeAppId || runtime.timerStartedAtMs == null) return runtime.activeSeconds;
    const elapsed = Math.max(0, Math.floor((Date.now() - runtime.timerStartedAtMs) / 1000));
    return runtime.timerBaseSeconds + elapsed;
  }

  function sendFloatUpdate(payload) {
    const floatWindow = getFloatWindow();
    if (!floatWindow || floatWindow.isDestroyed()) return;
    floatWindow.webContents.send('float-update', payload);
  }

  function sendMainEvent(channel, payload) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
  }

  function persistActiveSeconds() {
    if (!runtime.activeAppId) return;
    const currentData = store.loadData();
    const trackedApp = currentData.apps.find((appEntry) => appEntry.id === runtime.activeAppId);
    if (!trackedApp) return;
    trackedApp.todaySeconds = runtime.activeSeconds;
    store.saveData(currentData);
  }

  function runTimerLoop() {
    clearInterval(runtime.timerInterval);
    runtime.timerInterval = setInterval(() => {
      runtime.activeSeconds = getCurrentActiveSeconds();

      sendMainEvent('timer-tick', {
        appId: runtime.activeAppId,
        seconds: runtime.activeSeconds
      });

      const floatWindow = getFloatWindow();
      if (runtime.floatEnabled && floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible()) {
        sendFloatUpdate({
          seconds: runtime.activeSeconds,
          paused: runtime.timerPaused
        });
      }

      persistActiveSeconds();

      const limitData = store.loadData();
      const limit = limitData.limits[runtime.activeAppId];
      if (limit && limit.enabled && runtime.activeSeconds === limit.minutes * 60) {
        const limitApp = limitData.apps.find((appEntry) => appEntry.id === runtime.activeAppId);
        if (limitApp) {
          new Notification({
            title: 'AppWatch - Limit Reached',
            body: `You have used ${limitApp.name} for ${limit.minutes} minutes today!`
          }).show();
          sendMainEvent('limit-alert', {
            appId: runtime.activeAppId,
            name: limitApp.name,
            minutes: limit.minutes
          });
        }
      }
    }, 1000);
  }

  function startTimer(appId, currentSeconds) {
    if (runtime.activeAppId && runtime.activeAppId !== appId) {
      stopTimer(false);
    } else {
      clearInterval(runtime.timerInterval);
      runtime.timerInterval = null;
    }

    const data = store.loadData();
    const tracked = (data.apps || []).find((appEntry) => appEntry.id === appId);
    const diskSeconds = Number(tracked && tracked.todaySeconds) || 0;
    const requestedSeconds = Number.isFinite(Number(currentSeconds)) ? Number(currentSeconds) : 0;
    const baseSeconds = Math.max(diskSeconds, requestedSeconds);

    runtime.activeAppId = appId;
    runtime.activeSeconds = baseSeconds;
    runtime.activeAppMeta = tracked ? { icon: tracked.icon, name: tracked.name } : null;
    runtime.timerBaseSeconds = runtime.activeSeconds;
    runtime.timerStartedAtMs = Date.now();
    runtime.timerPaused = false;

    runTimerLoop();

    sendMainEvent('timer-resumed', {
      appId: runtime.activeAppId,
      seconds: runtime.activeSeconds
    });

    sendFloatUpdate({
      icon: runtime.activeAppMeta && runtime.activeAppMeta.icon,
      name: runtime.activeAppMeta && runtime.activeAppMeta.name,
      seconds: runtime.activeSeconds,
      paused: false
    });
  }

  function pauseTimer() {
    if (!runtime.activeAppId || runtime.timerPaused) return;
    clearInterval(runtime.timerInterval);
    runtime.timerInterval = null;
    runtime.activeSeconds = getCurrentActiveSeconds();
    runtime.timerStartedAtMs = null;
    runtime.timerBaseSeconds = runtime.activeSeconds;
    runtime.timerPaused = true;
    persistActiveSeconds();

    sendMainEvent('timer-paused', {
      appId: runtime.activeAppId,
      seconds: runtime.activeSeconds
    });

    sendFloatUpdate({
      icon: runtime.activeAppMeta && runtime.activeAppMeta.icon,
      name: runtime.activeAppMeta && runtime.activeAppMeta.name,
      seconds: runtime.activeSeconds,
      paused: true
    });
  }

  function resumeTimer() {
    if (!runtime.activeAppId || !runtime.timerPaused) return;
    runtime.timerBaseSeconds = runtime.activeSeconds;
    runtime.timerStartedAtMs = Date.now();
    runtime.timerPaused = false;
    runTimerLoop();

    sendMainEvent('timer-resumed', {
      appId: runtime.activeAppId,
      seconds: runtime.activeSeconds
    });

    sendFloatUpdate({
      icon: runtime.activeAppMeta && runtime.activeAppMeta.icon,
      name: runtime.activeAppMeta && runtime.activeAppMeta.name,
      seconds: runtime.activeSeconds,
      paused: false
    });
  }

  function stopTimer(logHistory = true) {
    if (!runtime.activeAppId) return;

    clearInterval(runtime.timerInterval);
    runtime.timerInterval = null;
    runtime.activeSeconds = getCurrentActiveSeconds();

    if (logHistory) {
      const data = store.loadData();
      const trackingApp = data.apps.find((appEntry) => appEntry.id === runtime.activeAppId);
      if (trackingApp && runtime.activeSeconds > 0) {
        trackingApp.todaySeconds = Math.max(Number(trackingApp.todaySeconds) || 0, runtime.activeSeconds);
        const todayKey = dateUtils.isoDateKey();
        if (!data.dailyLog) data.dailyLog = {};
        if (!data.dailyLog[todayKey]) data.dailyLog[todayKey] = {};
        const prevDaily = data.dailyLog[todayKey][runtime.activeAppId] || {
          name: trackingApp.name,
          icon: trackingApp.icon,
          seconds: 0
        };
        data.dailyLog[todayKey][runtime.activeAppId] = {
          name: trackingApp.name,
          icon: trackingApp.icon,
          seconds: Math.max(Number(prevDaily.seconds) || 0, runtime.activeSeconds)
        };
        data.history.unshift({
          appId: runtime.activeAppId,
          appName: trackingApp.name,
          appIcon: trackingApp.icon,
          seconds: runtime.activeSeconds,
          date: new Date().toLocaleDateString(),
          timestamp: Date.now()
        });
        if (data.history.length > 200) data.history.length = 200;
        store.saveData(data);
      }
    } else {
      persistActiveSeconds();
    }

    sendMainEvent('timer-stopped', { appId: runtime.activeAppId });
    sendFloatUpdate({ seconds: runtime.activeSeconds, paused: true });

    runtime.activeAppId = null;
    runtime.activeSeconds = 0;
    runtime.activeAppMeta = null;
    runtime.timerPaused = false;
    runtime.timerStartedAtMs = null;
    runtime.timerBaseSeconds = 0;
  }

  return {
    getCurrentActiveSeconds,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer
  };
}

module.exports = { createTimerService };
