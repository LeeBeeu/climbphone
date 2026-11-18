// Kalendarz treningów (Etap 2). Czyste funkcje, bez DOM (testy: tests/calendar.test.mjs).
import { weekKeyOf, mondayOf, shiftWeek, planProgress } from './plan-calc.js';

const DAY_MS = 86_400_000;
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key, n) => toKey(utc(key) + n * DAY_MS);

// Siatka miesiąca od poniedziałku: [{ week: "2026-W45", days: ["2026-11-02", …7] }, …] (z dniami sąsiednich miesięcy).
export function monthGrid(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = toKey(Date.UTC(year, month, 0));
  const weeks = [];
  for (let w = weekKeyOf(first); ; w = shiftWeek(w, 1)) {
    const mon = mondayOf(w);
    weeks.push({ week: w, days: Array.from({ length: 7 }, (_, i) => addDays(mon, i)) });
    if (addDays(mon, 6) >= last) break;
  }
  return weeks;
}

export const weekDays = (weekKey) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(weekKey), i));

export function shiftMonth(year, month, n) {
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function sessionsByDate(sessions) {
  const map = {};
  for (const s of sessions) (map[s.date] ||= []).push(s);
  return map;
}

// Status tygodnia według wykonania planu (null, gdy brak planu albo tydzień w przyszłości):
//   done ≥ 80% · partial 1–79% · missed 0% (tylko dla zakończonych tygodni)
export function weekStatus(pct, weekKey, todayKey) {
  if (pct === null || pct === undefined) return null;
  const current = weekKeyOf(todayKey);
  if (weekKey > current) return null;
  if (pct >= 80) return 'done';
  if (pct > 0) return 'partial';
  return weekKey < current ? 'missed' : null;
}

export const STATUS_LABELS = { done: 'wykonany', partial: 'częściowo', missed: 'pominięty' };

// Wykonanie planów w tygodniu (średnia %), licząc każdy plan dopiero od tygodnia, w którym pierwszy raz
// coś w nim odhaczono (wcześniejsze tygodnie nie są „pominięte” – planu jeszcze nie było). null = brak.
export function planWeekPct(plans, planChecks, week) {
  const pcts = [];
  for (const p of plans) {
    const used = Object.keys(planChecks).filter((k) => k.startsWith(`${p.id}|`) && Object.keys(planChecks[k]).length)
      .map((k) => k.split('|')[1]).sort();
    if (!used.length || week < used[0]) continue;
    const pr = planProgress(p, planChecks[`${p.id}|${week}`] || {}, week);
    if (pr.total) pcts.push(pr.pct);
  }
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}
