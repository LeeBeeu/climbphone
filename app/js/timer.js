import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtSeconds, fmtDuration, plural, fmtDate } from './ui.js';
import {
  currentBodyWeight, loadFromAdded, addedFromPct, fmtAdded, BW_STALE_DAYS, PCT_MIN, PCT_MAX,
  initSets, sessionHangLoad, fmtSets, progression, EFFORT_LABELS, effortOptions, PROGRESS_STEPS, PROGRESS_STEP_KG,
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
let prefilledFor = null; // protokół, dla którego obciążenie wypełniono już z ostatniej sesji

// Wybór protokołu z zewnątrz (np. „Uruchom w timerze” w bibliotece) – przed przejściem do #/timer.
export function selectTimerPreset(id) {
  const p = [...BUILTIN, ...getState().timerPresets].find((x) => x.id === id);
  if (!p) return;
  selectedId = id;
  config = { ...LOAD_DEFAULTS, ...p };
  prefilledFor = null;
}

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
  master: null, // wspólne wyjście zaplanowanych dźwięków – odłączenie kasuje wszystkie naraz
  beep(freq, dur = 0.15, vol = 0.35, at = null, out = null) {
    const c = this.ctx;
    if (!c) return;
    const t = Math.max(c.currentTime, at ?? c.currentTime);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(out || c.destination);
    osc.start(t);
    osc.stop(t + dur);
  },
  // Dźwięki planowane z wyprzedzeniem w zegarze audio: grają w czasie nawet wtedy, gdy przeglądarka
  // spowalnia JavaScript (np. przy wygaszonym ekranie). `events` = [{ inMs, freq, dur, vol }].
  schedule(events) {
    this.cancel();
    const c = this.ctx;
    if (!c) return;
    this.master = c.createGain();
    this.master.connect(c.destination);
    const now = c.currentTime;
    for (const e of events) if (e.inMs >= -50) this.beep(e.freq, e.dur, e.vol, now + Math.max(0, e.inMs) / 1000, this.master);
  },
  cancel() {
    try { this.master?.disconnect(); } catch { /* już odłączone */ }
    this.master = null;
  },
};

// Plan dźwięków od bieżącej fazy: start zwisu (wysoki), start przerwy (niski), odliczanie 3-2-1 przed końcem fazy,
// fanfara na końcu. `idx` – bieżąca faza, `endMs` – ile ms do końca bieżącej fazy.
export function beepPlan(phases, idx, endMs) {
  const ev = [];
  let phaseEnd = endMs;
  for (let i = idx; i < phases.length; i++) {
    const ph = phases[i];
    const phaseStart = phaseEnd - ph.dur * 1000;
    if (i > idx) {
      if (ph.type === 'hang') ev.push({ inMs: phaseStart, freq: 1046, dur: 0.45, vol: 0.35 });
      else if (ph.type !== 'prep') ev.push({ inMs: phaseStart, freq: 523, dur: 0.3, vol: 0.35 });
    }
    for (let s = 3; s >= 1; s--) if (s < ph.dur) ev.push({ inMs: phaseEnd - s * 1000, freq: 784, dur: 0.08, vol: 0.25 });
    if (i + 1 < phases.length) phaseEnd += phases[i + 1].dur * 1000;
  }
  ev.push({ inMs: phaseEnd, freq: 880, dur: 0.15, vol: 0.35 }, { inMs: phaseEnd + 200, freq: 1046, dur: 0.15, vol: 0.35 },
    { inMs: phaseEnd + 400, freq: 1318, dur: 0.5, vol: 0.35 });
  return ev;
}

