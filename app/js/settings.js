import { getState, update, replaceState } from './store.js';
import { esc, toast, today, pwa, fmtDate } from './ui.js';
import { systemsFor } from './grades.js';
import { parse8a, merge8a } from './import8a.js';
import { exportBackup } from './backup.js';
import { backupStatus, sinceText, REMINDER_OPTIONS } from './backup-calc.js';
import { bestGrade, gradeMilestones, systemLabel, bmi } from './profile-calc.js';
import { currentBodyWeight } from './load-calc.js';
import { syncStatus, onSyncStatus, signIn, signOut, syncNow } from './sync.js';

// Profil: wzrost, masa (trend), BMI, najlepsze wyceny z logbooka i historia rekordów.
function profileHtml(st) {
  const bw = currentBodyWeight(st.weightEntries, st.settings);
  const h = st.settings.height_cm;
  const b = bw ? bmi(bw.kg, h) : null;
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const cell = (kind, group) => {
    const all = bestGrade(st.ascents, kind, group);
    const recent = bestGrade(st.ascents, kind, group, since);
    return `<td>${all ? `<strong>${esc(all.grade)}</strong>` : '–'}${recent && recent.grade !== all?.grade ? `<br><small class="muted">12 mies.: ${esc(recent.grade)}</small>` : ''}</td>`;
  };
  const kinds = [['route', 'Drogi'], ['boulder', 'Bouldery']].filter(([k]) => st.ascents.some((a) => a.kind === k));
  const history = kinds.map(([k, label]) => {
    const m = gradeMilestones(st.ascents, k);
    return m.length ? `<p><strong>${label}</strong> (${esc(systemLabel(st.ascents, k))})</p>
      <ol class="plain-ol">${m.slice().reverse().map((x) => `<li>${esc(x.grade)} ${esc(x.style)} – ${esc(x.name || 'bez nazwy')} <small class="muted">${fmtDate(x.date)}</small></li>`).join('')}</ol>` : '';
  }).join('');
  return `
    <section class="card">
      <h2>Profil</h2>
      <div class="grid2">
        <label class="field"><span>Wzrost (cm)</span>
          <input type="number" id="heightCm" inputmode="numeric" min="100" max="250" value="${h ?? ''}" placeholder="np. 178"></label>
        <div class="field"><span>Masa ciała (trend)</span><strong class="big-val">${bw ? `${String(bw.kg).replace('.', ',')} kg` : '–'}</strong></div>
      </div>
      ${b ? `<p class="muted">BMI: <strong>${String(b).replace('.', ',')}</strong> – u wspinaczy z dużą masą mięśni mało miarodajne.</p>` : ''}
      <label class="check"><input type="checkbox" id="showBmi" ${st.settings.show_bmi ? 'checked' : ''}><span>Pokazuj BMI w statystykach wagi</span></label>
      ${kinds.length ? `
      <table class="tbl"><thead><tr><th></th><th>Najlepsze</th><th>Flash</th><th>On-sight</th></tr></thead>
        <tbody>${kinds.map(([k, label]) => `<tr><td>${label}</td>${cell(k, 'max')}${cell(k, 'flash')}${cell(k, 'os')}</tr>`).join('')}</tbody></table>
      <p class="muted">Wyceny liczone automatycznie z logbooka (zakładka Przejścia). „Najlepsze” obejmuje OS, flash i RP.</p>
      <details class="how"><summary>Historia rekordów</summary>${history}</details>`
      : '<p class="muted">Najlepsze wyceny pojawią się po dodaniu przejść (zakładka Przejścia albo import z 8a.nu).</p>'}
    </section>`;
}

