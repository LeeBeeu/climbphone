// Analityka (Etap 3). Czyste funkcje, bez DOM (testy: tests/analytics-calc.test.mjs).
//
// Obciążenie treningowe (workload) – jawny wzór, metoda sesyjnego RPE (Foster):
//   obciążenie sesji = czas [min] × RPE (1–10)       np. 90 min × RPE 7 = 630
//   sesje bez RPE nie wchodzą do sumy (pokazujemy, ile sesji je ma)
// Stosunek obciążenia ostrego do przewlekłego (ACWR):
//   ostatni pełny tydzień / średnia z 4 pełnych tygodni kończących się na nim
//   < 0,8 spadek · 0,8–1,3 bezpiecznie · 1,3–1,5 uwaga · > 1,5 duży skok (ryzyko przeciążenia)
import { gradeIndex, SYSTEMS, SEND_STYLES } from './grades.js';
import { weekKeyOf, shiftWeek, weekRange } from './plan-calc.js';

const DAY_MS = 86_400_000;
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export const PERIODS = [
  { id: '28', days: 28, label: '4 tyg.' },
  { id: '91', days: 91, label: '3 mies.' },
  { id: '365', days: 365, label: '12 mies.' },
];

// Okres kończący się dziś i poprzedni okres tej samej długości: { cur: {start,end}, prev: {start,end} }.
export function periods(todayKey, days) {
  const end = utc(todayKey);
  const start = end - (days - 1) * DAY_MS;
  return {
    cur: { start: toKey(start), end: todayKey },
    prev: { start: toKey(start - days * DAY_MS), end: toKey(start - DAY_MS) },
  };
}

const inRange = (date, r) => date >= r.start && date <= r.end;

export const sessionLoad = (s) => (s.rpe >= 1 ? (Number(s.duration) || 0) * s.rpe : null);

export function sessionStats(sessions, range) {
  const list = sessions.filter((s) => inRange(s.date, range));
  const withRpe = list.filter((s) => sessionLoad(s) !== null);
  return {
    count: list.length,
    minutes: list.reduce((t, s) => t + (Number(s.duration) || 0), 0),
    load: withRpe.reduce((t, s) => t + sessionLoad(s), 0),
    rpeCount: withRpe.length,
  };
}

// Przejścia w okresie dla rodzaju (route/boulder): liczba, najtrudniejsze, średnia 10 najlepszych (jak „top 10” na 8a.nu).
export function ascentStats(ascents, range, kind) {
  const sends = ascents
    .filter((a) => a.kind === kind && SEND_STYLES.includes(a.style) && inRange(a.date, range))
    .map((a) => ({ ...a, gi: gradeIndex(a.system, a.grade) }))
    .filter((a) => a.gi >= 0);
  if (!sends.length) return { count: 0, best: null, top10: null, system: null };
  // Wyceny z różnych skal porównujemy w skali najczęstszej w okresie.
  const counts = {};
  sends.forEach((a) => { counts[a.system] = (counts[a.system] || 0) + 1; });
  const system = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const same = sends.filter((a) => a.system === system).sort((a, b) => b.gi - a.gi);
  const top = same.slice(0, 10);
  const avg = Math.round(top.reduce((t, a) => t + a.gi, 0) / top.length);
  return {
    count: sends.length,
    best: { grade: same[0].grade, style: same[0].style, name: same[0].name || '' },
    top10: SYSTEMS[system].grades[avg],
    top10Index: top.reduce((t, a) => t + a.gi, 0) / top.length,
    system,
  };
}

// Tygodnie od (endWeek − n + 1) do endWeek: [{ week, count, minutes, load }]
export function weeklySeries(sessions, endWeek, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const week = shiftWeek(endWeek, i - n + 1);
    const r = weekRange(week);
    const st = sessionStats(sessions, r);
    return { week, count: st.count, minutes: st.minutes, load: st.load };
  });
}

// Seria tygodni z co najmniej jednym treningiem, licząc wstecz; bieżący (niezakończony) tydzień bez treningu nie przerywa serii.
export function streak(series) {
  let i = series.length - 1;
  if (i >= 0 && series[i].count === 0) i--;
  let n = 0;
  for (; i >= 0 && series[i].count > 0; i--) n++;
  return n;
}

// ACWR z pełnych tygodni: series kończy się bieżącym tygodniem, więc go pomijamy.
export function acwr(series) {
  const full = series.slice(0, -1);
  if (full.length < 4) return null;
  const last4 = full.slice(-4);
  const chronic = last4.reduce((t, w) => t + w.load, 0) / 4;
  if (!chronic) return null;
  const ratio = Math.round((full.at(-1).load / chronic) * 100) / 100;
  const zone = ratio < 0.8 ? 'low' : ratio <= 1.3 ? 'ok' : ratio <= 1.5 ? 'warn' : 'high';
  return { ratio, zone, acute: full.at(-1).load, chronic: Math.round(chronic) };
}

export const ACWR_LABELS = {
  low: 'spadek obciążenia', ok: 'bezpiecznie', warn: 'uwaga – szybki wzrost', high: 'duży skok – ryzyko przeciążenia',
};

// Zmiana procentowa (null, gdy brak bazy).
export const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

export { weekKeyOf };
