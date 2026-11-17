// Plany treningowe: tygodnie, fazy, objętość. Czyste funkcje, bez DOM (testy: tests/plan-calc.test.mjs).
//
// Plan: { id, name, desc, days: [{ name, items: [] }], weeks: { "2026-W47": { phase, days? } } }
//   days      – szablon tygodnia (domyślny dla każdego tygodnia)
//   weeks[k]  – faza tygodnia i opcjonalnie własny plan tego tygodnia (days), np. po „Kopiuj poprzedni tydzień”
// Odhaczenia: planChecks["planId|2026-W47"] = { "0:Ćwiczenie": true }

export const PHASES = [
  { id: 'base', label: 'Baza' },
  { id: 'strength', label: 'Siła' },
  { id: 'power', label: 'Moc' },
  { id: 'endurance', label: 'Wytrzymałość' },
  { id: 'peak', label: 'Szczyt / sezon' },
  { id: 'taper', label: 'Taper' },
  { id: 'deload', label: 'Deload' },
  { id: 'rest', label: 'Odpoczynek' },
];
export const phaseLabel = (id) => PHASES.find((p) => p.id === id)?.label || '';

const DAY_MS = 86_400_000;
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// Tydzień ISO dla daty "RRRR-MM-DD": "2026-W47".
export function weekKeyOf(dateKey) {
  const d = new Date(utc(dateKey));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Poniedziałek tygodnia ISO jako "RRRR-MM-DD".
export function mondayOf(weekKey) {
  const [y, w] = weekKey.split('-W').map(Number);
  const jan4 = Date.UTC(y, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;
  return toKey(jan4 - (dow - 1) * DAY_MS + (w - 1) * 7 * DAY_MS);
}

export const shiftWeek = (weekKey, n) => weekKeyOf(toKey(utc(mondayOf(weekKey)) + n * 7 * DAY_MS));
export const weekNumber = (weekKey) => Number(weekKey.split('-W')[1]);

// Daty tygodnia: { start, end } jako "RRRR-MM-DD" (poniedziałek–niedziela).
export function weekRange(weekKey) {
  const start = mondayOf(weekKey);
  return { start, end: toKey(utc(start) + 6 * DAY_MS) };
}

// Plan obowiązujący w tygodniu: własny tygodnia albo szablon.
export const effectiveDays = (plan, weekKey) => plan.weeks?.[weekKey]?.days || plan.days;
export const hasWeekOverride = (plan, weekKey) => !!plan.weeks?.[weekKey]?.days;

export const itemKey = (dayIdx, text) => `${dayIdx}:${text}`;

export function planProgress(plan, checks, weekKey) {
  let total = 0;
  let done = 0;
  effectiveDays(plan, weekKey).forEach((day, i) => day.items.forEach((text) => {
    total++;
    if (checks?.[itemKey(i, text)]) done++;
  }));
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

// Blok faz od tygodnia startKey: `count` tygodni fazy `phase`, co `deloadEvery`-ty tydzień deload
// (np. mikrocykl 3:1 → deloadEvery = 4). Zwraca nowy obiekt weeks (własne plany tygodni zostają).
export function fillBlock(weeks, startKey, phase, count, deloadEvery = 0) {
  const out = structuredClone(weeks || {});
  for (let i = 0; i < count; i++) {
    const k = shiftWeek(startKey, i);
    const p = deloadEvery > 1 && (i + 1) % deloadEvery === 0 ? 'deload' : phase;
    out[k] = { ...(out[k] || {}), phase: p };
  }
  return out;
}

// „Kopiuj poprzedni tydzień”: faza i plan dni z tygodnia wcześniej (odhaczenia się nie kopiują).
export function copyPreviousWeek(plan, weekKey) {
  const prev = shiftWeek(weekKey, -1);
  const entry = { days: structuredClone(effectiveDays(plan, prev)) };
  const phase = plan.weeks?.[prev]?.phase;
  if (phase) entry.phase = phase;
  return { ...(plan.weeks || {}), [weekKey]: { ...(plan.weeks?.[weekKey] || {}), ...entry } };
}

// Objętość tygodnia z dziennika: liczba treningów i minuty.
export function weekVolume(sessions, weekKey) {
  const { start, end } = weekRange(weekKey);
  const list = sessions.filter((s) => s.date >= start && s.date <= end);
  return { count: list.length, minutes: list.reduce((t, s) => t + (Number(s.duration) || 0), 0) };
}
