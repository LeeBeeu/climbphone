// Testy profilu: najlepsze wyceny, historia rekordów, BMI. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestGrade, gradeMilestones, bmi, systemLabel } from '../app/js/profile-calc.js';

const r = (grade, style, date, name = '') => ({ kind: 'route', system: 'french', grade, style, date, name });
const ASC = [
  r('6c', 'OS', '2024-05-01'), r('7a', 'RP', '2024-06-01', 'A'), r('7a+', 'FL', '2025-04-01'),
  r('7b', 'RP', '2025-09-01', 'B'), r('7c', 'GO', '2026-01-01'), r('7a', 'OS', '2026-03-01'),
  { kind: 'boulder', system: 'font', grade: '7A', style: 'FL', date: '2026-02-01' },
];

test('najlepsze wyceny w grupach stylów i od daty', () => {
  assert.deepEqual(bestGrade(ASC, 'route', 'max'), { grade: '7b', date: '2025-09-01', name: 'B' });
  assert.equal(bestGrade(ASC, 'route', 'flash').grade, '7a+');
  assert.equal(bestGrade(ASC, 'route', 'os').grade, '7a');
  assert.equal(bestGrade(ASC, 'route', 'max', '2026-01-01').grade, '7a', 'ostatnie 12 miesięcy');
  assert.equal(bestGrade(ASC, 'boulder', 'max').grade, '7A');
  assert.equal(bestGrade([], 'route', 'max'), null);
  assert.equal(systemLabel(ASC, 'route'), 'Francuska');
});

test('historia rekordów: kolejne podniesienia najlepszej wyceny', () => {
  assert.deepEqual(gradeMilestones(ASC, 'route').map((m) => `${m.date} ${m.grade}`),
    ['2024-05-01 6c', '2024-06-01 7a', '2025-04-01 7a+', '2025-09-01 7b']);
  assert.deepEqual(gradeMilestones(ASC, 'route', 'os').map((m) => m.grade), ['6c', '7a']);
});

test('BMI', () => {
  assert.equal(bmi(80.8, 180), 24.9);
  assert.equal(bmi(80, null), null);
  assert.equal(bmi(80, 50), null, 'wzrost poza zakresem');
});