export function renderSettings(view) {
  function importEightA(json) {
    const imported = parse8a(json);
    let result;
    update((s) => { result = merge8a(s, imported); });
    toast(`8a.nu: dodano ${result.added}, zaktualizowano ${result.updated}`, 4000);
    render();
  }

  function render() {
    const st = getState();
    const options = (kind, selected) => systemsFor(kind)
      .map(([key, s]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${esc(s.label)}</option>`).join('');

    view.innerHTML = `
      ${profileHtml(st)}
      <section class="card">
        <h2>Domyślne skale wycen</h2>
        <div class="grid2">
          <label class="field"><span>Drogi</span><select id="routeSystem">${options('route', st.settings.routeSystem)}</select></label>
          <label class="field"><span>Bouldery</span><select id="boulderSystem">${options('boulder', st.settings.boulderSystem)}</select></label>
        </div>
      </section>

      <section class="card">
        <h2>Masa ciała</h2>
        <label class="field"><span>Metoda trendu</span>
          <select id="trendMethod">
            <option value="libra" ${st.settings.weight_trend_method !== 'ema' ? 'selected' : ''}>Jak w Librze (stała czasowa τ)</option>
            <option value="ema" ${st.settings.weight_trend_method === 'ema' ? 'selected' : ''}>The Hacker's Diet (α na dzień pomiaru)</option>
          </select>
        </label>
        <div class="grid2">
          <label class="field"><span>Stała czasowa τ (dni)</span>
            <input type="number" id="tau" min="1" max="60" step="0.5" value="${st.settings.weight_trend_tau_days}">
          </label>
          <label class="field"><span>Wygładzanie α</span>
            <input type="number" id="alpha" min="0.01" max="1" step="0.01" value="${st.settings.weight_trend_alpha}">
          </label>
          <label class="field"><span>Wartość dnia</span>
            <select id="dailyMode">
              <option value="first" ${st.settings.weight_daily_mode === 'first' ? 'selected' : ''}>pierwszy pomiar</option>
              <option value="mean" ${st.settings.weight_daily_mode === 'mean' ? 'selected' : ''}>średnia dnia</option>
            </select>
          </label>
        </div>
        <p class="muted">Domyślnie trend liczony jak w Librze (τ = 7 dni) – zgadza się z trendem z jej eksportu.
          τ dotyczy metody Libry, α metody Hacker's Diet. Większe τ albo mniejsze α – gładszy, wolniej reagujący trend.
          „Wartość dnia” to punkt na wykresie (i podstawa trendu w metodzie Hacker's Diet).</p>
      </section>

      <section class="card" id="syncCard">${syncCardHtml()}</section>

      <section class="card">
        <h2>Kopia zapasowa</h2>
        <p class="muted">Dane są zapisane tylko na tym urządzeniu, w pamięci przeglądarki.
          Eksportuj je regularnie. Plik JSON pozwala też przenieść dane między komputerem a telefonem.</p>
        <p class="muted">Zapisane: ${st.weightEntries.length} pomiarów wagi, ${st.sessions.length} treningów, ${st.ascents.length} przejść, ${st.plans.length} planów.</p>
        <p class="muted">Ostatnia kopia: <strong>${sinceText(backupStatus(st).daysSince)}</strong></p>
        <label class="field"><span>Przypominaj o kopii</span>
          <select id="backupEvery">
            ${REMINDER_OPTIONS.map((d) => `<option value="${d}" ${d === (st.settings.backup_reminder_days ?? 7) ? 'selected' : ''}>${
              d ? `co ${d} dni` : 'nie przypominaj'}</option>`).join('')}
          </select>
        </label>
        <div class="row">
          <button class="btn" id="export">⬇️ Eksportuj</button>
          <button class="btn" id="import">⬆️ Importuj</button>
        </div>
        <input type="file" id="file" accept="application/json,.json" hidden>
      </section>

      <section class="card">
        <h2>Import z 8a.nu</h2>
        <p class="muted">Wczytaj plik z przejściami pobrany z 8a.nu (instrukcja w README).
          Nowe przejścia zostaną dodane, a wcześniej zaimportowane zaktualizowane, bez duplikatów.</p>
        <p class="muted">Z 8a.nu: ${st.ascents.filter((a) => a.eightAId).length} z ${st.ascents.length} przejść.</p>
        <button class="btn" id="import8a">⬆️ Wczytaj plik z 8a.nu</button>
        <input type="file" id="file8a" accept="application/json,.json" hidden>
      </section>

      ${pwa.installPrompt ? `
        <section class="card">
          <h2>Instalacja</h2>
          <p class="muted">Dodaj ClimbPhone do ekranu głównego, żeby działał jak zwykła aplikacja, również offline.</p>
          <button class="btn primary" id="install">Zainstaluj aplikację</button>
        </section>` : ''}

      <section class="card">
        <h2>Usuwanie danych</h2>
        <button class="btn ghost danger" id="wipe">Usuń wszystkie dane</button>
      </section>

      <section class="card">
        <h2>Wersja</h2>
        <p class="muted">Wersja aplikacji na tym urządzeniu: <strong id="appVersion">…</strong></p>
        <button class="btn ghost" id="checkUpdate">Sprawdź aktualizację</button>
      </section>`;

    // Wersja = nazwa cache service workera (np. climbphone-v10), ta sama co VERSION w sw.js.
    caches?.keys().then((keys) => {
      const k = keys.filter((x) => x.startsWith('climbphone-')).sort().at(-1);
      const el = view.querySelector('#appVersion');
      if (el) el.textContent = k ? k.replace('climbphone-', '') : 'brak (tryb bez instalacji)';
    }).catch(() => {});
    view.querySelector('#checkUpdate').addEventListener('click', async () => {
      const reg = pwa.registration;
      if (!reg) return toast('Aktualizacje działają tylko w zainstalowanej aplikacji (https)');
      try {
        await reg.update();
        toast(reg.installing || reg.waiting ? 'Pobieram nową wersję…' : 'Masz najnowszą wersję');
      } catch {
        toast('Brak połączenia – spróbuj później');
      }
    });

    view.querySelector('#heightCm').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      update((s) => { s.settings.height_cm = v >= 100 && v <= 250 ? v : null; });
      toast(v >= 100 && v <= 250 ? 'Zapisano wzrost' : 'Wzrost poza zakresem 100–250 cm');
      render();
    });
    view.querySelector('#showBmi').addEventListener('change', (e) => {
      update((s) => { s.settings.show_bmi = e.target.checked; });
    });
    view.querySelector('#routeSystem').addEventListener('change', (e) => {
      update((s) => { s.settings.routeSystem = e.target.value; });
      toast('Zapisano');
    });
    view.querySelector('#boulderSystem').addEventListener('change', (e) => {
      update((s) => { s.settings.boulderSystem = e.target.value; });
      toast('Zapisano');
    });

    view.querySelector('#alpha').addEventListener('change', (e) => {
      const a = parseFloat(String(e.target.value).replace(',', '.'));
      if (!(a > 0 && a <= 1)) return toast('α musi być z zakresu 0,01–1');
      update((s) => { s.settings.weight_trend_alpha = a; });
      toast('Zapisano');
    });
    view.querySelector('#trendMethod').addEventListener('change', (e) => {
      update((s) => { s.settings.weight_trend_method = e.target.value; });
      toast('Zapisano');
    });
    view.querySelector('#tau').addEventListener('change', (e) => {
      const tau = parseFloat(String(e.target.value).replace(',', '.'));
      if (!(tau >= 1 && tau <= 60)) return toast('τ musi być z zakresu 1–60 dni');
      update((s) => { s.settings.weight_trend_tau_days = tau; });
      toast('Zapisano');
    });
    view.querySelector('#dailyMode').addEventListener('change', (e) => {
      update((s) => { s.settings.weight_daily_mode = e.target.value; });
      toast('Zapisano');
    });

    view.querySelector('#export').addEventListener('click', () => { exportBackup(); render(); });
    view.querySelector('#backupEvery').addEventListener('change', (e) => {
      update((s) => { s.settings.backup_reminder_days = Number(e.target.value); });
      toast('Zapisano');
    });

    const fileInput = view.querySelector('#file');
    view.querySelector('#import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        // Plik z 8a.nu wrzucony w zwykły import kopii też obsługujemy, i to bez kasowania danych.
        if (data.source === '8a.nu' || data.ascents?.[0]?.ascentId) {
          importEightA(data);
          return;
        }
        if (!Array.isArray(data.sessions) || !Array.isArray(data.ascents)) throw new Error('format');
        if (!confirm('Import zastąpi wszystkie obecne dane danymi z pliku. Kontynuować?')) return;
        replaceState(data);
        toast('Zaimportowano dane');
        render();
      } catch {
        toast('To nie jest poprawny plik kopii ClimbPhone');
      } finally {
        fileInput.value = '';
      }
    });

    const file8a = view.querySelector('#file8a');
    view.querySelector('#import8a').addEventListener('click', () => file8a.click());
    file8a.addEventListener('change', async () => {
      const file = file8a.files[0];
      if (!file) return;
      try {
        importEightA(JSON.parse(await file.text()));
      } catch (err) {
        toast(err.message.startsWith('To nie') ? err.message : 'Nie udało się odczytać pliku z 8a.nu');
      } finally {
        file8a.value = '';
      }
    });

    view.querySelector('#install')?.addEventListener('click', async () => {
      pwa.installPrompt.prompt();
      await pwa.installPrompt.userChoice;
      pwa.installPrompt = null;
      render();
    });

    view.querySelector('#wipe').addEventListener('click', () => {
      if (!confirm('Na pewno usunąć wszystkie treningi, przejścia i plany?')) return;
      const cloud = syncStatus().signedIn ? '\n\nSynchronizacja jest włączona – dane znikną też z chmury i z innych urządzeń.' : '';
      if (!confirm(`Tego nie da się cofnąć. Upewnij się, że masz kopię (eksport).${cloud}\n\nOK = usuń wszystko`)) return;
      replaceState({});
      toast('Usunięto wszystkie dane');
      render();
    });
    bindSyncCard();
  }

  // Karta synchronizacji odświeża się sama przy zmianie stanu (bez przerysowania całego ekranu).
  function bindSyncCard() {
    const card = view.querySelector('#syncCard');
    if (!card) return;
    card.querySelector('#syncIn')?.addEventListener('click', () => signIn());
    card.querySelector('#syncOut')?.addEventListener('click', () => signOut());
    card.querySelector('#syncNow')?.addEventListener('click', () => { syncNow(); toast('Synchronizuję…'); });
  }
  const offStatus = onSyncStatus(() => {
    const card = view.querySelector('#syncCard');
    if (!card) return;
    card.innerHTML = syncCardHtml();
    bindSyncCard();
  });

  render();
  return () => offStatus();
}

// ---------- Synchronizacja ----------

const SYNC_STATES = {
  off: '', connecting: '⏳ Łączę…', synced: '✅ Zsynchronizowano', pending: '⏳ Wysyłam zmiany…',
  offline: '📴 Brak internetu – zmiany poczekają', error: '⚠️ Problem z synchronizacją', signedout: '',
};

function syncCardHtml() {
  const s = syncStatus();
  if (!s.configured) {
    return `<h2>Synchronizacja</h2>
      <p class="muted">Wyłączona – dane są tylko na tym urządzeniu. Włączenie wymaga jednorazowej konfiguracji Firebase (instrukcja w docs/firebase.md).</p>`;
  }
  const time = s.lastSync ? new Date(s.lastSync).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  if (!s.signedIn) {
    return `<h2>Synchronizacja</h2>
      <p class="muted">Zaloguj się kontem Google, a dane będą kopiowane do chmury i dostępne na innych urządzeniach
        (telefon, komputer). Aplikacja dalej działa bez internetu – zmiany wyślą się po połączeniu.</p>
      ${s.error ? `<p class="hint warn-hint">${esc(s.error)}</p>` : ''}
      <button class="btn primary" id="syncIn" ${s.state === 'connecting' ? 'disabled' : ''}>${s.state === 'connecting' ? '⏳ Łączę…' : '🔐 Zaloguj kontem Google'}</button>`;
  }
  return `<div class="card-head"><h2>Synchronizacja</h2><span class="muted">${esc(SYNC_STATES[s.state] || '')}</span></div>
    <p>Konto: <strong>${esc(s.email)}</strong></p>
    <p class="muted">${s.pending ? `Do wysłania: ${s.pending} ${s.pending === 1 ? 'zmiana' : 'zmian'}. ` : ''}${time ? `Ostatnia synchronizacja: ${time}.` : ''}</p>
    ${s.error ? `<p class="hint warn-hint">${esc(s.error)}</p>` : ''}
    <div class="row">
      <button class="btn" id="syncNow">🔄 Synchronizuj teraz</button>
      <button class="btn ghost" id="syncOut">Wyloguj</button>
    </div>
    <p class="muted">Ręczny eksport kopii (niżej) nadal warto robić od czasu do czasu.</p>`;
}
