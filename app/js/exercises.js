// Ćwiczenia poza timerem (podciąganie z obciążeniem, dipy, martwy ciąg…). Czyste funkcje, bez DOM
// (testy: tests/exercises.test.mjs).
//
// Ćwiczenie w sesji dziennika: { name, bodyweight, sets: [{ reps, added_kg, effort }] } (effort 1–5 albo null)
//   bodyweight = true  → added_kg to dociążenie do masy ciała (ujemne = guma / odciążenie), liczymy % MC
//   bodyweight = false → added_kg to ciężar sztangi / hantli w kg
// Sesja z ćwiczeniem z masą ciała zapisuje body_weight_kg = trend wagi z dnia treningu (MC-50).
import { exKey, bestExSet, fmtAdded, effortSuffix } from './load-calc.js';
import { LIBRARY, CATEGORIES } from './library-data.js';

export { exKey, bestExSet };

export const EXERCISES = [
  { name: 'Podciąganie', bodyweight: true },
  { name: 'Podciąganie na jednej ręce', bodyweight: true },
  { name: 'Dipy', bodyweight: true },
  { name: 'Pompki', bodyweight: true },
  { name: 'Martwy ciąg', bodyweight: false },
  { name: 'Przysiad', bodyweight: false },
  { name: 'Wyciskanie nad głowę', bodyweight: false },
];

const kgText = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

// Katalog: wbudowane + własne nazwy z dziennika (bez duplikatów, bez względu na wielkość liter).
export function exerciseCatalog(sessions, custom = []) {
  const map = new Map(EXERCISES.map((e) => [exKey(e.name), { ...e }]));
  // Ćwiczenia „serie × powtórzenia” z biblioteki (app/js/library-data.js) i własne (state.customExercises).
  for (const e of [...LIBRARY, ...custom]) {
    if (e.kind === 'sets' && !map.has(exKey(e.name))) map.set(exKey(e.name), { name: e.name, bodyweight: e.sets.bodyweight });
  }
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    for (const ex of s.exercises || []) {
      const k = exKey(ex.name);
      if (!map.has(k)) map.set(k, { name: ex.name, bodyweight: !!ex.bodyweight });
    }
  }
  return [...map.values()];
}

// Lista „+ Dodaj ćwiczenie” w dzienniku: cała biblioteka (z własnymi) w kategoriach, a na początku
// nazwy spoza biblioteki, które już są w dzienniku. Ćwiczenia bez serii (timer, czas, na ścianie) trafiają do notatki.
// Zwraca [{ label, options: [{ value, label }] }]; value: „lib:<id>” albo „name:<nazwa>”.
export function journalPickerGroups(sessions, custom = []) {
  const all = [...LIBRARY, ...custom];
  const known = new Set(all.map((e) => exKey(e.name)));
  const own = [];
  const seen = new Set();
  for (const s of [...sessions].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const ex of s.exercises || []) {
      const k = exKey(ex.name);
      if (!known.has(k) && !seen.has(k)) { seen.add(k); own.push(ex.name); }
    }
  }
  for (const e of EXERCISES) if (!known.has(exKey(e.name)) && !seen.has(exKey(e.name))) { seen.add(exKey(e.name)); own.push(e.name); }
  const groups = own.length ? [{ label: 'Z dziennika i inne', options: own.map((n) => ({ value: `name:${n}`, label: n })) }] : [];
  for (const c of CATEGORIES) {
    const list = all.filter((e) => e.cat === c.id);
    if (!list.length) continue;
    groups.push({
      label: c.label,
      options: list.map((e) => ({
        value: `lib:${e.id}`,
        label: `${e.name}${e.kind === 'sets' ? (e.sets.bodyweight ? '' : ' (ciężar)') : ' · do notatki'}`,
      })),
    });
  }
  return groups;
}

// Ostatnie wykonanie ćwiczenia (opcjonalnie z pominięciem edytowanej sesji): { date, exercise } albo null.
export function lastExercise(sessions, name, skipId = null) {
  const k = exKey(name);
  let found = null;
  for (const s of sessions) {
    if (s.id === skipId) continue;
    const ex = (s.exercises || []).find((e) => exKey(e.name) === k && e.sets?.length);
    if (!ex) continue;
    if (!found || s.date > found.date || (s.date === found.date && (s.created || 0) > (found.created || 0))) {
      found = { date: s.date, created: s.created, exercise: ex };
    }
  }
  return found;
}

// Liczby z formularza: serie z co najmniej 1 powtórzeniem; ćwiczenia bez serii odpadają.
export function cleanExercises(list) {
  return (list || [])
    .map((ex) => ({
      name: String(ex.name).trim(),
      bodyweight: !!ex.bodyweight,
      sets: (ex.sets || [])
        .map((s) => ({
          reps: Math.round(Number(s.reps)),
          added_kg: Math.round((Number(s.added_kg) || 0) * 10) / 10,
          effort: s.effort >= 1 && s.effort <= 5 ? Math.round(s.effort) : null,
        }))
        .filter((s) => Number.isFinite(s.reps) && s.reps > 0),
    }))
    .filter((ex) => ex.name && ex.sets.length);
}

// % masy ciała dla serii ćwiczenia z masą ciała.
export function exPct(bodyKg, addedKg) {
  return bodyKg > 0 ? Math.round(((bodyKg + (Number(addedKg) || 0)) / bodyKg) * 100) : null;
}

// „2×5 +20 kg, 1×4 +20 kg” (sąsiednie identyczne serie łączone), dla ciężaru: „3×5 100 kg”.
export function fmtExSets(ex) {
  const groups = [];
  for (const s of ex.sets || []) {
    const g = groups.at(-1);
    if (g && g.reps === s.reps && g.added_kg === s.added_kg) g.n++;
    else groups.push({ n: 1, reps: s.reps, added_kg: s.added_kg });
  }
  const kg = (a) => (ex.bodyweight ? (a ? ` ${fmtAdded(a)}` : '') : ` ${kgText(a)} kg`);
  return groups.map((g) => `${g.n}×${g.reps}${kg(g.added_kg)}`).join(', ') + effortSuffix(ex.sets);
}
