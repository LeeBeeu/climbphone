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
  assert.equal(planItemText(max), 'Timer: Max zwisy – półzaciąg 10 s – 5–6 zwisów 10 s, 3 min przerwy, listwa 20 mm');
  assert.deepEqual(timerPresetFrom(max), {
    id: 'lib-maxhang_half', name: 'Max zwisy – półzaciąg 10 s', prep: 10, hang: 10, rest: 0, reps: 1, sets: 6, setRest: 180,
    load_mode: 'kg', added_kg: 0, load_pct: 100, edge_mm: 20,
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

test('własne ćwiczenia: walidacja i „Kopiuj jako własne”', async () => {
  const { validateExercise, copyAsCustom, allExercises, findExercise } = await import('../app/js/library-calc.js');
  const base = { id: 'own-1', name: 'Zwisy na kamieniu', cat: 'fingers', level: 2, equip: ['board'], kind: 'sets',
    dose: '3 × 5', how: 'Zwisy na naturalnym chwycie', sets: { sets: 3, reps: 5, bodyweight: true }, custom: true };
  assert.equal(validateExercise(base, LIBRARY), null);
  assert.match(validateExercise({ ...base, name: ' ' }), /nazwę/);
  assert.match(validateExercise({ ...base, name: 'podciaganie' }, LIBRARY), /już jest/, 'nazwa bez względu na polskie znaki');
  assert.equal(validateExercise({ ...base, name: 'Podciąganie', id: 'pullups' }, LIBRARY), null, 'ta sama pozycja przy edycji');
  assert.match(validateExercise({ ...base, equip: [] }), /sprzęt/);
  assert.match(validateExercise({ ...base, sets: { sets: 0, reps: 5 } }), /serii/);
  assert.match(validateExercise({ ...base, kind: 'timer', timer: { prep: 0, hang: 0, rest: 0, reps: 1, sets: 1, setRest: 0 } }), /timera/);
  const copy = copyAsCustom(byId('maxhang_half'), 'own-2');
  assert.equal(copy.name, 'Max zwisy – półzaciąg 10 s (moje)');
  assert.equal(copy.custom, true);
  assert.deepEqual(copy.timer, byId('maxhang_half').timer);
  copy.timer.hang = 7;
  assert.equal(byId('maxhang_half').timer.hang, 10, 'kopia nie zmienia biblioteki');
  assert.equal(allExercises([copy]).length, LIBRARY.length + 1);
  assert.equal(findExercise('own-2', [copy]).name, copy.name);
});

test('treningi: gotowe zestawy, plan, dziennik, usuwanie ćwiczenia', async () => {
  const { allWorkouts, workoutExercises, workoutPlanItems, workoutPoolItem, workoutJournal, removeFromWorkouts } =
    await import('../app/js/library-calc.js');
  const ids = new Set(LIBRARY.map((e) => e.id));
  const ws = allWorkouts([]);
  assert.ok(ws.length >= 6 && ws.every((w) => w.builtin && w.items.length >= 4));
  assert.ok(ws.every((w) => w.items.every((i) => ids.has(i))), 'gotowe treningi odwołują się do istniejących ćwiczeń');
  const own = { id: 'wk-1', name: 'Moja sesja', desc: '', items: ['pullups', 'own-x', 'arc'] };
  assert.deepEqual(workoutExercises(own, LIBRARY).map((e) => e.id), ['pullups', 'arc'], 'brakujące pominięte');
  assert.deepEqual(workoutPlanItems(own, LIBRARY), ['Podciąganie – 4 × 5–8', 'ARC – ciągłe wspinanie – 2–3 × 20–30 min']);
  assert.equal(workoutPoolItem(own), 'Trening: Moja sesja');
  const j = workoutJournal(own, LIBRARY);
  assert.deepEqual(j.exercises.map((e) => e.name), ['Podciąganie']);
  assert.equal(j.notes, 'Trening: Moja sesja');
  assert.deepEqual(j.items, [{ text: 'ARC – ciągłe wspinanie – 2–3 × 20–30 min', done: true }]);
  assert.deepEqual(removeFromWorkouts([own], 'pullups')[0].items, ['own-x', 'arc']);
});

test('jednostronne, piramidy i szerokość listwy', async () => {
  const { parseScheme, validateExercise } = await import('../app/js/library-calc.js');
  const pyr = journalExerciseFrom(byId('pullup_pyramid'));
  assert.deepEqual(pyr.sets.map((s) => s.reps), [1, 2, 3, 4, 3, 2, 1]);
  assert.equal(planItemText(byId('maxhang_half')), 'Timer: Max zwisy – półzaciąg 10 s – 5–6 zwisów 10 s, 3 min przerwy, listwa 20 mm');
  assert.equal(timerPresetFrom(byId('maxhang_half')).edge_mm, 20);
  assert.equal(planItemText(byId('pistol')), 'Przysiad na jednej nodze – 3 × 5 na nogę', 'dawka mówi już o stronie');
  assert.equal(planItemText(byId('external_rotation')), 'Rotacja zewnętrzna z gumą – 3 × 15 (na stronę)');
  assert.deepEqual(parseScheme('5, 4,3 2'), [5, 4, 3, 2]);
  assert.deepEqual(parseScheme('1-2-3'), [1, 2, 3]);
  assert.equal(parseScheme(''), null);
  const base = { id: 'own-9', name: 'Test', cat: 'strength', level: 1, equip: ['bar'], kind: 'sets', dose: 'x', how: 'y',
    sets: { sets: 3, reps: 5, bodyweight: true } };
  assert.equal(validateExercise({ ...base, sets: { ...base.sets, scheme: [5, 4, 3] } }), null);
  assert.match(validateExercise({ ...base, sets: { ...base.sets, scheme: [5, 0] } }), /Powtórzenia w seriach/);
  assert.match(validateExercise({ ...base, edge_mm: 2 }), /listwy/);
});
