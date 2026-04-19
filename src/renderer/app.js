const { ipcRenderer } = require('electron');
window.ipcRenderer = ipcRenderer;

// ── State ──────────────────────────────────────────────────────────────────
let state = { apps: [], history: [], limits: {} };
let activeAppId = null;
let timerPaused = false;
let floatEnabled = false;
let selectedEmoji = '📦';

const EMOJIS = ['💻','🌐','📺','🎮','📱','💬','📷','🎵','📚','✍️','🎨','📊','📂','⚙️','🔧','🏃','🍕','☕','🎯','🚀','💰','🔔','📧','🗂','🎬','🎧','🛠','🌍','🔒','📝'];

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  state = await ipcRenderer.invoke('load-data');
  if (!state.apps) state.apps = [];
  if (!state.history) state.history = [];
  if (!state.limits) state.limits = {};

  // Restore active timer state from main process
  const timerState = await ipcRenderer.invoke('get-timer-state');
  if (timerState.activeAppId) {
    activeAppId = timerState.activeAppId;
    timerPaused = !!timerState.timerPaused;
    // Sync seconds from main
    const app = state.apps.find(a => a.id === activeAppId);
    if (app) app.todaySeconds = timerState.activeSeconds;
  }
  floatEnabled = timerState.floatEnabled;
  const floatBtn = document.getElementById('float-toggle-btn');
  if (floatBtn && floatEnabled) {
    floatBtn.textContent = '◈ Float: ON';
    floatBtn.style.color = 'var(--accent)';
    floatBtn.style.borderColor = 'rgba(232,255,71,0.4)';
  }

  renderAll();
}

// ── Views ──────────────────────────────────────────────────────────────────
function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'charts') renderCharts();
  if (name === 'limits') renderLimits();
  if (name === 'daily') loadAndRenderDaily();
}

// ── Render All ─────────────────────────────────────────────────────────────
function renderAll() {
  renderApps();
  renderStats();
}

function renderStats() {
  const tracked = state.apps.filter(a => a.todaySeconds > 0).length;
  document.getElementById('stat-apps').textContent = tracked;
  document.getElementById('stat-total').textContent = state.apps.length;

  const total = state.apps.reduce((s, a) => s + (a.todaySeconds || 0), 0);
  document.getElementById('stat-total-time').textContent = formatHM(total);

  if (activeAppId) {
    const app = state.apps.find(a => a.id === activeAppId);
    if (app) {
      document.getElementById('stat-active').textContent = app.icon;
      document.getElementById('stat-active-sub').textContent = timerPaused ? `${app.name} (paused)` : app.name;
    }
  } else {
    document.getElementById('stat-active').textContent = '—';
    document.getElementById('stat-active-sub').textContent = 'no app running';
  }
}

