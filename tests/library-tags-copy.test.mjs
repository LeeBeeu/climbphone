// „Kopiuj jako własne” zachowuje typ i cele oryginału (także te z listy wyjątków). Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyAsCustom, byId, exType, exGoals } from '../app/js/library-calc.js';

test('kopia ćwiczenia zachowuje typ i cele', () => {
  const c = copyAsCustom(byId('squat'), 'own-x');
  assert.equal(exType(c), 'conditioning');
  assert.deepEqual(exGoals(c), ['legs']);
});
