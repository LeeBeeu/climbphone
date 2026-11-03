import { getState, update, replaceState } from './store.js';
import { esc, toast, today, pwa } from './ui.js';
import { systemsFor } from './grades.js';
import { parse8a, merge8a } from './import8a.js';

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
      <section class="card">
        <h2>Domyślne skale wycen</h2>
        <div class="grid2">
          <label class="field"><span>Drogi</span><select id="routeSystem">${options('route', st.settings.routeSystem)}</select></label>
          <label class="field"><span>Bouldery</span><select id="boulderSystem">${options('boulder', st.settings.boulderSystem)}</select></label>
        </div>
      </section>

      <section class="card">
        <h2>Kopia zapasowa</h2>
        <p class="muted">Dane są zapisane tylko na tym urządzeniu, w pamięci przeglądarki.
          Eksportuj je regularnie. Plik JSON pozwala też przenieść dane między komputerem a telefonem.</p>
        <p class="muted">Zapisane: ${st.sessions.length} treningów, ${st.ascents.length} przejść, ${st.plans.length} planów.</p>
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

      <p class="muted center">ClimbPhone 1.0</p>`;

    view.querySelector('#routeSystem').addEventListener('change', (e) => {
      update((s) => { s.settings.routeSystem = e.target.value; });
      toast('Zapisano');
    });
    view.querySelector('#boulderSystem').addEventListener('change', (e) => {
      update((s) => { s.settings.boulderSystem = e.target.value; });
      toast('Zapisano');
    });

    view.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `climbphone-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
      if (!confirm('Tego nie da się cofnąć. Upewnij się, że masz kopię (eksport).\n\nOK = usuń wszystko')) return;
      replaceState({});
      toast('Usunięto wszystkie dane');
      render();
    });
  }

  render();
}
