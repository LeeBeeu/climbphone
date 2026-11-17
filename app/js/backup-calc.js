// Przypomnienie o kopii zapasowej. Czyste funkcje, bez DOM (testy: tests/backup-calc.test.mjs).
// Dane są tylko w pamięci przeglądarki na urządzeniu, więc eksport to jedyna kopia.

export const REMINDER_OPTIONS = [0, 7, 14, 30]; // 0 = wyłączone
export const SNOOZE_DAYS = 3;
const DAY_MS = 86_400_000;

export const hasData = (st) =>
  !!(st.sessions?.length || st.weightEntries?.length || st.ascents?.length || st.plans?.length || st.strengthTests?.length);

// { due, daysSince } – daysSince = null, gdy kopii jeszcze nie było.
export function backupStatus(st, now = new Date()) {
  const s = st.settings || {};
  const every = s.backup_reminder_days ?? 7;
  const last = s.last_backup_at ? new Date(s.last_backup_at) : null;
  const daysSince = last ? Math.floor((now - last) / DAY_MS) : null;
  const snoozed = s.backup_snooze_until && new Date(s.backup_snooze_until) > now;
  const due = every > 0 && hasData(st) && !snoozed && (daysSince === null || daysSince >= every);
  return { due, daysSince };
}

export const snoozeUntil = (now = new Date(), days = SNOOZE_DAYS) => new Date(now.getTime() + days * DAY_MS).toISOString();

export function sinceText(daysSince) {
  if (daysSince === null) return 'jeszcze nie było kopii';
  if (daysSince === 0) return 'dziś';
  if (daysSince === 1) return 'wczoraj';
  return `${daysSince} dni temu`;
}
