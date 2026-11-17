// Testy obliczeń modułu masy ciała. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseWeightCsv } from '../app/js/weight-csv.js';
import {
  dailyValues, trendSeries, trendSeriesTime, pace, paceStatus, forecast, isPlateau, trendChange, validateWeight,
  dayNumber, keyFromDayNumber,
} from '../app/js/weight-calc.js';

const near = (actual, expected, eps = 0.005) =>
  assert.ok(Math.abs(actual - expected) < eps, `oczekiwano ${expected}, jest ${actual}`);

const entry = (measured_at, weight_kg) => ({ measured_at, weight_kg });
const GOAL = { target_min_kg: 74, target_max_kg: 76, pace_min_kg_week: -0.3, pace_max_kg_week: -0.5 };

// Seria z zadanym trendem dzień po dniu (do testów tempa, prognozy i zastoju).
function seriesFrom(startKey, trends) {
  const start = dayNumber(startKey);
  return trends.map((trend, i) => ({ date: keyFromDayNumber(start + i), day: start + i, value: trend, trend }));
}

test('trend: zgodny z ręcznym wyliczeniem (α = 0,1)', () => {
  // Arkusz: T0 = 80; T1 = 80 + 0,1·(81 − 80) = 80,1; T2 = 80,1 + 0,1·(79 − 80,1) = 79,99;
  // T3 = 79,99 + 0,1·(80,5 − 79,99) = 80,041
  const daily = dailyValues([
    entry('2026-11-01T07:00:00', 80),
    entry('2026-11-02T07:00:00', 81),
    entry('2026-11-03T07:00:00', 79),
    entry('2026-11-04T07:00:00', 80.5),
  ]);
  const t = trendSeries(daily, 0.1).map((p) => p.trend);
  near(t[0], 80);
  near(t[1], 80.1);
  near(t[2], 79.99);
  near(t[3], 80.041);
});

test('trend: dni bez pomiaru nie zmieniają trendu (MC-11)', () => {
  const withGap = trendSeries(dailyValues([
    entry('2026-11-01T07:00:00', 80),
    entry('2026-11-10T07:00:00', 81),
  ]));
  near(withGap[1].trend, 80.1);
  assert.equal(withGap.length, 2);
});

test('trend Libry: stała czasowa 7 dni, ręczne wyliczenie', () => {
  // T1 = 81 + (80 − 81)·e^(−1/7) = 80,1331; po 7 dniach przerwy: T2 = 82 + (80,1331 − 82)·e^(−1) = 81,3132
  const s = trendSeriesTime([
    entry('2026-11-01T07:00:00Z', 80),
    entry('2026-11-02T07:00:00Z', 81),
    entry('2026-11-09T07:00:00Z', 82),
  ], 7);
  near(s[0].trend, 80);
  near(s[1].trend, 80.1331, 0.0005);
  near(s[2].trend, 81.3132, 0.0005);
});

// Sprawdzenie na prawdziwym eksporcie z Libry (plik prywatny, poza repozytorium – test pomijany, gdy go nie ma).
const LIBRA_FILE = new URL('../data/libra.csv', import.meta.url);
test('trend Libry zgodny z kolumną "weight trend" w eksporcie Libry', { skip: !existsSync(LIBRA_FILE) && 'brak data/libra.csv' }, () => {
  const text = readFileSync(LIBRA_FILE, 'utf8');
  const { rows } = parseWeightCsv(text);
  const libra = text.split('\n').filter((l) => /^\d{4}-/.test(l)).map((l) => l.split(';'));
  // Porównujemy trend po każdym pomiarze, więc liczymy dzień po dniu z pojedynczych wpisów.
  let checked = 0;
  for (let i = 0; i < rows.length; i++) {
    const t = trendSeriesTime(rows.slice(0, i + 1), 7).at(-1).trend;
    if (i % 25 && i !== rows.length - 1) continue; // co 25. wpis wystarczy, pełna pętla jest wolna
    assert.equal(Math.round(t * 10) / 10, Number(libra[i][2]), `wpis ${i + 1} (${libra[i][0]})`);
    checked++;
  }
  assert.ok(checked > 5);
});

test('dzień: pierwszy pomiar albo średnia dnia (MC-04)', () => {
  const entries = [entry('2026-11-01T21:00:00', 81), entry('2026-11-01T07:00:00', 80)];
  assert.equal(dailyValues(entries, 'first')[0].value, 80);
  near(dailyValues(entries, 'mean')[0].value, 80.5);
});

test('tempo: nachylenie trendu z 14 dni w kg/tydz. (MC-12)', () => {
  const s = seriesFrom('2026-11-01', Array.from({ length: 20 }, (_, i) => 80 - 0.05 * i));
  near(pace(s), -0.35);
  assert.equal(pace(s.slice(0, 1)), null);
});

test('ocena tempa wobec celu (MC-13)', () => {
  assert.equal(paceStatus(-0.4, 80, GOAL), 'on_pace');
  assert.equal(paceStatus(-0.2, 80, GOAL), 'too_slow');
  assert.equal(paceStatus(-0.8, 80, GOAL), 'too_fast');
  assert.equal(paceStatus(-0.02, 80, GOAL), 'flat');
  assert.equal(paceStatus(0.3, 80, GOAL), 'wrong_way');
  assert.equal(paceStatus(-0.4, 75, GOAL), 'in_goal');
});

test('prognoza: dni do górnej granicy celu (MC-21)', () => {
  // trend 80, tempo −0,35 kg/tydz. → (80 − 76) / 0,05 = 80 dni
  const s = seriesFrom('2026-11-01', [80]);
  const f = forecast(s, -0.35, GOAL, '2026-11-01');
  assert.equal(f.status, 'date');
  assert.equal(f.days, 80);
  assert.equal(f.date, '2027-01-20');
});

test('prognoza: brak daty, gdy tempo nie prowadzi do celu (MC-22)', () => {
  const s = seriesFrom('2026-11-01', [80]);
  assert.equal(forecast(s, 0.2, GOAL, '2026-11-01').status, 'unreachable');
  assert.equal(forecast(s, -0.03, GOAL, '2026-11-01').status, 'unreachable');
  assert.equal(forecast(seriesFrom('2026-11-01', [75]), -0.4, GOAL, '2026-11-01').status, 'in_goal');
});

test('prognoza: nigdy data z przeszłości', () => {
  // ostatni pomiar rok temu – wyliczona data wypada przed dziś
  const f = forecast(seriesFrom('2025-11-01', [77]), -0.5, GOAL, '2026-11-17');
  assert.equal(f.status, 'stale');
});

test('zastój: 14 dni płaskiego trendu (MC-23)', () => {
  assert.equal(isPlateau(seriesFrom('2026-11-01', Array(15).fill(80))), true);
  assert.equal(isPlateau(seriesFrom('2026-11-01', Array.from({ length: 15 }, (_, i) => 80 - 0.05 * i))), false);
  assert.equal(isPlateau(seriesFrom('2026-11-01', Array(10).fill(80))), false, 'za krótka historia');
});

test('zmiana trendu od tygodnia', () => {
  near(trendChange(seriesFrom('2026-11-01', Array.from({ length: 10 }, (_, i) => 80 - 0.1 * i)), 7), -0.7);
});

test('walidacja wpisu (MC-05)', () => {
  assert.ok(validateWeight(25, null).error);
  assert.ok(validateWeight(250, null).error);
  assert.equal(validateWeight(83, 80).warning, 3);
  assert.deepEqual(validateWeight(80.4, 80), {});
});
