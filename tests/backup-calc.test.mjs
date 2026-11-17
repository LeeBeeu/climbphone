// Testy przypomnienia o kopii zapasowej. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupStatus, snoozeUntil, sinceText } from '../app/js/backup-calc.js';

const NOW = new Date('2026-11-17T12:00:00Z');
const st = (settings, data = { sessions: [{}] }) => ({ ...data, settings });

test('przypomnienie: brak kopii przy istniejących danych → pora na kopię', () => {
  assert.deepEqual(backupStatus(st({}), NOW), { due: true, daysSince: null });
  assert.equal(backupStatus(st({}, { sessions: [] }), NOW).due, false, 'bez danych nie przypominamy');
});

test('przypomnienie: co 7 dni (domyślnie), wyłączenie i inne okresy', () => {
  assert.deepEqual(backupStatus(st({ last_backup_at: '2026-11-12T12:00:00Z' }), NOW), { due: false, daysSince: 5 });
  assert.equal(backupStatus(st({ last_backup_at: '2026-11-10T12:00:00Z' }), NOW).due, true);
  assert.equal(backupStatus(st({ last_backup_at: '2026-11-10T12:00:00Z', backup_reminder_days: 14 }), NOW).due, false);
  assert.equal(backupStatus(st({ backup_reminder_days: 0 }), NOW).due, false, 'wyłączone');
});

test('przypomnienie: „Za 3 dni” odkłada je do podanej chwili', () => {
  const until = snoozeUntil(NOW);
  assert.equal(until, '2026-11-20T12:00:00.000Z');
  assert.equal(backupStatus(st({ backup_snooze_until: until }), NOW).due, false);
  assert.equal(backupStatus(st({ backup_snooze_until: until }), new Date('2026-11-21T00:00:00Z')).due, true);
});

test('tekst: kiedy była kopia', () => {
  assert.equal(sinceText(null), 'jeszcze nie było kopii');
  assert.equal(sinceText(0), 'dziś');
  assert.equal(sinceText(1), 'wczoraj');
  assert.equal(sinceText(12), '12 dni temu');
});
