import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtSeconds, fmtDuration, plural } from './ui.js';

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

const LABELS = { prep: 'Przygotuj się', hang: 'Zwis', rest: 'Odpoczynek', setrest: 'Przerwa' };

// Wybór zapamiętany między przełączeniami zakładek.
let selectedId = BUILTIN[0].id;
let config = { ...BUILTIN[0] };

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
      <button class="btn primary big" id="start">▶ Start</button>
      <p class="muted center">Ekran nie zgaśnie w trakcie treningu. Sygnał dźwiękowy i wibracja oznaczają zmianę fazy.</p>`;

    view.querySelector('#preset').addEventListener('change', (e) => {
      selectedId = e.target.value;
      config = { ...presets().find((p) => p.id === selectedId) };
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
      config = { ...BUILTIN[0] };
      renderSetup();
    });

    view.querySelector('#start').addEventListener('click', start);
  }

  // ---------- Trening w toku ----------

  function start() {
    const phases = buildPhases(config);
    if (config.hang <= 0) return toast('Ustaw czas zwisu większy od zera');
    audio.init();
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
      <p class="muted center">${esc(config.name)} · ${config.sets} × ${config.reps} · zwis ${config.hang} s / odpoczynek ${config.rest} s</p>`;

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
      ph.type === 'prep' ? 'Złap chwyt' :
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
        <label class="field" style="text-align:left"><span>Notatka (chwyt, obciążenie, samopoczucie)</span>
          <textarea id="note" rows="2" placeholder="np. listwa 20 mm, +5 kg"></textarea>
        </label>
        <button class="btn primary big" id="log">Zapisz w dzienniku</button>
        <button class="btn ghost" id="back">Wróć do timera</button>
      </section>`;

    view.querySelector('#log').addEventListener('click', () => {
      const note = view.querySelector('#note').value.trim();
      update((s) => s.sessions.push({
        id: uid(),
        created: Date.now(),
        date: today(),
        type: 'Chwytotablica',
        duration: Math.max(1, Math.round(elapsed / 60)),
        rpe: null,
        notes: [`${config.name}: ${hangsText} po ${config.hang} s`, note].filter(Boolean).join('\n'),
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
