// Testy planu dźwięków timera. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// timer.js importuje store (localStorage) – podstawiamy minimalne środowisko przeglądarki.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document ??= { getElementById: () => null };
const { beepPlan } = await import('../app/js/timer.js');

const phases = [
  { type: 'prep', dur: 5 },
  { type: 'hang', dur: 7, set: 1, rep: 1 },
  { type: 'rest', dur: 3, set: 1, rep: 1 },
  { type: 'hang', dur: 7, set: 1, rep: 2 },
];

test('plan dźwięków: start faz, odliczanie 3-2-1 i fanfara w dobrym czasie', () => {
  const ev = beepPlan(phases, 0, 5000); // przygotowanie, 5 s do końca
  const at = (freq) => ev.filter((e) => e.freq === freq).map((e) => e.inMs);
  assert.deepEqual(at(1046).slice(0, 2), [5000, 15000], 'start obu zwisów');
  assert.deepEqual(at(523), [12000], 'start przerwy');
  // odliczanie: przed końcem prep (5 s), zwisu 1 (12 s), przerwy 3 s (tylko 2 i 1 s – krótsza niż 3 s), zwisu 2 (22 s)
  assert.deepEqual(at(784), [2000, 3000, 4000, 9000, 10000, 11000, 13000, 14000, 19000, 20000, 21000]);
  assert.deepEqual(ev.slice(-3).map((e) => e.inMs), [22000, 22200, 22400], 'fanfara po ostatnim zwisie');
});

test('plan dźwięków od środka treningu (np. po wznowieniu)', () => {
  const ev = beepPlan(phases, 2, 1500); // w przerwie, 1,5 s do końca
  assert.equal(ev.filter((e) => e.freq === 523).length, 0, 'bieżącej fazy nie ogłaszamy ponownie');
  assert.deepEqual(ev.filter((e) => e.freq === 1046 && e.dur === 0.45).map((e) => e.inMs), [1500], 'start następnego zwisu');
  assert.ok(ev.some((e) => e.inMs === 500 && e.freq === 784), 'odliczanie 1 s przed końcem przerwy');
});
