// Testy biblioteki ćwiczeń: spójność danych, wyszukiwanie, przeliczenia. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, CATEGORIES, EQUIPMENT, LEVELS } from '../app/js/library-data.js';
import {
  fold, filterLibrary, planItemText, timerPresetFrom, journalExerciseFrom, byId, countByCat,
} from '../app/js/library-calc.js';
import { exerciseCatalog } from '../app/js/exercises.js';

test('dane: unikalne id, znane kategorie, sprzęt, poziomy i rodzaje', () => {
  assert.ok(LIBRARY.length >= 70, `ćwiczeń: ${LIBRARY.length}`);
  assert.equal(new Set(LIBRARY.map((e) => e.id)).size, LIBRARY.length, 'id unikalne');
  assert.equal(new Set(LIBRARY.map((e) => e.name.toLowerCase())).size, LIBRARY.length, 'nazwy unikalne');
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const e of LIBRARY) {
    assert.ok(cats.has(e.cat), `${e.id}: kategoria ${e.cat}`);
    assert.ok(e.level >= 1 && e.level < LEVELS.length, `${e.id}: poziom`);
    assert.ok(e.equip.length && e.equip.every((k) => k in EQUIPMENT), `${e.id}: sprzęt`);
    assert.ok(['timer', 'sets', 'time', 'climb'].includes(e.kind), `${e.id}: rodzaj`);
    assert.ok(e.dose && e.how && e.how.length > 30, `${e.id}: dawka i opis`);
  }
  assert.ok(Object.values(countByCat(LIBRARY)).every((n) => n >= 5), 'każda kategoria ma co najmniej 5 ćwiczeń');
});

test('dane: parametry timera i serii są poprawne', () => {
  for (const e of LIBRARY.filter((x) => x.kind === 'timer')) {
    const t = e.timer;
    assert.ok(t.hang > 0 && t.reps >= 1 && t.sets >= 1 && t.rest >= 0 && t.setRest >= 0 && t.prep >= 0, e.id);
    assert.ok(Object.values(t).every(Number.isInteger), `${e.id}: liczby całkowite`);
  }
  for (const e of LIBRARY.filter((x) => x.kind === 'sets')) {
    assert.ok(e.sets.sets >= 1 && e.sets.reps >= 1 && typeof e.sets.bodyweight === 'boolean', e.id);
  }
  // ćwiczenia z ryzykiem dla palców mają ostrzeżenie
  for (const id of ['maxhang_half', 'onearm_hang', 'campus_ladders', 'pockets_2f']) assert.ok(byId(id).caution, id);
});

test('wyszukiwanie bez polskich znaków i filtry', () => {
  assert.equal(fold('Siła PALCÓW, łokieć'), 'sila palcow, lokiec');
  assert.ok(filterLibrary(LIBRARY, { q: 'palcow' }).length > 5);
  assert.ok(filterLibrary(LIBRARY, { q: 'kampus drabinki' }).some((e) => e.id === 'campus_ladders'));
  assert.ok(filterLibrary(LIBRARY, { cat: 'core' }).every((e) => e.cat === 'core'));
  assert.ok(filterLibrary(LIBRARY, { equip: 'none' }).every((e) => e.equip.includes('none')));
  assert.ok(filterLibrary(LIBRARY, { level: 1 }).every((e) => e.level === 1));
  assert.equal(filterLibrary(LIBRARY, { q: 'zzzz' }).length, 0);
});

test('przeliczenia: wpis do planu, protokół timera, ćwiczenie do dziennika', () => {
  const max = byId('maxhang_half');
  assert.equal(planItemText(max), 'Timer: Max zwisy – półzaciąg 10 s – 5–6 zwisów 10 s, 3 min przerwy');
  assert.deepEqual(timerPresetFrom(max), {
    id: 'lib-maxhang_half', name: 'Max zwisy – półzaciąg 10 s', prep: 10, hang: 10, rest: 0, reps: 1, sets: 6, setRest: 180,
    load_mode: 'kg', added_kg: 0, load_pct: 100,
  });
  assert.equal(timerPresetFrom(byId('arc')), null);
  const ex = journalExerciseFrom(byId('weighted_pullups'));
  assert.equal(ex.bodyweight, true);
  assert.equal(ex.sets.length, 5);
  assert.deepEqual(ex.sets[0], { reps: 4, added_kg: 0, effort: null });
  assert.equal(journalExerciseFrom(byId('arc')), null);
});

test('katalog dziennika zawiera ćwiczenia z biblioteki (bez duplikatów)', () => {
  const cat = exerciseCatalog([]);
  const names = cat.map((e) => e.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.ok(cat.some((e) => e.name === 'Wiosłowanie w zwisie (pod drążkiem)'));
  assert.ok(cat.some((e) => e.name === 'Podciąganie'));
});
