// Testy siły (Etap 3). Czyste funkcje, bez DOM (testy: tests/tests-calc.test.mjs).
//
// Wynik testu (state.strengthTests): { id, test_id, date, value, body_weight_kg, edge_mm, grip, notes, created }
//   kind 'load'     → value = dociążenie [kg] utrzymane w teście; miarą jest % masy ciała (MC)
//   kind 'reps'     → value = liczba powtórzeń
//   kind 'time_s'   → value = sekundy;  kind 'time_min' → value = minuty
// Wszędzie „więcej = lepiej”. Rekord i zmiana liczone w obrębie tego samego wariantu (listwa + chwyt),
// bo wyniki na 20 mm półzaciągiem i 15 mm otwartym chwytem nie są porównywalne.
import { fmtAdded } from './load-calc.js';

export const GRIPS = ['półzaciąg', 'otwarty', 'pełny zaciąg'];

export const TESTS = [
  {
    id: 'max_hang_20', name: 'Max zwis 10 s – 20 mm', kind: 'load', edge: true, default_edge: 20,
    how: 'Rozgrzewka 15–20 min, potem 3–5 prób po 10 s z rosnącym dociążeniem i 3 min przerwy. '
      + 'Wynik to największe dociążenie utrzymane pełne 10 s (ujemne = odciążenie na bloczku).',
  },
  {
    id: 'max_pull_1rm', name: 'Podciągnięcie z obciążeniem (1 powt.)', kind: 'load',
    how: 'Rozgrzewka, potem pojedyncze podciągnięcia z rosnącym dociążeniem, 3 min przerwy. '
      + 'Wynik to największe dociążenie w pełnym podciągnięciu (broda nad drążkiem, pełny zwis na dole).',
  },
  {
    id: 'max_pullups', name: 'Max podciągnięć', kind: 'reps',
    how: 'Po rozgrzewce jedna seria do odmowy, bez dociążenia, pełny zakres ruchu. Wynik to liczba powtórzeń.',
  },
  {
    id: 'hang_time_20', name: 'Zwis na czas – 20 mm', kind: 'time_s', edge: true, default_edge: 20,
    how: 'Po rozgrzewce jeden zwis na masie ciała do odpadnięcia. Wynik to czas w sekundach.',
  },
  {
    id: 'arc_time', name: 'Czas ARC', kind: 'time_min',
    how: 'Ciągłe wspinanie w niskiej intensywności (lekkie pompowanie, da się rozmawiać) do momentu, '
      + 'gdy przedramiona przestają się regenerować. Wynik to czas w minutach.',
  },
];

export const testById = (id) => TESTS.find((t) => t.id === id) || null;

const VALUE_LABEL = { load: 'Dociążenie (kg)', reps: 'Powtórzenia', time_s: 'Czas (s)', time_min: 'Czas (min)' };
export const valueLabel = (def) => VALUE_LABEL[def.kind];
export const valueStep = (def) => (def.kind === 'load' ? 0.5 : def.kind === 'time_min' ? 0.5 : 1);

const num = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

// Wariant wyniku: listwa i chwyt (tylko testy na listwie).
export const variantKey = (def, r) => (def.edge ? `${r.edge_mm ?? def.default_edge}|${r.grip || GRIPS[0]}` : '');
export const variantLabel = (def, r) => (def.edge ? `${r.edge_mm ?? def.default_edge} mm, ${r.grip || GRIPS[0]}` : '');

// Miara do porównań: % MC dla testów z obciążeniem, w pozostałych sama wartość.
export function metric(def, r) {
  if (def.kind !== 'load') return Number(r.value);
  if (!(r.body_weight_kg > 0)) return null;
  return Math.round(((r.body_weight_kg + Number(r.value)) / r.body_weight_kg) * 1000) / 10;
}

export function fmtMetric(def, m) {
  if (m === null || m === undefined) return '–';
  return { load: `${Math.round(m)}% MC`, reps: `${num(m)} powt.`, time_s: `${num(m)} s`, time_min: `${num(m)} min` }[def.kind];
}

export function fmtValue(def, r) {
  if (def.kind !== 'load') return fmtMetric(def, Number(r.value));
  const m = metric(def, r);
  return `${fmtAdded(r.value)}${m !== null ? ` · ${Math.round(m)}% MC` : ''}`;
}

const byDate = (a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0);

// Historia testu (od najnowszego), z miarą, zmianą wobec poprzedniego wyniku i rekordem – w obrębie wariantu.
export function testHistory(results, def) {
  const prev = new Map(); // wariant → { last, best }
  const out = [];
  for (const r of results.filter((x) => x.test_id === def.id).sort(byDate)) {
    const v = variantKey(def, r);
    const m = metric(def, r);
    const p = prev.get(v);
    const delta = p && m !== null && p.last !== null ? Math.round((m - p.last) * 10) / 10 : null;
    const pr = m !== null && (!p || p.best === null || m > p.best);
    out.push({ ...r, metric: m, delta, pr, first: !p, variant: v });
    prev.set(v, { last: m ?? p?.last ?? null, best: Math.max(m ?? -Infinity, p?.best ?? -Infinity) });
  }
  for (const v of prev.values()) if (v.best === -Infinity) v.best = null;
  return out.reverse();
}

// Najlepszy wynik w wariancie (albo w ogóle, gdy wariant pominięty).
export function bestResult(history, variant = null) {
  return history
    .filter((r) => r.metric !== null && (variant === null || r.variant === variant))
    .reduce((b, r) => (!b || r.metric > b.metric ? r : b), null);
}

// Wpisy testów z obciążeniem na wykres siły względnej w zakładce Waga (klucz „test:<id>”).
export function testStrengthEntries(results) {
  return results
    .map((r) => ({ r, def: testById(r.test_id) }))
    .filter(({ def }) => def?.kind === 'load')
    .map(({ r, def }) => ({
      key: `test:${def.id}`, name: `Test: ${def.name}`, date: r.date,
      added_kg: Number(r.value), body_weight_kg: r.body_weight_kg ?? null, reps: null,
    }));
}
