// Testy analityki. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periods, sessionStats, sessionLoad, ascentStats, weeklySeries, streak, acwr, pctChange,
} from '../app/js/analytics-calc.js';

test('okresy: bieżący i poprzedni tej samej długości', () => {
  assert.deepEqual(periods('2026-11-17', 28), {
    cur: { start: '2026-10-21', end: '2026-11-17' },
    prev: { start: '2026-09-23', end: '2026-10-20' },
  });
});

test('statystyki treningów i obciążenie sRPE (czas × RPE)', () => {
  const sessions = [
    { date: '2026-11-10', duration: 90, rpe: 7 },
    { date: '2026-11-12', duration: 60, rpe: null },
    { date: '2026-10-01', duration: 30, rpe: 5 },
  ];
  assert.equal(sessionLoad(sessions[0]), 630);
  assert.equal(sessionLoad(sessions[1]), null);
  assert.deepEqual(sessionStats(sessions, { start: '2026-11-01', end: '2026-11-17' }), { count: 2, minutes: 150, load: 630, rpeCount: 1 });
});

test('przejścia w okresie: liczba, najtrudniejsze, średnia top 10', () => {
  const r = (grade, style = 'RP', date = '2026-06-01') => ({ kind: 'route', system: 'french', grade, style, date });
  const ascents = [r('7a'), r('7b', 'RP'), r('6c', 'OS'), r('7c', 'GO'), r('8a', 'RP', '2025-01-01'),
    { kind: 'boulder', system: 'font', grade: '7A', style: 'FL', date: '2026-06-02' }];
  const st = ascentStats(ascents, { start: '2026-01-01', end: '2026-12-31' }, 'route');
  assert.equal(st.count, 3, 'próby (GO) i przejścia spoza okresu się nie liczą');
  assert.deepEqual(st.best, { grade: '7b', style: 'RP', name: '' });
  assert.equal(st.top10, '7a');                      // średnia z 6c, 7a, 7b
  assert.equal(ascentStats(ascents, { start: '2026-01-01', end: '2026-12-31' }, 'boulder').best.grade, '7A');
  assert.equal(ascentStats([], { start: '2026-01-01', end: '2026-12-31' }, 'route').count, 0);
});

test('tygodnie, seria regularności i ACWR', () => {
  const sessions = [
    { date: '2026-10-27', duration: 60, rpe: 5 },  // W44
    { date: '2026-11-03', duration: 60, rpe: 5 },  // W45
    { date: '2026-11-10', duration: 60, rpe: 5 },  // W46
    { date: '2026-11-11', duration: 60, rpe: 5 },  // W46
  ];
  const s = weeklySeries(sessions, '2026-W47', 5);
  assert.deepEqual(s.map((w) => [w.week, w.count, w.load]), [
    ['2026-W43', 0, 0], ['2026-W44', 1, 300], ['2026-W45', 1, 300], ['2026-W46', 2, 600], ['2026-W47', 0, 0],
  ]);
  assert.equal(streak(s), 3, 'bieżący pusty tydzień nie przerywa serii');
  const a = acwr(s);                                 // ostatni pełny W46 = 600; średnia W43–W46 = 300
  assert.deepEqual([a.ratio, a.zone], [2, 'high']);
  assert.equal(acwr(s.slice(-3)), null, 'za mało tygodni');
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(5, 0), null);
});

test('forma: top 10 z 90 dni wobec 12 miesięcy wcześniej', async () => {
  const { formStats } = await import('../app/js/analytics-calc.js');
  const r = (grade, date) => ({ kind: 'route', system: 'french', grade, style: 'RP', date });
  const old = ['6c', '6c', '6c+', '7a'].map((g, i) => r(g, `2026-0${i + 1}-10`));     // przed oknem 90 dni
  const recent = ['7a', '7a+', '7b'].map((g, i) => r(g, `2026-10-${10 + i}`));        // w oknie
  const f = formStats([...old, ...recent], 'route', '2026-11-18');
  assert.equal(f.enough, true);
  assert.equal(f.form, '7a+');            // średnia z 7a, 7a+, 7b
  assert.equal(f.base, '6c+');            // średnia z 6c, 6c, 6c+, 7a ≈ 6c+
  assert.equal(f.trend, 'up');
  assert.equal(formStats(old, 'route', '2026-11-18').enough, false, 'za mało przejść w 90 dniach');
});

test('project grade i otwarte projekty', async () => {
  const { projectGrade } = await import('../app/js/analytics-calc.js');
  const a = (grade, style, date, name, crag = 'Rejon') => ({ kind: 'route', system: 'french', grade, style, date, name, crag });
  const asc = [
    a('7b', 'RP', '2026-05-01', 'Rysa'), a('7a', 'OS', '2026-06-01', 'Płyta'),
    a('7c', 'GO', '2026-07-01', 'Projekt A'), a('7c', 'GO', '2026-08-01', 'Projekt A'),
    a('7b+', 'GO', '2026-06-01', 'Zrobiona'), a('7b+', 'RP', '2026-09-01', 'Zrobiona'),
    a('8a', 'RP', '2024-01-01', 'Stara'),
  ];
  const p = projectGrade(asc, 'route', '2026-11-18');
  assert.deepEqual([p.best, p.grade, p.upTo], ['7b+', '7c', '7c+'], 'od najlepszego RP z 12 mies. (stare 8a się nie liczy)');
  assert.deepEqual(p.projects.map((x) => `${x.name} ${x.date}`), ['Projekt A 2026-08-01'], 'przerobione i zduplikowane pominięte');
  assert.equal(projectGrade([], 'route', '2026-11-18').grade, null);
});
