// Waga – dodatki v2: statystyki zmian (MC-33), zmiany miesięczne (MC-34), okresy (MC-40/41), utrzymanie (MC-24).
// Czyste funkcje, bez DOM (testy: tests/weight-stats.test.mjs). Seria: wynik buildSeries() z weight-calc.js.
import { trendAt, dayNumber, keyFromDayNumber } from './weight-calc.js';

const r2 = (x) => Math.round(x * 100) / 100;

// Zmiana trendu w kg i % od punktu sprzed `days` dni (albo od pierwszego pomiaru, gdy days = null).
function change(series, days) {
  const last = series.at(-1);
  if (!last) return null;
  const from = days === null ? series[0] : trendAt(series, keyFromDayNumber(last.day - days));
  if (!from || from === last) return null;
  const kg = last.trend - from.trend;
  return { kg: r2(kg), pct: r2((kg / from.trend) * 100), from: from.date };
}

export function changeStats(series) {
  return { week: change(series, 7), month: change(series, 30), year: change(series, 365), all: change(series, null) };
}

// Zmiana trendu miesiąc do miesiąca: trend na koniec miesiąca minus trend na koniec poprzedniego.
// Miesiące bez pomiaru są pomijane (nie zgadujemy).  → [{ month: "2026-10", change }]
export function monthlyChanges(series, n = 12) {
  if (!series.length) return [];
  const months = [...new Set(series.map((p) => p.date.slice(0, 7)))];
  const out = [];
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    const endKey = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    const prevEnd = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10);
    const end = trendAt(series, endKey);
    const start = trendAt(series, prevEnd);
    if (end && start && start !== end) out.push({ month: m, change: r2(end.trend - start.trend) });
  }
  return out.slice(-n);
}

// ---------- Okresy (np. „redukcja”, „blok Chulilla”) ----------
// Okres: { id, name, start, end } – end może być null (trwa).

export function periodsInWindow(periods, startDay, endDay, todayKey) {
  return periods
    .map((p) => ({ ...p, s: dayNumber(p.start), e: dayNumber(p.end || todayKey) }))
    .filter((p) => p.e >= startDay && p.s <= endDay)
    .sort((a, b) => a.s - b.s);
}

// Nazwy do autouzupełniania: unikalne, od ostatnio używanych.
export const periodNames = (periods) => [...new Set([...periods].sort((a, b) => b.start.localeCompare(a.start)).map((p) => p.name))];

export function validatePeriod(p) {
  if (!String(p.name || '').trim()) return 'Podaj nazwę okresu';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start || '')) return 'Podaj datę początku';
  if (p.end && p.end < p.start) return 'Koniec nie może być przed początkiem';
  return null;
}

// Zmiana trendu w okresie (kg) – do listy okresów.
export function periodChange(series, p, todayKey) {
  const a = trendAt(series, p.start) || series.find((x) => x.date >= p.start);
  const b = trendAt(series, p.end || todayKey);
  return a && b && b.day >= a.day ? r2(b.trend - a.trend) : null;
}

// ---------- Tryb utrzymania (po wejściu w przedział celu) ----------
// inGoal – trend w przedziale; since/days – od kiedy nieprzerwanie; drift – zmiana trendu w 14 dni;
// warn – trend w przedziale, ale w ciągu 14 dni przesunął się o ≥ połowę szerokości przedziału.
export function maintenance(series, goal) {
  const last = series.at(-1);
  if (!last || !goal) return null;
  const inside = (t) => t >= goal.target_min_kg && t <= goal.target_max_kg;
  if (!inside(last.trend)) return { inGoal: false };
  let i = series.length - 1;
  while (i > 0 && inside(series[i - 1].trend)) i--;
  const ref = trendAt(series, keyFromDayNumber(last.day - 14));
  const drift = ref ? r2(last.trend - ref.trend) : null;
  const width = goal.target_max_kg - goal.target_min_kg;
  return {
    inGoal: true,
    since: series[i].date,
    days: last.day - series[i].day,
    drift,
    warn: drift !== null && Math.abs(drift) >= width / 2,
  };
}
