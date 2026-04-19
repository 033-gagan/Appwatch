function createDailyLogService({ runtime, store, dateUtils, getMainWindow }) {
  let timerApi = null;

  function setTimerApi(api) {
    timerApi = api;
  }

  function buildDailyLogFromHistory(data) {
    const out = {};
    if (!data || !Array.isArray(data.history)) return out;

    const appMeta = {};
    (data.apps || []).forEach((appEntry) => {
      if (!appEntry || !appEntry.id) return;
      appMeta[appEntry.id] = { name: appEntry.name, icon: appEntry.icon };
    });

    data.history.forEach((entry) => {
      const dateKey = dateUtils.historyEntryDateKey(entry);
      const appId = entry && entry.appId;
      const secs = Number(entry && entry.seconds);
      if (!dateKey || !appId || !Number.isFinite(secs) || secs <= 0) return;

      if (!out[dateKey]) out[dateKey] = {};
      const meta = appMeta[appId] || {};
      const name = entry.appName || meta.name || 'Unknown App';
      const icon = entry.appIcon || meta.icon || '📱';
      const prevSecs = Number(out[dateKey][appId] && out[dateKey][appId].seconds) || 0;

      if (!out[dateKey][appId] || secs > prevSecs) {
        out[dateKey][appId] = { name, icon, seconds: secs };
      }
    });

    return out;
  }

  function backfillDailyLogFromHistory(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.history) || data.history.length === 0) return false;
    if (!data.dailyLog || typeof data.dailyLog !== 'object') data.dailyLog = {};

    const appMeta = {};
    (data.apps || []).forEach((appEntry) => {
      if (!appEntry || !appEntry.id) return;
      appMeta[appEntry.id] = { name: appEntry.name, icon: appEntry.icon };
    });

    let changed = false;
    data.history.forEach((entry) => {
      const dateKey = dateUtils.historyEntryDateKey(entry);
      const appId = entry && entry.appId;
      const secs = Number(entry && entry.seconds);
      if (!dateKey || !appId || !Number.isFinite(secs) || secs <= 0) return;

      if (!data.dailyLog[dateKey]) {
        data.dailyLog[dateKey] = {};
        changed = true;
      }

      const meta = appMeta[appId] || {};
      const name = entry.appName || meta.name || 'Unknown App';
      const icon = entry.appIcon || meta.icon || '📱';
      const prev = data.dailyLog[dateKey][appId];
      const prevSecs = Number(prev && prev.seconds) || 0;

      if (!prev || prevSecs < secs || prev.name !== name || prev.icon !== icon) {
        data.dailyLog[dateKey][appId] = { name, icon, seconds: Math.max(prevSecs, secs) };
        changed = true;
      }
    });

    return changed;
  }

  function saveDailySummary(data, dateKey) {
    const summaryKey = dateKey || dateUtils.isoDateKey();
    if (!data.dailyLog) data.dailyLog = {};
    if (!data.dailyLog[summaryKey]) data.dailyLog[summaryKey] = {};

    data.apps.forEach((appEntry) => {
      const secs = runtime.activeAppId === appEntry.id && timerApi
        ? timerApi.getCurrentActiveSeconds()
        : (appEntry.todaySeconds || 0);
      if (secs <= 0) return;
      const prev = data.dailyLog[summaryKey][appEntry.id] || {
        name: appEntry.name,
        icon: appEntry.icon,
        seconds: 0
      };
      data.dailyLog[summaryKey][appEntry.id] = {
        name: appEntry.name,
        icon: appEntry.icon,
        seconds: Math.max(prev.seconds, secs)
      };
    });
  }

  function normalizeStoredDates(data) {
    let changed = false;

    if (data.dailyLog) {
      const oldKeys = Object.keys(data.dailyLog).filter((key) => !/^\d{4}-\d{2}-\d{2}$/.test(key));
      oldKeys.forEach((oldKey) => {
        const isoKey = dateUtils.normalizeDateKey(oldKey);
        if (isoKey && isoKey !== oldKey) {
          if (!data.dailyLog[isoKey]) data.dailyLog[isoKey] = {};
          Object.assign(data.dailyLog[isoKey], data.dailyLog[oldKey]);
          changed = true;
        }
      });
    }

    const normalizedLast = dateUtils.normalizeDateKey(data._lastDate);
    if (normalizedLast && data._lastDate !== normalizedLast) {
      data._lastDate = normalizedLast;
      changed = true;
    }

    return changed;
  }

  function buildMergedDailyLog(data) {
    if (!data.dailyLog) data.dailyLog = {};
    const todayKey = dateUtils.isoDateKey();
    const historyDaily = buildDailyLogFromHistory(data);
    const raw = JSON.parse(JSON.stringify(data.dailyLog));
    const result = {};

    Object.keys(historyDaily).forEach((key) => {
      if (!result[key]) result[key] = {};
      Object.assign(result[key], historyDaily[key]);
    });

    Object.keys(raw).forEach((key) => {
      const isoKey = /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : dateUtils.normalizeDateKey(key);
      if (!isoKey) return;
      if (!result[isoKey]) result[isoKey] = {};
      Object.entries(raw[key] || {}).forEach(([appId, info]) => {
        const existing = result[isoKey][appId];
        const incomingSecs = Number(info && info.seconds) || 0;
        const existingSecs = Number(existing && existing.seconds) || 0;
        if (!existing || incomingSecs > existingSecs) {
          result[isoKey][appId] = info;
        }
      });
    });

    const todaySnap = {};
    data.apps.forEach((appEntry) => {
      const liveSeconds = runtime.activeAppId === appEntry.id && timerApi
        ? timerApi.getCurrentActiveSeconds()
        : (appEntry.todaySeconds || 0);
      if (liveSeconds > 0) {
        todaySnap[appEntry.id] = {
          name: appEntry.name,
          icon: appEntry.icon,
          seconds: liveSeconds
        };
      }
    });

    if (Object.keys(todaySnap).length) result[todayKey] = todaySnap;
    return result;
  }

  function checkMidnightReset() {
    if (!timerApi) return;

    const todayKey = dateUtils.isoDateKey();
    const data = store.loadData();
    let changed = false;
    const lastDate = dateUtils.normalizeDateKey(data._lastDate);

    if (lastDate && lastDate !== todayKey) {
      if (runtime.activeAppId) {
        const liveSeconds = timerApi.getCurrentActiveSeconds();
        const runningApp = data.apps.find((appEntry) => appEntry.id === runtime.activeAppId);
        if (runningApp && liveSeconds > 0) {
          runningApp.todaySeconds = liveSeconds;
        }
      }

      saveDailySummary(data, lastDate);
      data.apps.forEach((appEntry) => {
        appEntry.todaySeconds = 0;
      });
      if (runtime.activeAppId) timerApi.stopTimer(false);

      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('day-rolled-over');
      }

      changed = true;
    }

    if (data._lastDate !== todayKey) {
      data._lastDate = todayKey;
      changed = true;
    }

    if (changed) store.saveData(data);
  }

  return {
    backfillDailyLogFromHistory,
    buildMergedDailyLog,
    checkMidnightReset,
    normalizeStoredDates,
    saveDailySummary,
    setTimerApi
  };
}

module.exports = { createDailyLogService };
