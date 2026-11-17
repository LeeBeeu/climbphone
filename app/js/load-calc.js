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

// Masa ciała w danym dniu (MC-50): trend z dnia (ostatni pomiar tego dnia albo wcześniej),
// a bez pomiarów – masa wpisana ręcznie. Zaokrąglona do 0,1 kg albo null.
export function bodyWeightOn(entries, settings, date, manualKg = null) {
  const t = entries?.length ? trendAt(buildSeries(entries, settings), date) : null;
  if (t) return round1(t.trend);
  return Number(manualKg) > 0 ? Number(manualKg) : null;
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

// Klucz ćwiczenia poza timerem (protokoły timera mają klucz = preset_id).
export const exKey = (name) => `ex:${String(name).trim().toLowerCase()}`;

// Najcięższa seria ćwiczenia z co najmniej jednym powtórzeniem (przy remisie – więcej powtórzeń).
export function bestExSet(sets) {
  return (sets || [])
    .filter((s) => s.reps > 0)
    .reduce((b, s) => (!b || s.added_kg > b.added_kg || (s.added_kg === b.added_kg && s.reps > b.reps) ? s : b), null);
}

// Wpisy siły względnej z sesji: zwisy z timera i ćwiczenia z masą ciała (np. podciąganie z dociążeniem).
function strengthEntries(sessions) {
  const out = [];
  for (const s of sessions) {
    if (s.hang_load && s.preset_id) {
      out.push({ key: s.preset_id, name: s.preset_name || null, date: s.date,
        added_kg: s.hang_load.added_kg, body_weight_kg: s.hang_load.body_weight_kg, reps: null });
    }
    for (const ex of s.exercises || []) {
      const best = ex.bodyweight ? bestExSet(ex.sets) : null;
      if (!best) continue;
      out.push({ key: exKey(ex.name), name: ex.name, date: s.date,
        added_kg: best.added_kg, body_weight_kg: s.body_weight_kg ?? null, reps: best.reps });
    }
  }
  return out;
}

// Protokoły i ćwiczenia z zapisanym obciążeniem, od ostatnio używanego: [{ id, name, count, last }].
// `extra` – gotowe wpisy z innych źródeł (np. testy siły: testStrengthEntries()).
export function strengthProtocols(sessions, extra = []) {
  const map = new Map();
  for (const e of [...strengthEntries(sessions), ...extra]) {
    const p = map.get(e.key) || { id: e.key, name: e.name || 'Protokół', count: 0, last: '' };
    p.count++;
    if (e.date >= p.last) { p.last = e.date; if (e.name) p.name = e.name; }
    map.set(e.key, p);
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

// Seria siły względnej dla protokołu albo ćwiczenia: jeden punkt na dzień (najwyższy % MC tego dnia).
// Masa ciała z sesji; gdy jej brak (trening bez pomiarów), bierzemy trend wagi z dnia treningu.
export function strengthSeries(sessions, key, weightSeries = [], extra = []) {
  const byDay = new Map();
  for (const e of [...strengthEntries(sessions), ...extra]) {
    if (e.key !== key) continue;
    const bw = e.body_weight_kg ?? trendAt(weightSeries, e.date)?.trend ?? null;
    if (!(bw > 0)) continue;
    const added = Number(e.added_kg) || 0;
    const point = {
      date: e.date,
      day: dayNumber(e.date),
      pct_bw: Math.round(((bw + added) / bw) * 1000) / 10,
      added_kg: added,
      body_weight_kg: round1(bw),
      total_kg: round1(bw + added),
      reps: e.reps,
    };
    const prev = byDay.get(e.date);
    if (!prev || point.pct_bw > prev.pct_bw) byDay.set(e.date, point);
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

// ---------- Wstępne wypełnienie i progresja z poprzedniej sesji ----------
export const PROGRESS_STEP_KG = 0.5;
export const HOLD_RATIO = 0.75; // ≥ 75% powtórzeń: zostajemy przy obciążeniu; mniej: lżej

// Na podstawie ostatniej sesji z protokołem:
//   base_kg  – dociążenie najcięższej ukończonej serii (start następnego treningu),
//   verdict  – 'up' (wszystkie powtórzenia), 'hold' (≥ 75%), 'down' (< 75%), null (brak serii),
//   suggest_kg – podpowiedź na dziś.
export function progression(session, step = PROGRESS_STEP_KG) {
  const l = session?.hang_load;
  if (!l) return null;
  const base = Number(l.added_kg) || 0;
  const sets = session.hang_sets || [];
  const planned = sets.reduce((t, s) => t + s.reps_planned, 0);
  const done = sets.reduce((t, s) => t + (s.reps_done || 0), 0);
  // Ocena tylko serii z obciążeniem bazowym: cięższa nieudana próba nie obniża podpowiedzi.
  const atBase = sets.filter((s) => s.added_kg === base);
  const pBase = atBase.reduce((t, s) => t + s.reps_planned, 0);
  const dBase = atBase.reduce((t, s) => t + (s.reps_done || 0), 0);
  let verdict = null;
  if (pBase > 0) verdict = dBase >= pBase ? 'up' : dBase / pBase >= HOLD_RATIO ? 'hold' : 'down';
  const delta = { up: step, hold: 0, down: -step }[verdict] ?? 0;
  return {
    base_kg: base, verdict, suggest_kg: roundTo(base + delta, step),
    done, planned, base_done: dBase, base_planned: pBase, date: session.date,
  };
}
