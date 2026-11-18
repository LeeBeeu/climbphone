// Testy trybu prób wspinaczkowych. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtClock, attemptsSummary, summaryText, sessionMinutes, modeById } from '../app/js/attempts-calc.js';

test('format czasu', () => {
  assert.equal(fmtClock(0), '0:00');
  assert.equal(fmtClock(75), '1:15');
  assert.equal(fmtClock(3725), '1:02:05');
});

test('podsumowanie prób: liczba, przejścia, czasy, stosunek pracy do odpoczynku', () => {
  const a = [{ climb_s: 60, rest_s: 120, sent: true }, { climb_s: 40, rest_s: 180, sent: false }, { climb_s: 50, rest_s: 0, sent: true }];
  assert.deepEqual(attemptsSummary(a), { count: 3, sent: 2, climb_s: 150, rest_s: 300, avg_climb_s: 50, ratio: 2 });
  assert.equal(summaryText(a, 'boulder'), 'Bouldering – próby: 3 próby · 2 przejścia · wspinanie 2:30 · odpoczynek 5:00 · śr. próba 0:50 · praca : odpoczynek 1 : 2');
  assert.equal(summaryText([{ climb_s: 1200, rest_s: 0 }], 'arc'), 'ARC / ciągłe wspinanie: 1 próba · wspinanie 20:00 · odpoczynek 0:00 · śr. próba 20:00');
  assert.equal(attemptsSummary([]).ratio, null);
});

test('odmiana liczebników', async () => {
  const { pl } = await import('../app/js/attempts-calc.js');
  assert.deepEqual([1, 2, 5, 12, 22, 25].map((n) => pl(n, 'próba', 'próby', 'prób')), ['próba', 'próby', 'prób', 'prób', 'próby', 'prób']);
});

test('czas sesji i tryby', () => {
  assert.equal(sessionMinutes(0, 61_000), 2);
  assert.equal(sessionMinutes(0, 5_000), 1);
  assert.equal(modeById('4x4').type, 'Bouldering');
  assert.equal(modeById('xxx').id, 'boulder');
});
