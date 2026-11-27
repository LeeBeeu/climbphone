// Synchronizacja: rekordy, wykrywanie zmian, łączenie ze zmianami z chmury. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordKey, parseKey, toRecords, diff, markDirty, toDoc, applyRemote, ensureIds, hashAll, hasUserData, clearData,
} from '../app/js/sync-calc.js';

const base = () => ({
  sessions: [{ id: 's1', date: '2026-11-20', type: 'Bouldering' }],
  ascents: [{ id: 'a1', name: 'Droga' }],
  planChecks: { 'p1|2026-W48': { '0:Rozgrzewka': true } },
  settings: { routeSystem: 'french' },
  nextSession: null,
});

test('klucze rekordów z dowolnym id', () => {
  const k = recordKey('planChecks', 'p1|2026-W48');
  assert.deepEqual(parseKey(k), { col: 'planChecks', id: 'p1|2026-W48' });
  assert.ok(!k.includes('/'));
  assert.deepEqual(parseKey(recordKey('sessions', 'a/b~c')), { col: 'sessions', id: 'a/b~c' });
});

test('stan → rekordy: listy, mapy i pojedyncze obiekty', () => {
  const r = toRecords(base());
  assert.deepEqual(Object.keys(r).sort(), ['ascents~a1', 'planChecks~p1%7C2026-W48', 'sessions~s1', 'settings~settings']);
});

test('wykrywanie zmian: nowe, zmienione, usunięte', () => {
  const st = base();
  const h0 = hashAll(st);
  st.sessions[0].type = 'Skały';
  st.sessions.push({ id: 's2', date: '2026-11-21' });
  st.ascents = [];
  const d = diff(h0, st);
  assert.deepEqual(d.changed.sort(), ['sessions~s1', 'sessions~s2']);
  assert.deepEqual(d.deleted, ['ascents~a1']);
  assert.equal(diff(d.hashes, st).changed.length, 0);
  assert.deepEqual(markDirty({}, d, 5), { 'sessions~s1': 5, 'sessions~s2': 5, 'ascents~a1': 5 });
});

test('dokument do chmury: treść jako JSON, usunięcie jako znacznik', () => {
  const st = base();
  const recs = toRecords(st);
  assert.deepEqual(toDoc('sessions~s1', recs, 9, 'dev'), {
    col: 'sessions', id: 's1', deleted: false, json: JSON.stringify(st.sessions[0]), updatedAt: 9, device: 'dev',
  });
  assert.equal(toDoc('ascents~zzz', recs, 9, 'dev').deleted, true);
});

test('łączenie: zmiana z chmury, usunięcie, nowszy lokalny zapis wygrywa', () => {
  const st = base();
  const meta = { hashes: hashAll(st), dirty: { 'ascents~a1': 100 } };
  const docs = [
    { col: 'sessions', id: 's1', deleted: false, json: JSON.stringify({ id: 's1', date: '2026-11-20', type: 'Skały' }), updatedAt: 50 },
    { col: 'sessions', id: 's9', deleted: false, json: JSON.stringify({ id: 's9', date: '2026-11-22' }), updatedAt: 50 },
    { col: 'ascents', id: 'a1', deleted: true, json: null, updatedAt: 60 },                  // starsze niż lokalna zmiana
    { col: 'planChecks', id: 'p1|2026-W48', deleted: true, json: null, updatedAt: 70 },
    { col: 'nextSession', id: 'nextSession', deleted: false, json: JSON.stringify({ id: 'n', items: [] }), updatedAt: 70 },
  ];
  const out = applyRemote(st, docs, meta);
  assert.equal(out.applied, 4);
  assert.equal(st.sessions.find((s) => s.id === 's1').type, 'Skały');
  assert.ok(st.sessions.some((s) => s.id === 's9'));
  assert.equal(st.ascents.length, 1, 'lokalna nowsza zmiana zostaje');
  assert.equal(out.dirty['ascents~a1'], 100);
  assert.deepEqual(st.planChecks, {});
  assert.equal(st.nextSession.id, 'n');
  // Po łączeniu skróty zgadzają się ze stanem – nic nie wróci jako „lokalna zmiana”.
  const again = diff(out.hashes, st);
  assert.deepEqual([again.changed, again.deleted], [[], []]);
  // Nasz własny zapis wracający z chmury niczego nie zmienia.
  assert.equal(applyRemote(st, [docs[1]], out).applied, 0);
});

test('starsza zmiana z chmury nie nadpisuje nowszej lokalnej; nowsza z chmury – tak', () => {
  const st = base();
  const doc = (ts) => ({ col: 'sessions', id: 's1', deleted: false, json: JSON.stringify({ id: 's1', type: `v${ts}` }), updatedAt: ts });
  let out = applyRemote(st, [doc(10)], { hashes: hashAll(st), dirty: { 'sessions~s1': 20 } });
  assert.equal(st.sessions[0].type, 'Bouldering');
  out = applyRemote(st, [doc(30)], out);
  assert.equal(st.sessions[0].type, 'v30');
  assert.equal(out.dirty['sessions~s1'], undefined);
});

test('id dla starych wpisów, dane użytkownika, czyszczenie', () => {
  const st = { sessions: [{ date: 'x' }], ascents: [] };
  let n = 0;
  assert.equal(ensureIds(st, () => `id${++n}`), 1);
  assert.equal(st.sessions[0].id, 'id1');
  assert.equal(hasUserData({ sessions: [], planChecks: {} }), false);
  assert.equal(hasUserData(base()), true);
  const s2 = base();
  clearData(s2);
  assert.equal(hasUserData(s2), false);
  assert.equal(s2.settings.routeSystem, 'french');
});
