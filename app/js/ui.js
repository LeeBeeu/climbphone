// Drobne helpery wspólne dla wszystkich widoków.

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let toastTimer = null;
export function toast(message, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Daty trzymamy jako 'RRRR-MM-DD' w czasie lokalnym.
export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const fmtDate = (s) =>
  parseDate(s).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtDateLong = (s) =>
  parseDate(s).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });

export function monthLabel(s) {
  const label = parseDate(s).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return label[0].toUpperCase() + label.slice(1);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
}

export function weekRangeLabel(date = new Date()) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
}

// 75 -> "1:15", 42 -> "42"
export function fmtSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

// 42 -> "42 s", 75 -> "1:15 min"
export const fmtDuration = (sec) => (sec < 60 ? `${sec} s` : `${fmtSeconds(sec)} min`);

export function fmtMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Polska odmiana: 1 zwis, 2 zwisy, 5 zwisów
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

// Zdarzenie instalacji PWA (Chrome/Samsung Internet), przechwytywane w app.js.
export const pwa = { installPrompt: null };
