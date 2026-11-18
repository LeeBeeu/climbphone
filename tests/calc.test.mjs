// Testy obliczeń aplikacji Rachunki. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  occursIn, dueDate, daysUntil, statusOf, monthItems, summary, overdueBefore,
  parseAmount, validateBill, shiftMonth, periodKey, paymentId,
} from '../app/js/calc.js';

const bill = (o) => ({ id: 'b', name: 'Woda', amount: 100, day: 10, every: 1, start: '2026-01', end: '', ...o });

test('płatność co miesiąc wypada od miesiąca startu', () => {
  assert.equal(occursIn(bill(), '2025-12'), false);
  assert.equal(occursIn(bill(), '2026-01'), true);
  assert.equal(occursIn(bill(), '2027-07'), true);
});

test('co 2 miesiące, co kwartał, raz w roku, jednorazowo', () => {
  const two = bill({ every: 2, start: '2026-01' });
  assert.deepEqual(['2026-01', '2026-02', '2026-03', '2026-12', '2027-01'].map((p) => occursIn(two, p)), [true, false, true, false, true]);
  const q = bill({ every: 3, start: '2026-03' });
  assert.deepEqual(['2026-03', '2026-06', '2026-07', '2027-03'].map((p) => occursIn(q, p)), [true, true, false, true]);
  const y = bill({ every: 12, start: '2026-05' });
  assert.deepEqual(['2026-05', '2027-04', '2027-05'].map((p) => occursIn(y, p)), [true, false, true]);
  const once = bill({ every: 0, start: '2026-05' });
  assert.deepEqual(['2026-05', '2026-06'].map((p) => occursIn(once, p)), [true, false]);
});

test('miesiąc zakończenia kończy płatność', () => {
  const b = bill({ end: '2026-03' });
  assert.equal(occursIn(b, '2026-03'), true);
  assert.equal(occursIn(b, '2026-04'), false);
});

test('termin 31 w lutym przesuwa się na ostatni dzień', () => {
  assert.equal(dueDate(bill({ day: 31 }), '2026-02').getDate(), 28);
  assert.equal(dueDate(bill({ day: 31 }), '2028-02').getDate(), 29);
  assert.equal(dueDate(bill({ day: 15 }), '2026-04').getDate(), 15);
});

test('dni do terminu i status', () => {
  const today = new Date(2026, 10, 18, 21, 30);
  assert.equal(daysUntil(new Date(2026, 10, 18), today), 0);
  assert.equal(daysUntil(new Date(2026, 10, 10), today), -8);
  assert.equal(statusOf(-1, false), 'late');
  assert.equal(statusOf(0, false), 'soon');
  assert.equal(statusOf(3, false), 'soon');
  assert.equal(statusOf(4, false), 'todo');
  assert.equal(statusOf(-5, true), 'paid');
});

test('pozycje miesiąca i podsumowanie', () => {
  const today = new Date(2026, 10, 18);
  const bills = [
    bill({ id: 'w', name: 'Woda', day: 10, amount: 150 }),
    bill({ id: 'p', name: 'Prąd', day: 20, amount: 200.5 }),
    bill({ id: 'c', name: 'Czynsz', day: 28, amount: 800 }),
    bill({ id: 'u', name: 'OC', day: 5, every: 12, start: '2026-03', amount: 900 }),
  ];
  const items = monthItems(bills, { p: { amount: 210 } }, '2026-11', today);
  assert.deepEqual(items.map((i) => [i.bill.id, i.status]), [['w', 'late'], ['p', 'paid'], ['c', 'todo']]);
  assert.deepEqual(summary(items), { total: 1150.5, paid: 210, left: 940.5, count: 3, paidCount: 1, lateCount: 1 });
});

test('zaległe z poprzednich miesięcy', () => {
  const today = new Date(2026, 10, 18);
  const bills = [bill({ id: 'w', start: '2026-09' })];
  const paid = new Set([paymentId('w', '2026-09')]);
  const out = overdueBefore(bills, paid, '2026-11', today);
  assert.deepEqual(out.map((o) => o.period), ['2026-10']);
});

test('płatność dodana dziś nie robi zaległości z miesięcy sprzed dodania', () => {
  const today = new Date(2026, 10, 18);
  const bills = [bill({ id: 'w', start: '2026-01', trackFrom: '2026-11' })];
  assert.deepEqual(overdueBefore(bills, new Set(), '2026-11', today), []);
  const later = overdueBefore(bills, new Set(), '2027-01', new Date(2027, 0, 20));
  assert.deepEqual(later.map((o) => o.period), ['2026-11', '2026-12']);
});

test('kwota z polskim zapisem', () => {
  assert.equal(parseAmount('1 234,50 zł'), 1234.5);
  assert.equal(parseAmount('120.456'), 120.46);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('abc'), 0);
  assert.equal(parseAmount('-5'), 0);
});

test('walidacja formularza', () => {
  assert.equal(validateBill({ name: ' ', start: '2026-01', day: 1, every: 1 }).error, 'Wpisz nazwę płatności.');
  assert.ok(validateBill({ name: 'X', start: '2026-01', day: 32, every: 1 }).error);
  assert.ok(validateBill({ name: 'X', start: '2026-05', end: '2026-01', day: 1, every: 1 }).error);
  const ok = validateBill({ name: ' Woda ', amount: '99,9', start: '2026-01', day: '10', every: '2', category: 'Media' });
  assert.deepEqual(ok.bill, { name: 'Woda', amount: 99.9, day: 10, every: 2, start: '2026-01', end: '', category: 'Media', note: '' });
});

test('przesuwanie miesięcy przez granicę roku', () => {
  assert.deepEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 });
  assert.equal(periodKey(2026, 0), '2026-01');
});
