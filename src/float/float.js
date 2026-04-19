const { ipcRenderer } = require('electron');

const widget  = document.getElementById('widget');
const iconEl  = document.getElementById('app-icon');
const nameEl  = document.getElementById('app-name');
const timerEl = document.getElementById('timer');
const toggleBtn = document.getElementById('btn-toggle');

function applyPausedState(paused) {
  const isPaused = !!paused;
  widget.classList.toggle('paused', isPaused);
  toggleBtn.textContent = isPaused ? '▶' : '⏸';
  toggleBtn.title = isPaused ? 'Resume' : 'Pause';
}

// ── Receive ticks ─────────────────────────────────────────────────────────────
ipcRenderer.on('float-init', (_, { icon, name, seconds, paused }) => {
  iconEl.textContent  = icon || '⏱';
  nameEl.textContent  = name || 'Not tracking';
  timerEl.textContent = formatTime(seconds || 0);
  applyPausedState(paused);
});

ipcRenderer.on('float-update', (_, { icon, name, seconds, paused }) => {
  if (icon)  iconEl.textContent  = icon;
  if (name)  nameEl.textContent  = name;
  timerEl.textContent = formatTime(seconds || 0);
  applyPausedState(paused);
});

// ── Control buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('float-open-main');
});
document.getElementById('btn-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('float-toggle-pause');
});
document.getElementById('btn-stop').addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('float-stop-tracking');
});
document.getElementById('btn-hide').addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('float-hide');
});

// ── Drag ─────────────────────────────────────────────────────────────────────
let dragging = false, sx, sy;

widget.addEventListener('mousedown', (e) => {
  if (e.target.closest('#hover-bar')) return;
  dragging = true; sx = e.screenX; sy = e.screenY;
});
document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - sx, dy = e.screenY - sy;
  sx = e.screenX; sy = e.screenY;
  ipcRenderer.send('float-move-delta', { dx, dy });
});
document.addEventListener('mouseup', () => { dragging = false; });

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
