// Testy dodatków modułu wagi: statystyki, zmiany miesięczne, okresy, utrzymanie. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeStats, monthlyChanges, periodsInWindow, periodNames, validatePeriod, periodChange, maintenance,
} from '../app/js/weight-stats.js';
import { dayNumber, keyFromDayNumber } from '../app/js/weight-calc.js';

// Seria dzienna: trend spada o 0,05 kg dziennie od 80 kg, od 1.09.2026 przez 78 dni (do 17.11).
const start = dayNumber('2026-09-01');
const SERIES = Array.from({ length: 78 }, (_, i) => ({ day: start + i, date: keyFromDayNumber(start + i), value: 80, trend: 80 - 0.05 * i }));

test('statystyki zmian: tydzień, miesiąc, od początku (kg i %)', () => {
  const s = changeStats(SERIES);
  assert.deepEqual([s.week.kg, s.month.kg, s.all.kg], [-0.35, -1.5, -3.85]);
  assert.equal(s.all.pct, -4.81);
  assert.equal(s.year, null, 'rok: brak, gdy historia krótsza niż rok (nie udajemy pełnego roku)');
  assert.deepEqual(changeStats([]), { week: null, month: null, year: null, all: null });
});

test('zmiany miesięczne: koniec miesiąca do końca poprzedniego', () => {
  const m = monthlyChanges(SERIES);
  // wrzesień nie ma końca sierpnia → pominięty; październik: 31.10 vs 30.09; listopad: 17.11 vs 31.10
  assert.deepEqual(m.map((x) => x.month), ['2026-10', '2026-11']);
  assert.equal(m[0].change, -1.55);
  assert.equal(m[1].change, -0.85);
});

test('okresy: okno wykresu, nazwy, walidacja, zmiana w okresie', () => {
  const periods = [
    { id: 'a', name: 'Redukcja', start: '2026-09-10', end: '2026-10-10' },
    { id: 'b', name: 'Blok Chulilla', start: '2026-11-01', end: null },
    { id: 'c', name: 'Redukcja', start: '2025-01-01', end: '2025-02-01' },
  ];
  const w = periodsInWindow(periods, dayNumber('2026-10-01'), dayNumber('2026-11-17'), '2026-11-17');
  assert.deepEqual(w.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(periodNames(periods), ['Blok Chulilla', 'Redukcja']);
  assert.equal(validatePeriod({ name: 'x', start: '2026-11-02', end: '2026-11-01' }), 'Koniec nie może być przed początkiem');
  assert.equal(validatePeriod({ name: ' ', start: '2026-11-02' }), 'Podaj nazwę okresu');
  assert.equal(validatePeriod({ name: 'x', start: '2026-11-02', end: null }), null);
  assert.equal(periodChange(SERIES, periods[0], '2026-11-17'), -1.5);
});

test('tryb utrzymania: od kiedy w celu i dryf trendu', () => {
  const goal = { target_min_kg: 76, target_max_kg: 77 };
  const m = maintenance(SERIES, goal);           // trend 77 przy dniu 60 (31.10), na końcu 76,15
  assert.equal(m.inGoal, true);
  assert.equal(m.since, '2026-10-31');
  assert.equal(m.days, 17);
  assert.equal(m.drift, -0.7);
  assert.equal(m.warn, true, 'dryf ≥ połowy szerokości przedziału');
  assert.deepEqual(maintenance(SERIES, { target_min_kg: 70, target_max_kg: 72 }), { inGoal: false });
  assert.equal(maintenance([], goal), null);
});