// ── App Cards ──────────────────────────────────────────────────────────────
function renderApps() {
  const grid = document.getElementById('app-grid');
  if (!state.apps.length) {
    grid.innerHTML = `<div class="empty-state"><div class="big">📦</div><p>No apps added yet.<br/>Click <strong>+ Add App</strong> to start tracking.</p></div>`;
    return;
  }

  grid.innerHTML = state.apps.map(app => {
    const isTracking = app.id === activeAppId;
    const limit = state.limits[app.id];
    const limitEnabled = limit && limit.enabled;
    const pct = limitEnabled ? Math.min(100, ((app.todaySeconds || 0) / (limit.minutes * 60)) * 100) : 0;
    const barClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

    return `
    <div class="app-card ${isTracking ? `tracking${timerPaused ? ' paused' : ''}` : ''}" id="card-${app.id}">
      <div class="app-icon">${app.icon}</div>
      <div class="app-info">
        <div class="app-name">${app.name}</div>
        <div class="app-category">${isTracking && timerPaused ? `${app.category} • paused` : app.category}</div>
      </div>
      ${limitEnabled ? `
        <div class="limit-bar-wrap">
          <div class="limit-bar-label">${Math.round(pct)}% of ${limit.minutes}m</div>
          <div class="limit-bar"><div class="limit-bar-fill ${barClass}" style="width:${pct}%"></div></div>
        </div>` : ''}
      <div class="app-timer" id="timer-${app.id}">${formatTime(app.todaySeconds || 0)}</div>
      <div class="app-actions">
        ${isTracking
          ? `${timerPaused
              ? `<button class="btn btn-start" onclick="resumeTracking()">▶ Resume</button>`
              : `<button class="btn btn-pause" onclick="pauseTracking()">⏸ Pause</button>`
            }
            <button class="btn btn-stop" onclick="stopTracking()">⏹ Stop</button>`
          : `<button class="btn btn-start" onclick="startTracking('${app.id}')">▶ Start</button>`
        }
        <button class="btn btn-ghost btn-icon" title="Reset today" onclick="resetApp('${app.id}')">↺</button>
        <button class="btn btn-danger btn-icon" title="Remove" onclick="removeApp('${app.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Float Widget ───────────────────────────────────────────────────────────

function toggleFloat() {
  floatEnabled = !floatEnabled;
  const btn = document.getElementById('float-toggle-btn');
  const settingBtn = document.getElementById('float-setting-toggle');
  if (btn) { btn.textContent = floatEnabled ? '◈ Float: ON' : '◈ Float: OFF'; btn.style.color = floatEnabled ? 'var(--accent)' : ''; btn.style.borderColor = floatEnabled ? 'rgba(232,255,71,0.4)' : ''; }
  if (settingBtn) settingBtn.classList.toggle('on', floatEnabled);
  ipcRenderer.send('float-toggle', floatEnabled);
}

// Stop from float widget button
ipcRenderer.on('stop-tracking-from-float', () => stopTracking());

ipcRenderer.on('float-hidden', () => {
  floatEnabled = false;
  const btn = document.getElementById('float-toggle-btn');
  const settingBtn = document.getElementById('float-setting-toggle');
  if (btn) {
    btn.textContent = '◈ Float: OFF';
    btn.style.color = '';
    btn.style.borderColor = '';
  }
  if (settingBtn) settingBtn.classList.remove('on');
});

// ── Receive ticks FROM main process (single source of truth) ───────────────
ipcRenderer.on('timer-tick', (_, { appId, seconds }) => {
  // Keep renderer active state aligned with the main process source-of-truth.
  if (activeAppId !== appId) activeAppId = appId;
  timerPaused = false;

  // Update in-memory state
  const app = state.apps.find(a => a.id === appId);
  if (app) app.todaySeconds = seconds;

  // Update timer display
  const timerEl = document.getElementById('timer-' + appId);
  if (timerEl) timerEl.textContent = formatTime(seconds);

  // Update stats row
  renderStats();

  // Update limit bar every 5s
  if (seconds % 5 === 0 && app) updateLimitBar(app);
});

// Main process says tracking stopped
ipcRenderer.on('timer-stopped', (_, { appId }) => {
  // Ignore stale stop events when another app is already running.
  if (activeAppId && activeAppId !== appId) return;

  activeAppId = null;
  timerPaused = false;
  // Reload data from disk to get accurate saved state
  ipcRenderer.invoke('load-data').then(fresh => {
    state = fresh;
    renderAll();
  });
});

ipcRenderer.on('timer-paused', (_, { appId, seconds }) => {
  if (activeAppId !== appId) activeAppId = appId;
  timerPaused = true;

  const app = state.apps.find(a => a.id === appId);
  if (app) app.todaySeconds = seconds;

  renderApps();
  renderStats();
});

ipcRenderer.on('timer-resumed', (_, { appId, seconds }) => {
  if (activeAppId !== appId) activeAppId = appId;
  timerPaused = false;

  const app = state.apps.find(a => a.id === appId);
  if (app) app.todaySeconds = seconds;

  renderApps();
  renderStats();
});

// Main process fired a limit alert
ipcRenderer.on('limit-alert', (_, { name, minutes }) => {
  showToast(`Limit reached for ${name} (${minutes} min)`, true);
});

// ── Timer Logic ────────────────────────────────────────────────────────────
function startTracking(appId) {
  if (activeAppId === appId && !timerPaused) return;

  const app = state.apps.find(a => a.id === appId);
  if (!app) return;

  activeAppId = appId;
  timerPaused = false;

  // Tell main process to start the timer
  ipcRenderer.send('start-tracking', {
    appId,
    currentSeconds: app.todaySeconds || 0,
    icon: app.icon,
    name: app.name
  });

  renderApps();
  showToast(`Started tracking ${app.name}`, false);
}

function pauseTracking() {
  if (!activeAppId || timerPaused) return;
  timerPaused = true;
  ipcRenderer.send('float-toggle-pause');
  renderApps();
  renderStats();
}

function resumeTracking() {
  if (!activeAppId || !timerPaused) return;
  timerPaused = false;
  ipcRenderer.send('float-toggle-pause');
  renderApps();
  renderStats();
}

async function stopTracking() {
  if (!activeAppId) return;
  const app = state.apps.find(a => a.id === activeAppId);
  const name = app?.name;

  // Stop in main process and then sync from disk to avoid write races
  const fresh = await ipcRenderer.invoke('stop-tracking');
  if (fresh) state = fresh;
  activeAppId = null;
  timerPaused = false;

  renderApps();
  renderStats();
  if (document.getElementById('view-charts').classList.contains('active')) renderCharts();
  if (name) showToast(`Stopped tracking ${name}`, false);
}

function triggerLimitAlert(app) {
  showToast(`Limit reached for ${app.name}`, true);
}

function updateLimitBar(app) {
  const limit = state.limits[app.id];
  if (!limit || !limit.enabled) return;
  const pct = Math.min(100, ((app.todaySeconds || 0) / (limit.minutes * 60)) * 100);
  const fill = document.querySelector(`#card-${app.id} .limit-bar-fill`);
  const label = document.querySelector(`#card-${app.id} .limit-bar-label`);
  if (fill) {
    fill.style.width = pct + '%';
    fill.className = `limit-bar-fill${pct >= 100 ? ' danger' : pct >= 80 ? ' warn' : ''}`;
  }
  if (label) label.textContent = `${Math.round(pct)}% of ${limit.minutes}m`;
}

// ── App CRUD ───────────────────────────────────────────────────────────────
function addApp() {
  const name = document.getElementById('new-app-name').value.trim();
  if (!name) { document.getElementById('new-app-name').focus(); return; }

  const cat = document.getElementById('new-app-cat').value;
  const app = {
    id: 'app_' + Date.now(),
    name, icon: selectedEmoji, category: cat,
    todaySeconds: 0, createdAt: Date.now()
  };
  state.apps.push(app);
  saveState();
  renderAll();
  closeAddModal();
  showToast(`✅ Added ${name}`, false);
}

async function removeApp(appId) {
  const app = state.apps.find(a => a.id === appId);
  const name = app?.name;

  const fresh = await ipcRenderer.invoke('remove-app', appId);
  if (fresh) state = fresh;
  if (activeAppId === appId) activeAppId = null;

  renderAll();
  if (document.getElementById('view-charts').classList.contains('active')) renderCharts();
  if (name) showToast(`Removed ${name}`, false);
}

async function resetApp(appId) {
  const app = state.apps.find(a => a.id === appId);
  if (!app) return;
  const wasActive = activeAppId === appId;
  const fresh = await ipcRenderer.invoke('reset-app-time', appId);
  if (fresh) state = fresh;
  if (wasActive) {
    activeAppId = null;
    timerPaused = false;
  }
  renderAll();
  showToast(`↺ Reset ${app.name}`, false);
}

// ── Limits ─────────────────────────────────────────────────────────────────
function renderLimits() {
  const el = document.getElementById('limits-list');
  if (!state.apps.length) {
    el.innerHTML = `<div class="empty-state"><div class="big">⚙️</div><p>Add apps on the Dashboard first.</p></div>`;
    return;
  }
  el.innerHTML = state.apps.map(app => {
    const lim = state.limits[app.id] || { enabled: false, minutes: 60 };
    return `
    <div class="limit-row">
      <div class="limit-app-icon">${app.icon}</div>
      <div class="limit-app-name">${app.name}</div>
      <div class="limit-input-wrap">
        <input class="limit-input" type="number" min="1" max="1440" value="${lim.minutes}"
          onchange="updateLimit('${app.id}','minutes',this.value)" />
        <span class="limit-unit">min / day</span>
        <button class="limit-toggle ${lim.enabled ? 'on' : ''}" id="ltog-${app.id}"
          onclick="toggleLimit('${app.id}')"></button>
      </div>
    </div>`;
  }).join('');
}

function updateLimit(appId, key, val) {
  if (!state.limits[appId]) state.limits[appId] = { enabled: false, minutes: 60 };
  state.limits[appId][key] = key === 'minutes' ? parseInt(val) || 60 : val;
  saveState();
}

function toggleLimit(appId) {
  if (!state.limits[appId]) state.limits[appId] = { enabled: false, minutes: 60 };
  state.limits[appId].enabled = !state.limits[appId].enabled;
  saveState();
  const btn = document.getElementById('ltog-' + appId);
  if (btn) btn.classList.toggle('on', state.limits[appId].enabled);
  renderApps();
}

// ── Charts ─────────────────────────────────────────────────────────────────
const PALETTE = ['#e8ff47','#47b8ff','#ff6b35','#2ecc71','#a855f7','#f59e0b','#ec4899','#06b6d4'];

function renderCharts() {
  renderBarChart();
  renderDonut();
  renderHistory();
}

function renderBarChart() {
  const el = document.getElementById('bar-chart');
  const apps = state.apps.filter(a => a.todaySeconds > 0);
  if (!apps.length) { el.innerHTML = '<div class="empty-state" style="width:100%;align-self:center"><p>No usage recorded today.</p></div>'; return; }

  const max = Math.max(...apps.map(a => a.todaySeconds));
  el.innerHTML = apps.map((app, i) => {
    const h = max > 0 ? Math.max(8, (app.todaySeconds / max) * 140) : 8;
    return `
    <div class="bar-wrap">
      <div class="bar" style="height:${h}px;background:${PALETTE[i % PALETTE.length]}">
        <div class="bar-tooltip">${formatTime(app.todaySeconds)}</div>
      </div>
      <div class="bar-label" title="${app.name}">${app.icon} ${app.name.slice(0,8)}</div>
    </div>`;
  }).join('');
}

function renderDonut() {
  const svg = document.getElementById('donut-svg');
  const legend = document.getElementById('donut-legend');
  const apps = state.apps.filter(a => a.todaySeconds > 0);
  if (!apps.length) {
    svg.innerHTML = `<circle cx="60" cy="60" r="48" fill="none" stroke="#1c1c21" stroke-width="18"/><text x="60" y="65" text-anchor="middle" fill="#6b6b7a" font-size="11" font-family="Space Mono">no data</text>`;
    legend.innerHTML = '';
    return;
  }

  const total = apps.reduce((s, a) => s + a.todaySeconds, 0);
  const r = 48; const cx = 60; const cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let circles = '';
  apps.forEach((app, i) => {
    const frac = app.todaySeconds / total;
    const dash = frac * circ;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PALETTE[i%PALETTE.length]}" stroke-width="18" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
  });
  svg.innerHTML = circles;
  legend.innerHTML = apps.map((app, i) =>
    `<div class="legend-item"><div class="legend-dot" style="background:${PALETTE[i%PALETTE.length]}"></div><span class="legend-name">${app.icon} ${app.name}</span><span class="legend-val">${formatHM(app.todaySeconds)}</span></div>`
  ).join('');
}

function renderHistory() {
  const el = document.getElementById('history-list');
  const recent = state.history.slice(0, 15);
  if (!recent.length) { el.innerHTML = '<div class="empty-state"><p>No sessions recorded yet.</p></div>'; return; }
  el.innerHTML = recent.map(h =>
    `<div class="history-row">
      <div class="history-icon">${h.appIcon}</div>
      <div class="history-name">${h.appName}</div>
      <div class="history-date">${h.date}</div>
      <div class="history-time">${formatTime(h.seconds)}</div>
    </div>`
  ).join('');
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openAddModal() {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = EMOJIS.map(e => `<div class="emoji-opt ${e===selectedEmoji?'selected':''}" onclick="selectEmoji('${e}',this)">${e}</div>`).join('');
  document.getElementById('new-app-name').value = '';
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-app-name').focus(), 100);
}
function closeAddModal() { document.getElementById('add-modal').classList.remove('open'); }
function selectEmoji(e, el) {
  selectedEmoji = e;
  document.querySelectorAll('.emoji-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, isAlert) {
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = `toast ${isAlert ? 'alert' : ''}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(secs) {
  secs = secs || 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function formatHM(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}
function pad(n) { return String(n).padStart(2,'0'); }
function saveState() { ipcRenderer.invoke('save-data', state); }

// Close modal on overlay click
document.getElementById('add-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAddModal();
});

// ── Settings ───────────────────────────────────────────────────────────────
async function initSettings() {
  const enabled = await ipcRenderer.invoke('get-auto-launch');
  const btn = document.getElementById('autolaunch-toggle');
  if (btn) btn.classList.toggle('on', !!enabled);
}

async function toggleAutoLaunch() {
  const btn = document.getElementById('autolaunch-toggle');
  const current = btn.classList.contains('on');
  const result = await ipcRenderer.invoke('set-auto-launch', !current);
  btn.classList.toggle('on', !!result);
  showToast(result ? '✅ AppWatch will launch at startup' : '✅ Startup launch disabled', false);
}

async function resetAllToday() {
  const fresh = await ipcRenderer.invoke('reset-all-times');
  if (fresh) state = fresh;
  activeAppId = null;
  timerPaused = false;
  renderAll();
  showToast('↺ All timers reset for today', false);
}

// ── Daily History ──────────────────────────────────────────────────────────
let dailyLog = {}; // { "YYYY-MM-DD": { appId: { name, icon, seconds } } }

async function loadAndRenderDaily() {
  dailyLog = await ipcRenderer.invoke('get-daily-log');
  populateDailyFilters();
  renderDailyView();
}

function populateDailyFilters() {
  const dates = Object.keys(dailyLog).sort().reverse();
  const allApps = {};

  dates.forEach(date => {
    Object.entries(dailyLog[date]).forEach(([id, info]) => {
      allApps[id] = info.name + ' ' + info.icon;
    });
  });

  const dateSelect = document.getElementById('daily-date-filter');
  const appSelect  = document.getElementById('daily-app-filter');
  const prevDate = dateSelect.value;
  const prevApp  = appSelect.value;

  dateSelect.innerHTML = '<option value="all">All dates</option>' +
    dates.map(d => `<option value="${d}" ${d === prevDate ? 'selected' : ''}>${formatDateLabel(d)}</option>`).join('');
  if (prevDate && prevDate !== 'all') dateSelect.value = prevDate;

  appSelect.innerHTML = '<option value="all">All apps</option>' +
    Object.entries(allApps).map(([id, label]) =>
      `<option value="${id}" ${id === prevApp ? 'selected' : ''}>${label}</option>`
    ).join('');
  if (prevApp && prevApp !== 'all') appSelect.value = prevApp;
}

function formatDateLabel(dateStr) {
  // dateStr = "YYYY-MM-DD"
  // Parse as LOCAL date (not UTC) to avoid timezone-shift showing wrong day
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1; // month is 0-indexed
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;

  const date = new Date(y, m, d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const toKey = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;

  if (dateStr === toKey(today)) return `📅 Today (${dateStr})`;
  if (dateStr === toKey(yesterday)) return `Yesterday (${dateStr})`;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function renderDailyView() {
  const container = document.getElementById('daily-content');
  const filterDate = document.getElementById('daily-date-filter').value;
  const filterApp  = document.getElementById('daily-app-filter').value;

  let dates = Object.keys(dailyLog).sort().reverse();
  if (filterDate !== 'all') dates = dates.filter(d => d === filterDate);

  if (!dates.length) {
    container.innerHTML = '<div class="empty-state"><div class="big">📅</div><p>No daily data yet.<br/>Data saves automatically at midnight, or click <strong>💾 Save Today</strong>.</p></div>';
    return;
  }

  const PALETTE = ['var(--accent)','#60c3ff','#c084fc','#f97316','#34d399','#fb7185','#facc15','#a78bfa'];

  container.innerHTML = dates.map(date => {
    const entries = dailyLog[date];
    let apps = Object.entries(entries).map(([id, info]) => ({ id, ...info }));
    if (filterApp !== 'all') apps = apps.filter(a => a.id === filterApp);
    if (!apps.length) return '';

    apps.sort((a, b) => b.seconds - a.seconds);
    const totalSecs = apps.reduce((s, a) => s + a.seconds, 0);
    const maxSecs   = apps[0].seconds;

    const rows = apps.map((a, i) => {
      const pct = maxSecs > 0 ? Math.round((a.seconds / maxSecs) * 100) : 0;
      const color = PALETTE[i % PALETTE.length];
      return `
        <div class="daily-app-row">
          <div class="daily-app-meta">
            <span class="daily-app-icon">${a.icon}</span>
            <span class="daily-app-name">${a.name}</span>
            <span class="daily-app-time">${formatHM(a.seconds)}</span>
          </div>
          <div class="daily-bar-track">
            <div class="daily-bar-fill" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="daily-card">
        <div class="daily-card-header">
          <span class="daily-card-date">${formatDateLabel(date)}</span>
          <span class="daily-card-total">Total: <strong>${formatHM(totalSecs)}</strong> across ${apps.length} app${apps.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="daily-apps">${rows}</div>
      </div>`;
  }).filter(Boolean).join('');

  if (!container.innerHTML.trim()) {
    container.innerHTML = '<div class="empty-state"><p>No data for the selected filters.</p></div>';
  }
}

async function saveTodaySnapshot() {
  await ipcRenderer.invoke('save-daily-snapshot');
  showToast('💾 Today\'s usage saved!', false);
  await loadAndRenderDaily();
}

// ── Boot ───────────────────────────────────────────────────────────────────
// Day rolled over at midnight — reload state and reset UI
ipcRenderer.on('day-rolled-over', async () => {
  state = await ipcRenderer.invoke('load-data');
  activeAppId = null;
  timerPaused = false;
  renderAll();
  showToast('🌙 New day started — yesterday\'s data saved!', false);
});

init();
initSettings();
