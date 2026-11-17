// Testy modułu testów siły (Etap 3). Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TESTS, testById, metric, fmtValue, fmtMetric, testHistory, bestResult, testStrengthEntries, variantLabel,
} from '../app/js/tests-calc.js';
import { strengthProtocols, strengthSeries, bodyWeightOn } from '../app/js/load-calc.js';

const HANG = testById('max_hang_20');
const PULLS = testById('max_pullups');
const r = (date, value, extra = {}) => ({ test_id: extra.test_id || 'max_hang_20', date, value, body_weight_kg: 80, ...extra });

test('definicje testów: unikalne id, znane rodzaje', () => {
  assert.equal(new Set(TESTS.map((t) => t.id)).size, TESTS.length);
  assert.ok(TESTS.every((t) => ['load', 'reps', 'time_s', 'time_min'].includes(t.kind)));
});

test('miara: % MC dla testów z obciążeniem, wartość dla pozostałych', () => {
  assert.equal(metric(HANG, r('2026-11-01', 20)), 125);
  assert.equal(metric(HANG, r('2026-11-01', -10)), 87.5);
  assert.equal(metric(HANG, { value: 20, body_weight_kg: null }), null);
  assert.equal(metric(PULLS, { value: 14 }), 14);
  assert.equal(fmtValue(HANG, r('2026-11-01', 20)), '+20 kg · 125% MC');
  assert.equal(fmtValue(PULLS, { value: 14 }), '14 powt.');
  assert.equal(fmtMetric(testById('arc_time'), 22.5), '22,5 min');
});

test('historia: zmiana i rekord w obrębie wariantu (listwa + chwyt)', () => {
  const h = testHistory([
    r('2026-09-01', 15),
    r('2026-10-01', 20),
    r('2026-10-15', 18),
    r('2026-10-20', 5, { edge_mm: 15, grip: 'otwarty' }),
    r('2026-11-01', 22, { body_weight_kg: 78 }),
    { test_id: 'max_pullups', date: '2026-11-01', value: 12 },
  ], HANG);
  assert.equal(h.length, 5, 'tylko ten test');
  assert.equal(h[0].date, '2026-11-01', 'od najnowszego');
  const byDate = Object.fromEntries(h.map((x) => [x.date, x]));
  assert.equal(byDate['2026-09-01'].pr, true);
  assert.equal(byDate['2026-10-01'].delta, 6.2);          // 125 − 118,8 (miara zaokrąglona do 0,1)
  assert.equal(byDate['2026-10-15'].pr, false);
  assert.equal(byDate['2026-10-20'].first, true, 'nowy wariant zaczyna własną historię');
  assert.equal(byDate['2026-10-20'].pr, true);
  assert.equal(byDate['2026-11-01'].metric, 128.2);       // (78 + 22) / 78, lżejszy = wyższy % MC
  assert.equal(byDate['2026-11-01'].pr, true);
  assert.equal(variantLabel(HANG, byDate['2026-10-20']), '15 mm, otwarty');
  assert.equal(bestResult(h, '20|półzaciąg').date, '2026-11-01');
  assert.equal(bestResult(h, '15|otwarty').value, 5);
});

test('testy z obciążeniem na wykresie siły względnej', () => {
  const extra = testStrengthEntries([r('2026-10-01', 20), { test_id: 'max_pullups', date: '2026-10-01', value: 12 }]);
  assert.equal(extra.length, 1);
  const protos = strengthProtocols([], extra);
  assert.deepEqual(protos.map((p) => [p.id, p.name]), [['test:max_hang_20', 'Test: Max zwis 10 s – 20 mm']]);
  assert.equal(strengthSeries([], 'test:max_hang_20', [], extra)[0].pct_bw, 125);
});

test('masa ciała w dniu: trend albo masa wpisana ręcznie', () => {
  const settings = { weight_trend_method: 'libra', weight_trend_tau_days: 7, weight_daily_mode: 'first' };
  const entries = [{ measured_at: '2026-11-01T07:00:00Z', weight_kg: 80 }, { measured_at: '2026-11-02T07:00:00Z', weight_kg: 81 }];
  assert.equal(bodyWeightOn(entries, settings, '2026-11-01'), 80);
  assert.equal(bodyWeightOn(entries, settings, '2026-11-20'), 80.1);
  assert.equal(bodyWeightOn(entries, settings, '2026-10-01', 75), 75, 'przed pierwszym pomiarem');
  assert.equal(bodyWeightOn([], settings, '2026-11-01'), null);
});
