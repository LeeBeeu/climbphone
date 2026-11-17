import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtSeconds, fmtDuration, plural, fmtDate } from './ui.js';
import {
  currentBodyWeight, loadFromAdded, addedFromPct, hangLoadRecord, fmtAdded, BW_STALE_DAYS, PCT_MIN, PCT_MAX,
} from './load-calc.js';

const BUILTIN = [
  { id: 'b-repeaters', name: 'Repeaters 7/3', prep: 10, hang: 7, rest: 3, reps: 6, sets: 6, setRest: 180 },
  { id: 'b-max', name: 'Max hangs 10 s', prep: 10, hang: 10, rest: 0, reps: 1, sets: 6, setRest: 180 },
  { id: 'b-endurance', name: 'Wytrzymałość 20/10', prep: 10, hang: 20, rest: 10, reps: 6, sets: 3, setRest: 120 },
  { id: 'b-warmup', name: 'Rozgrzewka 10/20', prep: 10, hang: 10, rest: 20, reps: 6, sets: 2, setRest: 60 },
];

const FIELDS = [
  ['prep', 'Przygotowanie', 's'],
  ['hang', 'Zwis', 's'],
  ['rest', 'Odpoczynek', 's'],
  ['reps', 'Powtórzenia', 'liczba'],
  ['sets', 'Serie', 'liczba'],
  ['setRest', 'Przerwa między seriami', 's'],
];

const LOAD_DEFAULTS = { load_mode: 'kg', added_kg: 0, load_pct: 100 };
const kgText = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

// Masa ciała do obliczeń: trend z zakładki Waga, a gdy brak pomiarów – wartość wpisana w timerze.
function bodyWeight() {
  const s = getState();
  const bw = currentBodyWeight(s.weightEntries, s.settings);
  if (bw) return { ...bw, source: 'trend' };
  const manual = Number(s.settings.hang_body_weight_kg);
  return manual > 0 ? { kg: manual, source: 'manual' } : null;
}

// Planowane dociążenie [kg] dla protokołu (w trybie % przeliczone z aktualnej masy ciała).
function plannedAdded(cfg, bw) {
  if (cfg.load_mode === 'pct') return bw ? addedFromPct(bw.kg, cfg.load_pct) : null;
  return Number(cfg.added_kg) || 0;
}

function loadText(bw, added) {
  if (added === null || added === undefined) return '';
  const l = bw && loadFromAdded(bw.kg, added);
  return l ? `${fmtAdded(added)} · ${kgText(l.total_kg)} kg · ${l.pct_bw}% MC` : fmtAdded(added);
}

const LABELS = { prep: 'Przygotuj się', hang: 'Zwis', rest: 'Odpoczynek', setrest: 'Przerwa' };

// Wybór zapamiętany między przełączeniami zakładek.
let selectedId = BUILTIN[0].id;
let config = { ...LOAD_DEFAULTS, ...BUILTIN[0] };

function buildPhases(p) {
  const phases = [];
  if (p.prep > 0) phases.push({ type: 'prep', dur: p.prep });
  for (let set = 1; set <= p.sets; set++) {
    for (let rep = 1; rep <= p.reps; rep++) {
      phases.push({ type: 'hang', dur: p.hang, set, rep });
      if (rep < p.reps && p.rest > 0) phases.push({ type: 'rest', dur: p.rest, set, rep });
    }
    if (set < p.sets && p.setRest > 0) phases.push({ type: 'setrest', dur: p.setRest, set });
  }
  return phases;
}

const totalTime = (p) => buildPhases(p).reduce((sum, ph) => sum + ph.dur, 0);

const audio = {
  ctx: null,
  init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && Ctx) this.ctx = new Ctx();
    this.ctx?.resume();
  },
  beep(freq, dur = 0.15, vol = 0.35) {
    const c = this.ctx;
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  },
};

const vibrate = (pattern) => navigator.vibrate?.(pattern);

