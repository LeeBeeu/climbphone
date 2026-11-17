// Plany treningowe: tygodnie, fazy, objętość. Czyste funkcje, bez DOM (testy: tests/plan-calc.test.mjs).
//
// Plan: { id, name, desc, days: [{ name, items: [] }], pool: [], weeks: { "2026-W47": { phase, days?, pool? } } }
//   days      – szablon tygodnia (domyślny dla każdego tygodnia)
//   pool      – pula tygodnia: treningi do zrobienia w dowolny dzień (np. „2× bouldering”, „1× ARC”)
//   weeks[k]  – faza tygodnia i opcjonalnie własny plan tego tygodnia (days, pool), np. po „Kopiuj poprzedni tydzień”
// Odhaczenia: planChecks["planId|2026-W47"] = { "0:Ćwiczenie": true, "pool:Trening": true }

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
export const effectivePool = (plan, weekKey) => plan.weeks?.[weekKey]?.pool || plan.pool || [];
export const hasWeekOverride = (plan, weekKey) => !!(plan.weeks?.[weekKey]?.days || plan.weeks?.[weekKey]?.pool);

export const itemKey = (dayIdx, text) => `${dayIdx}:${text}`;
export const poolKey = (text, n = 0) => `pool:${text}${n ? `#${n}` : ''}`;

// Pozycja puli z krotnością „2× Bouldering” → 2 osobne pola do odhaczenia.
export function poolSlots(pool) {
  const out = [];
  for (const raw of pool) {
    const m = String(raw).match(/^(\d+)\s*[×x]\s*(.+)$/i);
    const n = m ? Math.min(14, Number(m[1])) : 1;
    const text = m ? m[2].trim() : raw;
    for (let i = 0; i < n; i++) out.push({ text, key: poolKey(raw, i), n: i + 1, of: n });
  }
  return out;
}

export function planProgress(plan, checks, weekKey) {
  let total = 0;
  let done = 0;
  effectiveDays(plan, weekKey).forEach((day, i) => day.items.forEach((text) => {
    total++;
    if (checks?.[itemKey(i, text)]) done++;
  }));
  for (const slot of poolSlots(effectivePool(plan, weekKey))) {
    total++;
    if (checks?.[slot.key]) done++;
  }
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

// „Kopiuj poprzedni tydzień”: faza, plan dni i pula z tygodnia wcześniej (odhaczenia się nie kopiują).
export function copyPreviousWeek(plan, weekKey) {
  const prev = shiftWeek(weekKey, -1);
  const entry = { days: structuredClone(effectiveDays(plan, prev)), pool: [...effectivePool(plan, prev)] };
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
