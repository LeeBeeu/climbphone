// Testy kalendarza treningów. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, weekDays, shiftMonth, sessionsByDate, weekStatus, addDays } from '../app/js/calendar-calc.js';

test('siatka miesiąca od poniedziałku, z dniami sąsiednich miesięcy', () => {
  const g = monthGrid(2026, 11); // listopad 2026: 1.11 to niedziela
  assert.equal(g[0].week, '2026-W44');
  assert.equal(g[0].days[0], '2026-10-26');
  assert.equal(g[0].days[6], '2026-11-01');
  assert.equal(g.at(-1).days.at(-1), '2026-12-06');
  assert.equal(g.length, 6);
  assert.ok(g.every((w) => w.days.length === 7));
  assert.equal(monthGrid(2027, 2).length, 4, 'luty 2027 zaczyna się w poniedziałek i ma 28 dni');
});

test('tydzień, przesuwanie miesięcy i dni', () => {
  assert.deepEqual(weekDays('2026-W47'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('sesje według dnia i status tygodnia z planu', () => {
  const m = sessionsByDate([{ date: '2026-11-17' }, { date: '2026-11-17' }, { date: '2026-11-18' }]);
  assert.equal(m['2026-11-17'].length, 2);
  const today = '2026-11-18';
  assert.equal(weekStatus(85, '2026-W46', today), 'done');
  assert.equal(weekStatus(40, '2026-W46', today), 'partial');
  assert.equal(weekStatus(0, '2026-W46', today), 'missed');
  assert.equal(weekStatus(0, '2026-W47', today), null, 'bieżący tydzień jeszcze trwa');
  assert.equal(weekStatus(50, '2026-W48', today), null, 'przyszłość');
  assert.equal(weekStatus(null, '2026-W46', today), null);
});

test('wykonanie planu w tygodniu liczone od pierwszego użycia planu', async () => {
  const { planWeekPct } = await import('../app/js/calendar-calc.js');
  const plans = [{ id: 'p', days: [{ name: 'D', items: ['A', 'B'] }] }];
  const checks = { 'p|2026-W45': { '0:A': true }, 'p|2026-W47': { '0:A': true, '0:B': true } };
  assert.equal(planWeekPct(plans, checks, '2026-W44'), null, 'przed pierwszym użyciem');
  assert.equal(planWeekPct(plans, checks, '2026-W45'), 50);
  assert.equal(planWeekPct(plans, checks, '2026-W46'), 0, 'po pierwszym użyciu pusty tydzień = 0%');
  assert.equal(planWeekPct(plans, checks, '2026-W47'), 100);
  assert.equal(planWeekPct([], {}, '2026-W47'), null);
});
