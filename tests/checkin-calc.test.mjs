// Testy tygodniowego check-inu. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestion, isComplete, RULES } from '../app/js/checkin-calc.js';

const c = (load, wellbeing, motivation, readiness = 'normal') => ({ load, wellbeing, motivation, readiness });

test('sugestia: gotowość ma pierwszeństwo (kontuzja, odpoczynek, deload)', () => {
  assert.equal(suggestion(c(1, 5, 5, 'injury')).id, 'injury');
  assert.equal(suggestion(c(1, 5, 5, 'rest')).action, 'decrease');
  assert.equal(suggestion(c(2, 5, 5, 'deload')).id, 'deload');
});

test('sugestia: zmęczenie i bardzo ciężki tydzień → zmniejsz', () => {
  assert.equal(suggestion(c(3, 2, 5)).id, 'low');
  assert.equal(suggestion(c(3, 4, 1)).id, 'low');
  assert.equal(suggestion(c(5, 4, 4)).id, 'heavy');
});

test('sugestia: zwiększ tylko przy lekkim tygodniu, dobrej formie i zrobionym planie', () => {
  assert.equal(suggestion(c(3, 4, 4)).action, 'increase', 'bez planów nie blokujemy');
  assert.equal(suggestion(c(3, 4, 4), 85).action, 'increase');
  assert.equal(suggestion(c(3, 4, 4), 60).action, 'keep', 'plan niezrobiony');
  assert.equal(suggestion(c(4, 5, 5)).action, 'keep', 'ciężki tydzień (4)');
  assert.equal(suggestion(c(2, 3, 5)).action, 'keep', 'samopoczucie 3');
});

test('kompletność check-inu i jawne reguły', () => {
  assert.equal(isComplete(c(3, 4, 4)), true);
  assert.equal(isComplete({ load: 3, wellbeing: 4, readiness: 'normal' }), false);
  assert.equal(isComplete(c(3, 4, 4, 'x')), false);
  assert.equal(RULES.at(-1).id, 'keep');
});
