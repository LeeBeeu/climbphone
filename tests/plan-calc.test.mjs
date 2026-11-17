// Testy planów: tygodnie ISO, fazy, kopiowanie tygodnia, objętość. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekKeyOf, mondayOf, shiftWeek, weekRange, effectiveDays, hasWeekOverride, planProgress, fillBlock,
  copyPreviousWeek, weekVolume, phaseLabel,
} from '../app/js/plan-calc.js';

test('tygodnie ISO: klucz, poniedziałek, przesuwanie przez granicę roku', () => {
  assert.equal(weekKeyOf('2026-11-17'), '2026-W47');
  assert.equal(weekKeyOf('2027-01-01'), '2026-W53');   // piątek 1.01.2027 należy do ostatniego tygodnia 2026
  assert.equal(mondayOf('2026-W47'), '2026-11-16');
  assert.equal(mondayOf('2027-W01'), '2027-01-04');
  assert.equal(shiftWeek('2026-W53', 1), '2027-W01');
  assert.equal(shiftWeek('2026-W47', -1), '2026-W46');
  assert.deepEqual(weekRange('2026-W47'), { start: '2026-11-16', end: '2026-11-22' });
});

const PLAN = { id: 'p', days: [{ name: 'D1', items: ['A', 'B'] }, { name: 'D2', items: ['C'] }] };

test('plan tygodnia: szablon albo własny, postęp odhaczania', () => {
  const plan = { ...PLAN, weeks: { '2026-W47': { phase: 'base', days: [{ name: 'D1', items: ['X'] }] } } };
  assert.equal(effectiveDays(plan, '2026-W46'), plan.days);
  assert.equal(effectiveDays(plan, '2026-W47')[0].items[0], 'X');
  assert.equal(hasWeekOverride(plan, '2026-W47'), true);
  assert.deepEqual(planProgress(PLAN, { '0:A': true, '1:C': true }, '2026-W47'), { total: 3, done: 2, pct: 67 });
});

test('blok faz: mikrocykl 3:1 (co 4. tydzień deload)', () => {
  const weeks = fillBlock({ '2026-W48': { days: [] } }, '2026-W47', 'strength', 8, 4);
  const phases = Array.from({ length: 8 }, (_, i) => weeks[shiftWeek('2026-W47', i)].phase);
  assert.deepEqual(phases, ['strength', 'strength', 'strength', 'deload', 'strength', 'strength', 'strength', 'deload']);
  assert.deepEqual(weeks['2026-W48'].days, [], 'własny plan tygodnia zostaje');
  assert.equal(fillBlock({}, '2026-W47', 'base', 2, 0)['2026-W48'].phase, 'base');
  assert.equal(phaseLabel('deload'), 'Deload');
});

test('kopiuj poprzedni tydzień: faza i dni, niezależna kopia', () => {
  const plan = { ...PLAN, weeks: { '2026-W46': { phase: 'power', days: [{ name: 'D1', items: ['Y'] }] } } };
  const weeks = copyPreviousWeek(plan, '2026-W47');
  assert.equal(weeks['2026-W47'].phase, 'power');
  assert.deepEqual(weeks['2026-W47'].days, [{ name: 'D1', items: ['Y'] }]);
  weeks['2026-W47'].days[0].items.push('Z');
  assert.deepEqual(plan.weeks['2026-W46'].days[0].items, ['Y'], 'kopia nie zmienia poprzedniego tygodnia');
  assert.deepEqual(copyPreviousWeek(PLAN, '2026-W47')['2026-W47'].days, PLAN.days, 'bez własnego planu kopiuje szablon');
});

test('objętość tygodnia z dziennika', () => {
  const sessions = [
    { date: '2026-11-15', duration: 60 }, // niedziela poprzedniego tygodnia
    { date: '2026-11-16', duration: 90 },
    { date: '2026-11-22', duration: 45 },
  ];
  assert.deepEqual(weekVolume(sessions, '2026-W47'), { count: 2, minutes: 135 });
});
