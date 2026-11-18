// Najbliższy trening: checklista z planu i biblioteki. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, matchExercise, planSources, itemsFromPlan, itemsFromWorkout, itemFromText,
  sessionProgress, moveItem, elapsedMinutes, finishSummary, gearFor, DEFAULT_GEAR, matchPreset,
} from '../app/js/session-calc.js';
import { LIBRARY, WORKOUTS, planItemText, byId } from '../app/js/library-calc.js';

let n = 0;
const idFn = () => `i${++n}`;
const week = '2026-W47';
const plan = {
  id: 'p1', name: 'Siła', days: [
    { name: 'Dzień A', items: ['Rozgrzewka', planItemText(LIBRARY.find((e) => e.kind === 'sets'))] },
    { name: 'Dzień B', items: [] },
  ],
  pool: ['2× Bouldering'], weeks: {},
};

test('nowy trening dostaje listę sprzętu dla miejsca', () => {
  const s = newSession({ id: 's', date: '2026-11-19', place: 'crag', idFn });
  assert.equal(s.gear.length, DEFAULT_GEAR.crag.length);
  assert.equal(s.items.length, 0);
  assert.deepEqual(gearFor('home', { home: ['Pas'] }, idFn).map((g) => g.text), ['Pas']);
});

test('pozycja planu rozpoznaje ćwiczenie z biblioteki', () => {
  const e = LIBRARY.find((x) => x.kind === 'timer');
  assert.equal(matchExercise(planItemText(e), LIBRARY)?.id, e.id);
  assert.equal(matchExercise('Coś zupełnie innego', LIBRARY), null);
});

test('źródła: dni z ćwiczeniami i pula', () => {
  const src = planSources([plan], week);
  assert.deepEqual(src.map((s) => s.value), ['p1|d0', 'p1|pool']);
  assert.equal(src[1].count, 2);
});

test('pozycje z dnia planu: źródło do odhaczenia i bez duplikatów', () => {
  const items = itemsFromPlan(plan, week, 'd0', { all: LIBRARY, idFn });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].src, { planId: 'p1', week, key: '0:Rozgrzewka' });
  assert.ok(items[1].exId);
  assert.equal(itemsFromPlan(plan, week, 'd0', { all: LIBRARY, existing: items, idFn }).length, 0);
});

test('pula: tylko nieodhaczone miejsca', () => {
  const items = itemsFromPlan(plan, week, 'pool', { checks: { 'pool:2× Bouldering': true }, idFn });
  assert.equal(items.length, 1);
  assert.equal(items[0].src.key, 'pool:2× Bouldering#1');
});

test('postęp pomija pominięte pozycje', () => {
  const s = { items: [{ done: true }, { done: false }, { skipped: true }] };
  assert.deepEqual(sessionProgress(s), { done: 1, total: 2, skipped: 1, pct: 50 });
});

test('przesuwanie pozycji', () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
});

test('czas od „Zaczynam”', () => {
  assert.equal(elapsedMinutes({}), null);
  assert.equal(elapsedMinutes({ startedAt: 0 }, 95 * 60000), 95);
});

test('podsumowanie do dziennika', () => {
  const w = WORKOUTS[0];
  const items = itemsFromWorkout(w, LIBRARY, idFn);
  items.forEach((i) => { i.done = true; });
  items.push({ ...itemFromText('Rozciąganie palców', LIBRARY, idFn), skipped: true });
  const s = { place: 'gym', title: '', date: '2026-11-19', items, startedAt: 0 };
  const out = finishSummary(s, LIBRARY, 60 * 60000);
  assert.deepEqual(out.fields, { date: '2026-11-19', duration: 60 });
  assert.match(out.notes, /✗ pominięte: Rozciąganie palców/);
  assert.equal(out.exercises.length, items.filter((i) => byId(i.exId)?.kind === 'sets').length);
  assert.equal(finishSummary({ ...s, place: 'crag' }, LIBRARY).type, 'Skały');
});

test('dopasowanie nazw z myślnikiem i protokołów timera', () => {
  const e = LIBRARY.find((x) => x.name.includes(' – '));
  assert.equal(matchExercise(planItemText(e), LIBRARY)?.id, e.id);
  const presets = [{ id: 'b-max', name: 'Max hangs 10 s' }, { id: 'b-max2', name: 'Max hangs' }];
  assert.equal(matchPreset('Timer: Max hangs 10 s (listwa 20 mm)', presets)?.id, 'b-max');
  assert.equal(matchPreset('Max hangsy', presets), null);
});

test('rodzaj treningu ze zrobionych pozycji, bez rozgrzewki', () => {
  const it = (text, done = true) => ({ id: text, text, done, skipped: false });
  const s = { place: 'gym', title: '', date: '2026-11-19', items: [it('Rozgrzewka: 15 min'), it('Bouldering'), it('Timer: Max hangs 10 s', false)] };
  assert.equal(finishSummary(s, LIBRARY).type, 'Bouldering');
  assert.equal(finishSummary({ ...s, items: [it('Coś', false)], place: 'home' }, LIBRARY).type, 'Siła / ogólnorozwojówka');
});
