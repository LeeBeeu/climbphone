// Testy obciążenia na chwytotablicy względem masy ciała. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFromAdded, addedFromPct, hangLoadRecord, fmtAdded, roundTo, currentBodyWeight,
} from '../app/js/load-calc.js';

const SETTINGS = { weight_trend_method: 'libra', weight_trend_tau_days: 7, weight_daily_mode: 'first' };

test('% masy ciała liczony od całkowitego obciążenia', () => {
  assert.deepEqual(loadFromAdded(80, 8), { total_kg: 88, pct_bw: 110 });
  assert.deepEqual(loadFromAdded(80, 0), { total_kg: 80, pct_bw: 100 });
  assert.deepEqual(loadFromAdded(80, -20), { total_kg: 60, pct_bw: 75 }, 'odciążenie na bloczku');
  assert.equal(loadFromAdded(0, 5), null);
  assert.equal(loadFromAdded(null, 5), null);
});

test('% masy ciała → dociążenie zaokrąglone do 0,5 kg', () => {
  assert.equal(addedFromPct(80, 110), 8);
  assert.equal(addedFromPct(80.8, 110), 8);      // 8,08 → 8
  assert.equal(addedFromPct(80.8, 115), 12);     // 12,12 → 12
  assert.equal(addedFromPct(75.3, 120), 15);     // 15,06 → 15
  assert.equal(addedFromPct(80, 75), -20);
  assert.equal(addedFromPct(80, 100), 0);
  assert.ok(Object.is(addedFromPct(80.2, 100), 0), 'bez −0');
  assert.equal(addedFromPct(80, 110, 1.25), 7.5);
  assert.equal(addedFromPct(null, 110), null);
});

test('zaokrąglanie do kroku odważników', () => {
  assert.equal(roundTo(7.74), 7.5);
  assert.equal(roundTo(7.75), 8);
  assert.equal(roundTo(-2.2), -2);
});

test('zapis w sesji zamraża masę ciała z dnia treningu', () => {
  assert.deepEqual(hangLoadRecord(80.84, 5), { body_weight_kg: 80.8, added_kg: 5, total_kg: 85.8, pct_bw: 106 });
});

test('tekst dociążenia', () => {
  assert.equal(fmtAdded(5), '+5 kg');
  assert.equal(fmtAdded(2.5), '+2,5 kg');
  assert.equal(fmtAdded(-20), '−20 kg');
  assert.equal(fmtAdded(0), 'bez dociążenia');
});

test('masa ciała z trendu zakładki Waga i wiek pomiaru', () => {
  assert.equal(currentBodyWeight([], SETTINGS), null);
  const bw = currentBodyWeight([
    { measured_at: '2026-11-01T07:00:00Z', weight_kg: 80 },
    { measured_at: '2026-11-02T07:00:00Z', weight_kg: 81 },
  ], SETTINGS, '2026-11-12');
  assert.equal(bw.kg, 80.1);       // trend Libry: 81 + (80 − 81)·e^(−1/7) = 80,13
  assert.equal(bw.last_kg, 81);
  assert.equal(bw.date, '2026-11-02');
  assert.equal(bw.ageDays, 10);
});
