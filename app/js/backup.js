// Eksport kopii zapasowej i karta przypomnienia (ekran startowy „Waga”).
import { getState, update } from './store.js';
import { today, toast } from './ui.js';
import { backupStatus, snoozeUntil, sinceText } from './backup-calc.js';

// Pobiera plik JSON z całym stanem i zapamiętuje datę kopii.
export function exportBackup() {
  update((s) => {
    s.settings.last_backup_at = new Date().toISOString();
    s.settings.backup_snooze_until = null;
  });
  const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `climbphone-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Zapisano kopię – przenieś plik w bezpieczne miejsce (np. Dysk Google)', 4000);
}

export function backupReminderHtml() {
  const { due, daysSince } = backupStatus(getState());
  if (!due) return '';
  return `
    <section class="card backup-card" id="backupCard">
      <strong>💾 Kopia zapasowa: ${sinceText(daysSince)}</strong>
      <p class="muted">Dane są tylko na tym urządzeniu. Zapisz plik i przenieś go np. na Dysk Google.</p>
      <div class="row">
        <button class="btn primary small" id="backupNow">Eksportuj teraz</button>
        <button class="btn ghost small" id="backupLater">Za 3 dni</button>
      </div>
    </section>`;
}

export function bindBackupReminder(view, onChange) {
  view.querySelector('#backupNow')?.addEventListener('click', () => { exportBackup(); onChange(); });
  view.querySelector('#backupLater')?.addEventListener('click', () => {
    update((s) => { s.settings.backup_snooze_until = snoozeUntil(); });
    onChange();
  });
}
