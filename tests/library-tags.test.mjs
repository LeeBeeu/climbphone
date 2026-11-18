// Testy typu i celu ćwiczeń w bibliotece. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../app/js/library-data.js';
import { TYPE_OVERRIDES, GOAL_OVERRIDES } from '../app/js/library-tags.js';
import { exType, exGoals, filterLibrary, byId, TYPES, GOALS, validateExercise } from '../app/js/library-calc.js';

test('każde ćwiczenie ma poprawny typ i co najmniej jeden cel', () => {
  const types = new Set(TYPES.map((t) => t.id));
  const goals = new Set(GOALS.map((g) => g.id));
  for (const e of LIBRARY) {
    assert.ok(types.has(exType(e)), `${e.id}: typ`);
    assert.ok(exGoals(e).length && exGoals(e).every((g) => goals.has(g)), `${e.id}: cele`);
  }
  const ids = new Set(LIBRARY.map((e) => e.id));
  assert.ok([...Object.keys(TYPE_OVERRIDES), ...Object.keys(GOAL_OVERRIDES)].every((id) => ids.has(id)), 'wyjątki dotyczą istniejących ćwiczeń');
});

test('domyślne z kategorii, wyjątki i własne pola', () => {
  assert.equal(exType(byId('maxhang_half')), 'strength_power');
  assert.deepEqual(exGoals(byId('maxhang_half')), ['fingers']);
  assert.deepEqual(exGoals(byId('squat')), ['legs']);
  assert.equal(exType(byId('density_hangs')), 'endurance');
  assert.equal(exType({ cat: 'core', type: 'technique' }), 'technique', 'własne pole ma pierwszeństwo');
  assert.deepEqual(exGoals({ cat: 'core', goals: ['legs'] }), ['legs']);
});

test('filtry i wyszukiwanie po typie i celu; walidacja', () => {
  assert.ok(filterLibrary(LIBRARY, { type: 'endurance' }).every((e) => exType(e) === 'endurance'));
  assert.ok(filterLibrary(LIBRARY, { goal: 'legs' }).some((e) => e.id === 'pistol'));
  assert.ok(filterLibrary(LIBRARY, { q: 'wydolnosc' }).some((e) => e.id === 'arc'), 'wyszukiwanie po celu');
  const base = { id: 'own-1', name: 'X', cat: 'core', level: 1, equip: ['none'], kind: 'time', dose: 'd', how: 'h' };
  assert.equal(validateExercise({ ...base, type: 'conditioning', goals: ['core'] }), null);
  assert.match(validateExercise({ ...base, type: 'zzz' }), /typ/);
  assert.match(validateExercise({ ...base, goals: ['zzz'] }), /cel/);
});