// Przerwany trening zapisany w pamięci urządzenia (wznowienie do 3 godzin, NF-05).
const RUN_KEY = 'climbphone.run';
export const RESUME_MAX_MS = 3 * 60 * 60 * 1000;
function loadSavedRun() {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    return r && Date.now() - r.savedAt < RESUME_MAX_MS ? r : null;
  } catch { return null; }
}
const clearSavedRun = () => { try { localStorage.removeItem(RUN_KEY); } catch { /* brak pamięci */ } };

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
    if (!run || run.done) return;
    if (document.visibilityState === 'visible') lockScreen();
    else saveRun(); // aplikacja może zostać zamknięta w tle – zapisz, żeby dało się wznowić
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- Ustawienia protokołu ----------

  function renderSetup() {
    const isCustom = !selectedId.startsWith('b-');
    // Wstępne wypełnienie: start od obciążenia z ostatniego treningu tym protokołem (raz na wybór protokołu).
    if (prefilledFor !== selectedId) {
      prefilledFor = selectedId;
      const p = progression(lastHangLoad(selectedId));
      if (p) setAdded(p.base_kg);
    }
    const saved = run ? null : loadSavedRun();
    const savedPh = saved ? buildPhases(saved.config)[saved.idx] : null;
    view.innerHTML = `
      <div class="seg"><a class="seg-link active">⏱ Zwisy (timer)</a><a href="#/proby" class="seg-link">🧗 Próby na ścianie</a></div>
      ${saved ? `<section class="card resume-card" id="resumeCard">
        <strong>⏯ Przerwany trening: ${esc(saved.config.name)}</strong>
        <p class="muted">${savedPh?.set ? `Seria ${savedPh.set}/${saved.config.sets}` : 'Początek'} · przerwany ${
          Math.max(1, Math.round((Date.now() - saved.savedAt) / 60000))} min temu</p>
        <div class="row">
          <button class="btn primary small" id="resume">▶ Wznów</button>
          <button class="btn small" id="resumeEnd">Zakończ i zapisz</button>
          <button class="btn ghost small" id="resumeDrop">Odrzuć</button>
        </div>
      </section>` : ''}
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
        <label class="field"><span>Listwa (mm) <small>– opcjonalnie, trafi do dziennika</small></span>
          <input type="number" id="edge" inputmode="numeric" min="4" max="60" value="${config.edge_mm ?? ''}" placeholder="np. 20"></label>
        <p class="muted">Łączny czas: <strong id="total">${fmtDuration(totalTime(config))}</strong></p>
        <p class="muted" id="adjusted"></p>
        <div class="row">
          <button class="btn ghost small" id="save">${isCustom ? 'Zapisz zmiany' : 'Zapisz jako mój protokół'}</button>
          ${isCustom ? '<button class="btn ghost small danger" id="del">Usuń protokół</button>' : ''}
        </div>
      </section>
      ${loadCardHtml()}
      <button class="btn primary big" id="start">▶ Start</button>
      <a class="btn ghost small" href="#/biblioteka" style="align-self:center">📚 Więcej protokołów w bibliotece ćwiczeń</a>
      <p class="muted center">Ekran nie zgaśnie w trakcie treningu. Sygnał dźwiękowy i wibracja oznaczają zmianę fazy.</p>`;

    view.querySelector('#resume')?.addEventListener('click', () => resumeRun(saved));
    view.querySelector('#resumeEnd')?.addEventListener('click', () => { resumeRun(saved); finish(false); });
    view.querySelector('#resumeDrop')?.addEventListener('click', () => {
      if (!confirm('Odrzucić przerwany trening? Nie trafi do dziennika.')) return;
      clearSavedRun();
      renderSetup();
    });

    // „Dopasuj”: zmiany czasów i serii obowiązują tylko w tej sesji, dopóki nie zapiszesz protokołu.
    const showAdjusted = () => {
      const base = presets().find((p) => p.id === selectedId);
      const changed = base && FIELDS.some(([k]) => Number(base[k]) !== Number(config[k]));
      view.querySelector('#adjusted').innerHTML = changed
        ? 'Dopasowane tylko na tę sesję – „Zapisz”, żeby zachować. <button class="btn ghost small" id="restore">↺ Przywróć</button>'
        : '';
      view.querySelector('#restore')?.addEventListener('click', () => {
        FIELDS.forEach(([k]) => { config[k] = base[k]; });
        renderSetup();
      });
    };
    showAdjusted();
    view.querySelector('#edge').addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      config.edge_mm = v >= 4 && v <= 60 ? v : null;
    });

    view.querySelector('#preset').addEventListener('change', (e) => {
      selectedId = e.target.value;
      config = { ...LOAD_DEFAULTS, ...presets().find((p) => p.id === selectedId) };
      prefilledFor = null; // świeże ustawienia protokołu → wypełnij ponownie z ostatniej sesji
      renderSetup();
    });

    view.querySelectorAll('input[data-k]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.k;
      const min = key === 'reps' || key === 'sets' ? 1 : 0;
      config[key] = Math.max(min, Math.min(3600, parseInt(input.value, 10) || 0));
      view.querySelector('#total').textContent = fmtDuration(totalTime(config));
      showAdjusted();
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
        <div id="progHint">${progressHtml(last, bw)}</div>
        <label class="field step-field"><span>Krok progresji dla tego protokołu</span>
          <select id="pstep">${PROGRESS_STEPS.map((v) => `<option value="${v}" ${v === progressStep() ? 'selected' : ''}>${
            String(v).replace('.', ',')} kg</option>`).join('')}</select>
        </label>
      </section>`;
  }

  // Krok progresji zapamiętany osobno dla każdego protokołu (np. 1 kg dla max hangs, 0,5 kg dla repeaterów).
  function progressStep() {
    return getState().settings.progress_steps?.[selectedId] ?? PROGRESS_STEP_KG;
  }

  // Ustawia dociążenie w bieżącym trybie (w trybie % – procent odpowiadający tym kilogramom).
  function setAdded(kgValue, bw = bodyWeight()) {
    if (config.load_mode === 'pct') {
      if (bw) config.load_pct = Math.round(((bw.kg + kgValue) / bw.kg) * 1000) / 10;
    } else {
      config.added_kg = kgValue;
    }
  }

  // „Ostatnio” i podpowiedź progresji z przyciskiem „Zastosuj”.
  function progressHtml(last, bw) {
    const p = progression(last, progressStep());
    if (!p) return '';
    const l = last.hang_load;
    const pct = l.pct_bw ? ` (${l.pct_bw}% MC)` : '';
    // Powtórzenia liczymy w seriach z tym obciążeniem; nieudane cięższe próby wymieniamy osobno.
    const reps = p.base_planned ? `, ${p.base_done}/${p.base_planned} powtórzeń` : '';
    const heavier = (last.hang_sets || []).filter((s) => s.added_kg > p.base_kg);
    const tried = heavier.length ? `; nieudana próba ${fmtAdded(Math.max(...heavier.map((s) => s.added_kg)))}` : '';
    const advice = {
      up: `Wszystko ukończone – spróbuj <strong>${fmtAdded(p.suggest_kg)}</strong>.`,
      hold: p.maxed && p.base_done >= p.base_planned
        ? `Wszystko ukończone, ale na maksimum (wysiłek 5) – zostań przy <strong>${fmtAdded(p.suggest_kg)}</strong>.`
        : `Prawie wszystko – zostań przy <strong>${fmtAdded(p.suggest_kg)}</strong>.`,
      down: `Mniej niż 75% powtórzeń – lżej: <strong>${fmtAdded(p.suggest_kg)}</strong>.`,
    }[p.verdict] || '';
    const current = plannedAdded(config, bw);
    const button = p.verdict && current !== p.suggest_kg
      ? `<button class="btn small" id="applyProg">Zastosuj ${fmtAdded(p.suggest_kg)}</button>` : '';
    return `<p class="muted">Ostatnio (${fmtDate(p.date)}): ${fmtAdded(p.base_kg)}${pct}${reps}${tried}.</p>
      ${advice ? `<p class="hint">${advice} ${button}</p>` : ''}`;
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
      refreshProgress();
    });
    view.querySelector('#progHint').addEventListener('click', (e) => {
      if (!e.target.closest('#applyProg')) return;
      setAdded(progression(lastHangLoad(selectedId), progressStep()).suggest_kg);
      renderSetup();
    });
    view.querySelector('#pstep').addEventListener('change', (e) => {
      update((s) => { (s.settings.progress_steps ||= {})[selectedId] = Number(e.target.value); });
      refreshProgress();
    });
    view.querySelector('#bw')?.addEventListener('change', (e) => {
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      update((s) => { s.settings.hang_body_weight_kg = v >= 30 && v <= 200 ? v : null; });
      updateLoadOut();
    });
    updateLoadOut();
  }

  function refreshProgress() {
    const el = view.querySelector('#progHint');
    if (el) el.innerHTML = progressHtml(lastHangLoad(selectedId), bodyWeight());
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
      sets: initSets(config.sets, config.reps, runLoad.added ?? 0),
    };
    renderRunner();
    enterPhase();
    tick();
    run.interval = setInterval(tick, 100);
    scheduleBeeps();
    saveRun();
    lockScreen();
  }

  const scheduleBeeps = () => { if (run && !run.paused && !run.done) audio.schedule(beepPlan(run.phases, run.idx, run.end - Date.now())); };

  function saveRun() {
    if (!run || run.done) return;
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify({
        savedAt: Date.now(), selectedId, config, runLoad, idx: run.idx, startedAt: run.startedAt, sets: run.sets,
        left: run.paused ? run.left : Math.max(0, run.end - Date.now()),
      }));
    } catch { /* brak miejsca – trening działa dalej bez zapisu */ }
  }

  // Wznowienie zapisanego treningu: wraca do tej samej fazy, wstrzymany – start przyciskiem „Wznów”.
  function resumeRun(saved) {
    selectedId = saved.selectedId;
    config = saved.config;
    runLoad = saved.runLoad;
    prefilledFor = selectedId;
    const phases = buildPhases(config);
    let offset = 0;
    phases.forEach((ph) => { ph.offset = offset; offset += ph.dur; });
    const left = Math.max(1000, saved.left);
    run = {
      phases, total: offset, idx: Math.min(saved.idx, phases.length - 1), end: Date.now() + left, paused: true, left,
      lastSec: null, startedAt: saved.startedAt, interval: null, done: false, sets: saved.sets,
    };
    audio.init();
    renderRunner();
    enterPhase(true);
    view.querySelector('#pause').textContent = '▶ Wznów';
    view.querySelector('#runner').classList.add('paused');
    view.querySelector('#time').textContent = fmtSeconds(Math.ceil(left / 1000));
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
      <section class="card setlog" id="setlog" hidden></section>
      <p class="muted center">${esc(config.name)} · ${config.sets} × ${config.reps} · zwis ${config.hang} s / odpoczynek ${config.rest} s</p>
      <p class="center"><strong id="loadline"></strong></p>`;

    view.querySelector('#pause').addEventListener('click', togglePause);
    // Panel serii w przerwie: powtórzenia zakończonej serii i dociążenie kolejnych.
    view.querySelector('#setlog').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const k = run?.logSet;
      if (!a || !k) return;
      const s = run.sets[k - 1];
      if (a === 'rep-') s.reps_done = Math.max(0, s.reps_done - 1);
      if (a === 'rep+') s.reps_done = Math.min(s.reps_planned, s.reps_done + 1);
      if (/^e[1-5]$/.test(a)) s.effort = s.effort === Number(a[1]) ? null : Number(a[1]); // ponowne tapnięcie czyści
      if (a === 'kg-' || a === 'kg+') {
        const next = run.sets[k];
        const v = Math.max(-100, Math.min(150, next.added_kg + (a === 'kg+' ? 0.5 : -0.5)));
        run.sets.slice(k).forEach((x) => { x.added_kg = v; }); // dotyczy wszystkich kolejnych serii
      }
      showSetLog(k);
      saveRun();
    });
    view.querySelector('#skip').addEventListener('click', () => {
      if (run.paused) togglePause();
      run.end = Date.now();
      tick();
      scheduleBeeps();
      saveRun();
    });
    view.querySelector('#stop').addEventListener('click', () => {
      if (confirm('Przerwać trening?')) finish(false);
    });
  }

  function enterPhase(quiet = false) {
    const ph = run.phases[run.idx];
    const next = run.phases[run.idx + 1];
    run.lastSec = null;

    // Obciążenie bieżącej serii (w przerwie – następnej).
    const cur = run.sets[Math.min(config.sets, ph.type === 'setrest' ? ph.set + 1 : ph.set || 1) - 1];
    view.querySelector('#loadline').textContent = loadText(runLoad.bw, cur.added_kg);
    if (ph.type === 'setrest') {
      const s = run.sets[ph.set - 1];
      if (s.reps_done === null) s.reps_done = s.reps_planned; // timer przeszedł całą serię
      showSetLog(ph.set);
    } else {
      run.logSet = null;
      view.querySelector('#setlog').hidden = true;
    }

    view.querySelector('#runner').className = `runner ${ph.type}`;
    view.querySelector('#label').textContent = LABELS[ph.type];
    view.querySelector('#meta').textContent =
      ph.type === 'prep' ? `Złap chwyt${cur.added_kg ? ` · ${fmtAdded(cur.added_kg)}` : ''}` :
      ph.type === 'setrest' ? `Seria ${ph.set}/${config.sets} zakończona` :
      `Seria ${ph.set}/${config.sets} · Powtórzenie ${ph.rep}/${config.reps}`;
    view.querySelector('#next').textContent = next
      ? `Następnie: ${LABELS[next.type].toLowerCase()} ${fmtDuration(next.dur)}`
      : 'Ostatni zwis!';

    // Dźwięki są zaplanowane z wyprzedzeniem (beepPlan); tu tylko wibracja i zapis stanu.
    if (!quiet) {
      if (ph.type === 'hang') vibrate(400);
      else if (ph.type !== 'prep') vibrate([120, 80, 120]);
      saveRun();
    }
  }

  function showSetLog(k) {
    const s = run.sets[k - 1];
    const next = run.sets[k];
    const el = view.querySelector('#setlog');
    run.logSet = k;
    el.hidden = false;
    el.innerHTML = `
      <div class="set-row"><span>Seria ${k}: ukończone powtórzenia</span>
        <button class="btn small" data-a="rep-" aria-label="Mniej powtórzeń">−</button>
        <b>${s.reps_done}/${s.reps_planned}</b>
        <button class="btn small" data-a="rep+" aria-label="Więcej powtórzeń">+</button></div>
      <div class="effort-row"><span>Wysiłek</span>
        ${[1, 2, 3, 4, 5].map((n) => `<button class="btn small ${s.effort === n ? 'active' : ''}" data-a="e${n}"
          aria-label="Wysiłek ${n}: ${EFFORT_LABELS[n]}" aria-pressed="${s.effort === n}">${n}</button>`).join('')}</div>
      ${s.effort ? `<p class="muted effort-label">${EFFORT_LABELS[s.effort]}</p>` : ''}
      ${next ? `<div class="set-row"><span>Dociążenie w serii ${k + 1}</span>
        <button class="btn small" data-a="kg-" aria-label="Mniej o 0,5 kg">−</button>
        <b>${fmtAdded(next.added_kg)}</b>
        <button class="btn small" data-a="kg+" aria-label="Więcej o 0,5 kg">+</button></div>` : ''}`;
    if (next) view.querySelector('#loadline').textContent = loadText(runLoad.bw, next.added_kg);
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
    run.lastSec = left;
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
      audio.cancel();
    } else {
      audio.init();
      run.paused = false;
      run.end = Date.now() + run.left;
      btn.textContent = '⏸ Pauza';
      scheduleBeeps();
    }
    saveRun();
    view.querySelector('#runner').classList.toggle('paused', run.paused);
  }

  function finish(completed) {
    clearInterval(run.interval);
    run.done = true;
    unlockScreen();
    const donePhases = (completed ? run.phases : run.phases.slice(0, run.idx)).filter((p) => p.type === 'hang');
    const doneHangs = donePhases.length;
    // Serie niezalogowane w przerwie: tyle powtórzeń, ile zwisów timer faktycznie przeszedł.
    for (const s of run.sets) {
      if (s.reps_done === null) s.reps_done = donePhases.filter((p) => p.set === s.set).length;
    }
    const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
    if (completed) vibrate([200, 100, 200, 100, 400]); // fanfara jest już zaplanowana w beepPlan
    else audio.cancel();
    clearSavedRun();
    renderSummary(completed, doneHangs, elapsed);
  }

  function renderSummary(completed, doneHangs, elapsed) {
    const hangsText = `${doneHangs} ${plural(doneHangs, 'zwis', 'zwisy', 'zwisów')}`;
    view.innerHTML = `
      <section class="card center">
        <h2>${completed ? '💪 Trening zakończony!' : 'Trening przerwany'}</h2>
        <p class="muted">${esc(config.name)} · ${hangsText} · ${fmtDuration(elapsed)}</p>
        <h3 class="sub-title" style="text-align:left">Serie <small class="muted">(powtórzenia i dociążenie w kg; ujemne = odciążenie)</small></h3>
        <div class="sets-table">
          ${run.sets.map((s) => `
            <div class="set-row" data-set="${s.set}">
              <span>Seria ${s.set}</span>
              <button class="btn small" data-a="rep-" aria-label="Mniej powtórzeń">−</button>
              <b data-reps>${s.reps_done}/${s.reps_planned}</b>
              <button class="btn small" data-a="rep+" aria-label="Więcej powtórzeń">+</button>
              <input type="number" inputmode="decimal" step="0.5" min="-100" max="150" value="${s.added_kg}" data-kg aria-label="Dociążenie serii ${s.set} w kg">
              <select data-effort aria-label="Wysiłek w serii ${s.set}">${effortOptions(s.effort)}</select>
            </div>`).join('')}
        </div>
        <p class="muted" style="text-align:left">Ostatnia kolumna: wysiłek 1–5 (5 = maksymalnie). Przy wysiłku 5 podpowiedź nie doda obciążenia.</p>
        <p class="muted" id="sumload" style="text-align:left"></p>
        <label class="field" style="text-align:left"><span>Notatka (chwyt, samopoczucie)</span>
          <textarea id="note" rows="2" placeholder="np. listwa 20 mm, półzaciąg"></textarea>
        </label>
        <button class="btn primary big" id="log">Zapisz w dzienniku</button>
        <button class="btn ghost" id="back">Wróć do timera</button>
      </section>`;

    const sets = run.sets;
    const showLoad = () => {
      const hl = sessionHangLoad(sets, runLoad.bw?.kg);
      view.querySelector('#sumload').textContent = !hl
        ? 'Żadna seria nie ma ukończonego powtórzenia – obciążenie nie trafi na wykres siły.'
        : runLoad.bw
          ? `Najcięższa ukończona seria: ${loadText(runLoad.bw, hl.added_kg)} (masa ciała ${kgText(runLoad.bw.kg)} kg)`
          : `Najcięższa ukończona seria: ${fmtAdded(hl.added_kg)} (brak masy ciała – bez % MC)`;
    };
    view.querySelector('.sets-table').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const row = e.target.closest('[data-set]');
      if (!a || !row) return;
      const s = sets[row.dataset.set - 1];
      s.reps_done = Math.max(0, Math.min(s.reps_planned, s.reps_done + (a === 'rep+' ? 1 : -1)));
      row.querySelector('[data-reps]').textContent = `${s.reps_done}/${s.reps_planned}`;
      showLoad();
    });
    view.querySelector('.sets-table').addEventListener('input', (e) => {
      const row = e.target.closest('[data-set]');
      if (row && e.target.matches('[data-effort]')) {
        sets[row.dataset.set - 1].effort = Number(e.target.value) || null;
        return;
      }
      if (!row || !e.target.matches('[data-kg]')) return;
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      sets[row.dataset.set - 1].added_kg = Number.isFinite(v) ? Math.max(-100, Math.min(150, v)) : 0;
      showLoad();
    });
    showLoad();

    view.querySelector('#log').addEventListener('click', () => {
      const note = view.querySelector('#note').value.trim();
      const hangLoad = sessionHangLoad(sets, runLoad.bw?.kg);
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
        hang_sets: sets.map(({ set, reps_planned, reps_done, added_kg, effort }) => ({ set, reps_planned, reps_done, added_kg, effort })),
        hang_seconds: config.hang,
        hang_edge_mm: config.edge_mm || null,
        notes: [`${config.name}: ${hangsText} po ${config.hang} s${config.edge_mm ? `, listwa ${config.edge_mm} mm` : ''}`, note]
          .filter(Boolean).join('\n'),
      }));
      toast('Zapisano w dzienniku');
      prefilledFor = null; // następny trening wypełni się z tej sesji
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
    // Wyjście z zakładki w trakcie treningu: zapis do wznowienia, dźwięki wyłączone.
    saveRun();
    audio.cancel();
    if (run?.interval) clearInterval(run.interval);
    unlockScreen();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
