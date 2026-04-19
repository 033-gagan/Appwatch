function createDataStore({ app, fs, path, dateUtils }) {
  const dataFile = path.join(app.getPath('userData'), 'appwatch-data.json');
  const legacyDataFile = path.join(app.getPath('userData'), 'appwatchdata.json');

  function readJsonFileSafe(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (_) {}
    return null;
  }

  function rehydrateTodaySeconds(data) {
    if (!data || !Array.isArray(data.apps)) return false;
    const todayKey = dateUtils.isoDateKey();
    const resetMap = ((data._resetMarkers || {})[todayKey]) || {};
    const byApp = {};

    const dayLog = data.dailyLog && data.dailyLog[todayKey];
    if (dayLog && typeof dayLog === 'object') {
      Object.entries(dayLog).forEach(([appId, info]) => {
        if (Number(resetMap[appId]) > 0) return;
        const secs = Number(info && info.seconds) || 0;
        if (!byApp[appId] || secs > byApp[appId]) byApp[appId] = secs;
      });
    }

    (data.history || []).forEach((entry) => {
      const appId = entry && entry.appId;
      if (!appId) return;
      const dateKey = dateUtils.historyEntryDateKey(entry);
      if (dateKey !== todayKey) return;
      const resetAt = Number(resetMap[appId]) || 0;
      const timestamp = Number(entry && entry.timestamp) || 0;
      if (resetAt > 0 && timestamp > 0 && timestamp <= resetAt) return;
      const secs = Number(entry && entry.seconds) || 0;
      if (!byApp[appId] || secs > byApp[appId]) byApp[appId] = secs;
    });

    let changed = false;
    data.apps.forEach((appEntry) => {
      if (!appEntry || !appEntry.id) return;
      const current = Number(appEntry.todaySeconds) || 0;
      const recovered = Number(byApp[appEntry.id]) || 0;
      if (recovered > current) {
        appEntry.todaySeconds = recovered;
        changed = true;
      }
    });

    return changed;
  }

  function loadData() {
    const primary = readJsonFileSafe(dataFile);
    const legacy = readJsonFileSafe(legacyDataFile);
    const chosen = primary || legacy;
    if (chosen) {
      rehydrateTodaySeconds(chosen);
      return chosen;
    }
    return { apps: [], history: [], limits: {} };
  }

  function saveData(data) {
    const json = JSON.stringify(data, null, 2);
    try {
      fs.writeFileSync(dataFile, json);
    } catch (_) {}
    try {
      if (fs.existsSync(legacyDataFile)) fs.writeFileSync(legacyDataFile, json);
    } catch (_) {}
  }

  function mergeForSafeSave(current, incoming) {
    const base = current && typeof current === 'object' ? current : {};
    const next = incoming && typeof incoming === 'object' ? incoming : {};

    const merged = { ...base, ...next };
    const baseApps = Array.isArray(base.apps) ? base.apps : [];
    const nextApps = Array.isArray(next.apps) ? next.apps : [];
    const byId = {};

    baseApps.forEach((appEntry) => {
      if (!appEntry || !appEntry.id) return;
      byId[appEntry.id] = { ...appEntry };
    });

    nextApps.forEach((appEntry) => {
      if (!appEntry || !appEntry.id) return;
      const prev = byId[appEntry.id] || {};
      byId[appEntry.id] = {
        ...prev,
        ...appEntry,
        todaySeconds: Math.max(Number(prev.todaySeconds) || 0, Number(appEntry.todaySeconds) || 0)
      };
    });

    merged.apps = Object.values(byId);

    const baseHistory = Array.isArray(base.history) ? base.history : [];
    const nextHistory = Array.isArray(next.history) ? next.history : [];
    merged.history = nextHistory.length >= baseHistory.length ? nextHistory : baseHistory;

    merged.limits = { ...(base.limits || {}), ...(next.limits || {}) };
    merged.dailyLog = { ...(base.dailyLog || {}), ...(next.dailyLog || {}) };

    return merged;
  }

  return {
    loadData,
    mergeForSafeSave,
    saveData
  };
}

module.exports = { createDataStore };