export function renderTimer(view) {
  let run = null;
  let runLoad = null; // obciążenie ustalone na starcie treningu
  let wakeLock = null;

  const presets = () => [...BUILTIN, ...getState().timerPresets];

  async function lockScreen() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
  }
  function unlockScreen() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
  // Blokada wygaszania ekranu znika po zminimalizowaniu, więc odnawiamy ją po powrocie.
  function onVisibility() {
    if (run && !run.done && document.visibilityState === 'visible') lockScreen();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- Ustawienia protokołu ----------

  function renderSetup() {
    const isCustom = !selectedId.startsWith('b-');
    view.innerHTML = `
      <section class="card">
        <label class="field"><span>Protokół</span>
          <select id="preset">
            ${presets().map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <div class="grid2">
          ${FIELDS.map(([key, label, unit]) => `
            <label class="field"><span>${label} <small>(${unit})</small></span>
              <input type="number" inputmode="numeric" min="0" max="3600" data-k="${key}" value="${config[key]}">
            </label>`).join('')}
        </div>
        <p class="muted">Łączny czas: <strong id="total">${fmtDuration(totalTime(config))}</strong></p>
        <div class="row">
          <button class="btn ghost small" id="save">${isCustom ? 'Zapisz zmiany' : 'Zapisz jako mój protokół'}</button>
          ${isCustom ? '<button class="btn ghost small danger" id="del">Usuń protokół</button>' : ''}
        </div>
      </section>
      ${loadCardHtml()}
      <button class="btn primary big" id="start">▶ Start</button>
      <p class="muted center">Ekran nie zgaśnie w trakcie treningu. Sygnał dźwiękowy i wibracja oznaczają zmianę fazy.</p>`;

    view.querySelector('#preset').addEventListener('change', (e) => {
      selectedId = e.target.value;
      config = { ...LOAD_DEFAULTS, ...presets().find((p) => p.id === selectedId) };
      renderSetup();
    });

    view.querySelectorAll('input[data-k]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.k;
      const min = key === 'reps' || key === 'sets' ? 1 : 0;
      config[key] = Math.max(min, Math.min(3600, parseInt(input.value, 10) || 0));
      view.querySelector('#total').textContent = fmtDuration(totalTime(config));
    }));

    view.querySelector('#save').addEventListener('click', () => {
      const name = prompt('Nazwa protokołu:', isCustom ? config.name : `${config.name} (mój)`)?.trim();
      if (!name) return;
      const id = isCustom ? selectedId : uid();
      const preset = { ...config, id, name };
      update((s) => {
        const i = s.timerPresets.findIndex((p) => p.id === id);
        if (i >= 0) s.timerPresets[i] = preset; else s.timerPresets.push(preset);
      });
      selectedId = id;
      config = { ...preset };
      toast('Zapisano protokół');
      renderSetup();
    });

    view.querySelector('#del')?.addEventListener('click', () => {
      if (!confirm(`Usunąć protokół „${config.name}”?`)) return;
      update((s) => { s.timerPresets = s.timerPresets.filter((p) => p.id !== selectedId); });
      selectedId = BUILTIN[0].id;
      config = { ...LOAD_DEFAULTS, ...BUILTIN[0] };
      renderSetup();
    });

    bindLoadCard();
    view.querySelector('#start').addEventListener('click', start);
  }

  // ---------- Obciążenie względem masy ciała ----------

  function loadCardHtml() {
    const bw = bodyWeight();
    const pct = config.load_mode === 'pct';
    const last = lastHangLoad(selectedId);
    const bwLine = bw?.source === 'trend'
      ? `<p class="muted">Masa ciała: <strong>${kgText(bw.kg)} kg</strong> <small>(trend z zakładki Waga, ${fmtDate(bw.date)})</small></p>`
      : `<label class="field"><span>Masa ciała (kg) <small>– brak pomiarów w zakładce Waga</small></span>
          <input type="number" id="bw" inputmode="decimal" step="0.1" min="30" max="200" value="${bw?.kg ?? ''}" placeholder="np. 75"></label>`;
    const lastLoad = last?.hang_load;
    return `
      <section class="card">
        <h2>Obciążenie</h2>
        <div class="seg" id="lmode">
          <button data-m="kg" class="${pct ? '' : 'active'}">Dociążenie (kg)</button>
          <button data-m="pct" class="${pct ? 'active' : ''}">% masy ciała</button>
        </div>
        <label class="field"><span>${pct ? 'Obciążenie (% masy ciała)' : 'Dociążenie (kg) <small>– ujemne = odciążenie na bloczku</small>'}</span>
          <input type="number" id="lval" inputmode="decimal" step="${pct ? 1 : 0.5}"
            min="${pct ? PCT_MIN : -100}" max="${pct ? PCT_MAX : 150}" value="${pct ? config.load_pct : config.added_kg}">
        </label>
        ${bwLine}
        <p id="lout"></p>
        ${bw?.source === 'trend' && bw.ageDays > BW_STALE_DAYS
          ? `<p class="hint">Ostatni pomiar wagi ${bw.ageDays} dni temu – zważ się, żeby % masy ciała był aktualny.</p>` : ''}
        ${lastLoad ? `<p class="muted">Ostatnio z tym protokołem (${fmtDate(last.date)}): ${fmtAdded(lastLoad.added_kg)}${
          lastLoad.pct_bw ? ` · ${lastLoad.pct_bw}% MC przy ${kgText(lastLoad.body_weight_kg)} kg` : ''}</p>` : ''}
      </section>`;
  }

  function updateLoadOut() {
    const out = view.querySelector('#lout');
    if (!out) return;
    const bw = bodyWeight();
    const added = plannedAdded(config, bw);
    if (config.load_mode === 'pct') {
      out.innerHTML = added === null
        ? 'Wpisz masę ciała, żeby przeliczyć % na kilogramy.'
        : `Dociąż: <strong>${fmtAdded(added)}</strong> → ${kgText(bw.kg + added)} kg = ${loadFromAdded(bw.kg, added).pct_bw}% MC <small class="muted">(zaokrąglone do 0,5 kg)</small>`;
    } else {
      const l = bw && loadFromAdded(bw.kg, added);
      out.innerHTML = l
        ? `Obciążenie chwytów: <strong>${kgText(l.total_kg)} kg = ${l.pct_bw}% masy ciała</strong>`
        : 'Wpisz masę ciała, żeby zobaczyć % masy ciała.';
    }
  }

  function bindLoadCard() {
    view.querySelectorAll('#lmode button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.m === config.load_mode) return;
      // Przy zmianie trybu przenosimy bieżące obciążenie, żeby nie zgubić ustawienia.
      const bw = bodyWeight();
      const added = plannedAdded(config, bw);
      if (b.dataset.m === 'pct' && bw) config.load_pct = loadFromAdded(bw.kg, added).pct_bw;
      if (b.dataset.m === 'kg' && added !== null) config.added_kg = added;
      config.load_mode = b.dataset.m;
      renderSetup();
    }));
    view.querySelector('#lval').addEventListener('input', (e) => {
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      if (config.load_mode === 'pct') config.load_pct = Number.isFinite(v) ? Math.max(PCT_MIN, Math.min(PCT_MAX, v)) : 100;
      else config.added_kg = Number.isFinite(v) ? Math.max(-100, Math.min(150, v)) : 0;
      updateLoadOut();
    });
    view.querySelector('#bw')?.addEventListener('change', (e) => {
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      update((s) => { s.settings.hang_body_weight_kg = v >= 30 && v <= 200 ? v : null; });
      updateLoadOut();
    });
    updateLoadOut();
  }

  // Ostatnia sesja z tym protokołem, w której zapisano obciążenie.
  function lastHangLoad(presetId) {
    return getState().sessions
      .filter((x) => x.hang_load && x.preset_id === presetId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0))[0] || null;
  }

  // ---------- Trening w toku ----------

  function start() {
    const phases = buildPhases(config);
    if (config.hang <= 0) return toast('Ustaw czas zwisu większy od zera');
    audio.init();
    const bw = bodyWeight();
    runLoad = { bw, added: plannedAdded(config, bw) };
    let offset = 0;
    phases.forEach((ph) => { ph.offset = offset; offset += ph.dur; });
    run = {
      phases,
      total: offset,
      idx: 0,
      end: Date.now() + phases[0].dur * 1000,
      paused: false,
      left: 0,
      lastSec: null,
      startedAt: Date.now(),
      interval: null,
      done: false,
    };
    renderRunner();
    enterPhase();
    tick();
    run.interval = setInterval(tick, 100);
    lockScreen();
  }

  function renderRunner() {
    view.innerHTML = `
      <section class="runner" id="runner">
        <div class="phase-label" id="label"></div>
        <div class="phase-time" id="time"></div>
        <div class="phase-meta" id="meta"></div>
        <div class="phase-next" id="next"></div>
        <div class="progress"><div id="prog"></div></div>
      </section>
      <div class="row">
        <button class="btn" id="pause">⏸ Pauza</button>
        <button class="btn" id="skip">⏭ Pomiń</button>
        <button class="btn danger" id="stop">⏹ Stop</button>
      </div>
      <p class="muted center">${esc(config.name)} · ${config.sets} × ${config.reps} · zwis ${config.hang} s / odpoczynek ${config.rest} s</p>
      ${runLoad.added !== null ? `<p class="center"><strong>${esc(loadText(runLoad.bw, runLoad.added))}</strong></p>` : ''}`;

    view.querySelector('#pause').addEventListener('click', togglePause);
    view.querySelector('#skip').addEventListener('click', () => {
      if (run.paused) togglePause();
      run.end = Date.now();
      tick();
    });
    view.querySelector('#stop').addEventListener('click', () => {
      if (confirm('Przerwać trening?')) finish(false);
    });
  }

  function enterPhase() {
    const ph = run.phases[run.idx];
    const next = run.phases[run.idx + 1];
    run.lastSec = null;

    view.querySelector('#runner').className = `runner ${ph.type}`;
    view.querySelector('#label').textContent = LABELS[ph.type];
    view.querySelector('#meta').textContent =
      ph.type === 'prep' ? `Złap chwyt${runLoad.added ? ` · ${fmtAdded(runLoad.added)}` : ''}` :
      ph.type === 'setrest' ? `Seria ${ph.set}/${config.sets} zakończona` :
      `Seria ${ph.set}/${config.sets} · Powtórzenie ${ph.rep}/${config.reps}`;
    view.querySelector('#next').textContent = next
      ? `Następnie: ${LABELS[next.type].toLowerCase()} ${fmtDuration(next.dur)}`
      : 'Ostatni zwis!';

    if (ph.type === 'hang') {
      audio.beep(1046, 0.45);
      vibrate(400);
    } else if (ph.type !== 'prep') {
      audio.beep(523, 0.3);
      vibrate([120, 80, 120]);
    }
  }

  function tick() {
    if (!run || run.paused || run.done) return;
    const now = Date.now();
    // Pętla nadrabia fazy, gdyby przeglądarka spowolniła timer w tle.
    while (now >= run.end) {
      if (run.idx + 1 >= run.phases.length) return finish(true);
      run.idx++;
      run.end += run.phases[run.idx].dur * 1000;
      enterPhase();
    }
    const ph = run.phases[run.idx];
    const msLeft = run.end - now;
    const left = Math.ceil(msLeft / 1000);
    if (left !== run.lastSec) {
      run.lastSec = left;
      if (left <= 3 && left < ph.dur) audio.beep(784, 0.08, 0.25);
    }
    view.querySelector('#time').textContent = fmtSeconds(left);
    const elapsed = ph.offset + ph.dur - msLeft / 1000;
    view.querySelector('#prog').style.width = `${Math.min(100, (elapsed / run.total) * 100)}%`;
  }

  function togglePause() {
    const btn = view.querySelector('#pause');
    if (!run.paused) {
      run.paused = true;
      run.left = run.end - Date.now();
      btn.textContent = '▶ Wznów';
    } else {
      run.paused = false;
      run.end = Date.now() + run.left;
      btn.textContent = '⏸ Pauza';
    }
    view.querySelector('#runner').classList.toggle('paused', run.paused);
  }

  function finish(completed) {
    clearInterval(run.interval);
    run.done = true;
    unlockScreen();
    const doneHangs = (completed ? run.phases : run.phases.slice(0, run.idx)).filter((p) => p.type === 'hang').length;
    const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
    if (completed) {
      audio.beep(880, 0.15);
      setTimeout(() => audio.beep(1046, 0.15), 200);
      setTimeout(() => audio.beep(1318, 0.5), 400);
      vibrate([200, 100, 200, 100, 400]);
    }
    renderSummary(completed, doneHangs, elapsed);
  }

  function renderSummary(completed, doneHangs, elapsed) {
    const hangsText = `${doneHangs} ${plural(doneHangs, 'zwis', 'zwisy', 'zwisów')}`;
    view.innerHTML = `
      <section class="card center">
        <h2>${completed ? '💪 Trening zakończony!' : 'Trening przerwany'}</h2>
        <p class="muted">${esc(config.name)} · ${hangsText} · ${fmtDuration(elapsed)}</p>
        <label class="field" style="text-align:left"><span>Dociążenie użyte w treningu (kg) <small>– ujemne = odciążenie</small></span>
          <input type="number" id="added" inputmode="decimal" step="0.5" min="-100" max="150" value="${runLoad.added ?? 0}">
        </label>
        <p class="muted" id="sumload" style="text-align:left"></p>
        <label class="field" style="text-align:left"><span>Notatka (chwyt, samopoczucie)</span>
          <textarea id="note" rows="2" placeholder="np. listwa 20 mm, półzaciąg"></textarea>
        </label>
        <button class="btn primary big" id="log">Zapisz w dzienniku</button>
        <button class="btn ghost" id="back">Wróć do timera</button>
      </section>`;

    const readAdded = () => {
      const v = parseFloat(String(view.querySelector('#added').value).replace(',', '.'));
      return Number.isFinite(v) ? Math.max(-100, Math.min(150, v)) : 0;
    };
    const showLoad = () => {
      view.querySelector('#sumload').textContent = runLoad.bw
        ? `Obciążenie: ${loadText(runLoad.bw, readAdded())} (masa ciała ${kgText(runLoad.bw.kg)} kg)`
        : 'Brak masy ciała – zapiszemy samo dociążenie.';
    };
    view.querySelector('#added').addEventListener('input', showLoad);
    showLoad();

    view.querySelector('#log').addEventListener('click', () => {
      const note = view.querySelector('#note').value.trim();
      const added = readAdded();
      const hangLoad = runLoad.bw
        ? hangLoadRecord(runLoad.bw.kg, added)
        : { body_weight_kg: null, added_kg: added, total_kg: null, pct_bw: null };
      update((s) => s.sessions.push({
        id: uid(),
        created: Date.now(),
        date: today(),
        type: 'Chwytotablica',
        duration: Math.max(1, Math.round(elapsed / 60)),
        rpe: null,
        preset_id: selectedId,
        preset_name: config.name,
        hang_load: hangLoad,
        notes: [`${config.name}: ${hangsText} po ${config.hang} s, ${loadText(runLoad.bw, added)}`, note].filter(Boolean).join('\n'),
      }));
      toast('Zapisano w dzienniku');
      run = null;
      renderSetup();
    });
    view.querySelector('#back').addEventListener('click', () => {
      run = null;
      renderSetup();
    });
  }

  renderSetup();

  return () => {
    if (run?.interval) clearInterval(run.interval);
    unlockScreen();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
