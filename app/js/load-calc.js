// Obciążenie na chwytotablicy względem masy ciała. Czyste funkcje, bez DOM (testy: tests/load-calc.test.mjs).
//
// Umowa: procent masy ciała (% MC) liczymy od CAŁKOWITEGO obciążenia chwytów:
//   obciążenie = masa ciała + dociążenie        (odciążenie na bloczku = dociążenie ujemne)
//   % MC       = obciążenie / masa ciała · 100
// Przykład: 80 kg, +8 kg → 88 kg = 110% MC; 80 kg, −20 kg → 60 kg = 75% MC.
import { buildSeries, dayNumber, dayKey, trendAt } from './weight-calc.js';

export const LOAD_STEP_KG = 0.5;      // krok odważników przy przeliczaniu % → kg
export const BW_STALE_DAYS = 7;       // starsza masa ciała: pokazujemy ostrzeżenie
export const PCT_MIN = 10;
export const PCT_MAX = 250;

const round1 = (x) => Math.round(x * 10) / 10;

export const roundTo = (x, step = LOAD_STEP_KG) => Math.round(x / step) * step + 0; // +0 zamienia −0 na 0

// Masa ciała do obliczeń: trend z modułu Waga (stabilniejszy niż pojedynczy pomiar).
// Zwraca { kg, date, last_kg, ageDays } albo null, gdy brak pomiarów.
export function currentBodyWeight(entries, settings, todayKey = dayKey(new Date())) {
  if (!entries?.length) return null;
  const last = buildSeries(entries, settings).at(-1);
  if (!last) return null;
  return {
    kg: round1(last.trend),
    date: last.date,
    last_kg: last.value,
    ageDays: dayNumber(todayKey) - dayNumber(last.date),
  };
}

// Dociążenie [kg] → { total_kg, pct_bw }
export function loadFromAdded(bodyKg, addedKg) {
  if (!(bodyKg > 0)) return null;
  const total = bodyKg + (Number(addedKg) || 0);
  return { total_kg: round1(total), pct_bw: Math.round((total / bodyKg) * 100) };
}

// Docelowy % MC → dociążenie [kg] zaokrąglone do kroku odważników.
export function addedFromPct(bodyKg, pct, step = LOAD_STEP_KG) {
  if (!(bodyKg > 0) || !(pct > 0)) return null;
  return roundTo(bodyKg * (pct / 100 - 1), step);
}

// Zapis obciążenia w sesji dziennika: masa ciała z dnia treningu zostaje „zamrożona”,
// więc historia nie zmienia się, gdy później zmieni się trend.
export function hangLoadRecord(bodyKg, addedKg) {
  const l = loadFromAdded(bodyKg, addedKg);
  if (!l) return null;
  return { body_weight_kg: round1(bodyKg), added_kg: round1(Number(addedKg) || 0), total_kg: l.total_kg, pct_bw: l.pct_bw };
}

// Tekst dociążenia: „+5 kg”, „−20 kg”, „bez dociążenia”.
export function fmtAdded(addedKg) {
  const a = round1(Number(addedKg) || 0);
  if (a === 0) return 'bez dociążenia';
  return `${a > 0 ? '+' : '−'}${String(Math.abs(a)).replace('.', ',')} kg`;
}

// ---------- Siła względna w czasie (MC-52) ----------

// Protokoły z zapisanym obciążeniem, od ostatnio używanego: [{ id, name, count, last }]
export function strengthProtocols(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!s.hang_load || !s.preset_id) continue;
    const p = map.get(s.preset_id) || { id: s.preset_id, name: s.preset_name || 'Protokół', count: 0, last: '' };
    p.count++;
    if (s.date >= p.last) { p.last = s.date; if (s.preset_name) p.name = s.preset_name; }
    map.set(s.preset_id, p);
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

// Seria siły względnej dla protokołu: jeden punkt na dzień (najwyższy % MC tego dnia).
// Masa ciała z sesji; gdy jej brak (trening bez pomiarów), bierzemy trend wagi z dnia treningu.
export function strengthSeries(sessions, presetId, weightSeries = []) {
  const byDay = new Map();
  for (const s of sessions) {
    const l = s.hang_load;
    if (!l || s.preset_id !== presetId) continue;
    const bw = l.body_weight_kg ?? trendAt(weightSeries, s.date)?.trend ?? null;
    if (!(bw > 0)) continue;
    const added = Number(l.added_kg) || 0;
    const point = {
      date: s.date,
      day: dayNumber(s.date),
      pct_bw: Math.round(((bw + added) / bw) * 1000) / 10,
      added_kg: added,
      body_weight_kg: round1(bw),
      total_kg: round1(bw + added),
    };
    const prev = byDay.get(s.date);
    if (!prev || point.pct_bw > prev.pct_bw) byDay.set(s.date, point);
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

// ---------- Serie (logowanie w timerze) ----------
// Seria: { set, reps_planned, reps_done, added_kg }

export function initSets(count, reps, addedKg) {
  return Array.from({ length: count }, (_, i) => ({
    set: i + 1, reps_planned: reps, reps_done: null, added_kg: Number(addedKg) || 0,
  }));
}

// Najcięższa seria z choć jednym ukończonym powtórzeniem (przy remisie – więcej powtórzeń).
export function bestSet(sets) {
  return sets
    .filter((s) => s.reps_done > 0)
    .reduce((b, s) => (!b || s.added_kg > b.added_kg || (s.added_kg === b.added_kg && s.reps_done > b.reps_done) ? s : b), null);
}

// Obciążenie sesji do dziennika i wykresu: z najcięższej ukończonej serii.
export function sessionHangLoad(sets, bodyKg) {
  const best = bestSet(sets);
  if (!best) return null;
  return bodyKg > 0
    ? hangLoadRecord(bodyKg, best.added_kg)
    : { body_weight_kg: null, added_kg: round1(best.added_kg), total_kg: null, pct_bw: null };
}

// „6/6 · 6/6 · 5/6 (+8 kg)” albo, gdy dociążenie się zmieniało: „6/6 +8 kg · 5/6 +10 kg”.
export function fmtSets(sets) {
  if (!sets?.length) return '';
  const same = sets.every((s) => s.added_kg === sets[0].added_kg);
  const reps = (s) => `${s.reps_done ?? 0}/${s.reps_planned}`;
  return same
    ? `${sets.map(reps).join(' · ')} (${fmtAdded(sets[0].added_kg)})`
    : sets.map((s) => `${reps(s)} ${fmtAdded(s.added_kg)}`).join(' · ');
}
