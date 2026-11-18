// Ekran „Próby na ścianie” (tryb prób wspinaczkowych, Etap 2): „Start próby” → przejście / odpadnięcie →
// odpoczynek liczony do następnej próby. Do ARC, 4×4, boulderów i dróg. Zapis do dziennika z listą prób.
// Obliczenia: attempts-calc.js. Stan sesji jest zapisywany na bieżąco, więc przeżyje zamknięcie aplikacji.
import { update, uid } from './store.js';
import { esc, toast, today } from './ui.js';
import { MODES, modeById, fmtClock, attemptsSummary, summaryText, sessionMinutes } from './attempts-calc.js';

const KEY = 'climbphone.attempts';
const REST_TARGET = { boulder: 180, '4x4': 240, routes: 0, arc: 0 }; // sygnał po zalecanym odpoczynku (s)
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

let modeId = 'boulder';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && Date.now() - (s.savedAt || 0) < MAX_AGE_MS ? s : null;
  } catch { return null; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() })); } catch { /* brak pamięci */ }
}
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* brak pamięci */ } };

let audioCtx = null;
function beep(freq = 880, dur = 0.25) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch { /* brak dźwięku */ }
}

export function renderAttempts(view) {
  let s = load();          // { mode, startedAt, phase: 'idle'|'climb'|'rest', phaseStart, attempts, endedAt?, restBeeped? }
  let interval = null;
  let wakeLock = null;

  const lock = async () => { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } };
  const unlock = () => { wakeLock?.release().catch(() => {}); wakeLock = null; };
  const onVis = () => { if (s && !s.endedAt && document.visibilityState === 'visible') lock(); };
  document.addEventListener('visibilitychange', onVis);

  function render() {
    clearInterval(interval);
    if (!s) return renderSetup();
    if (s.endedAt) return renderSummary();
    return renderRunning();
  }

  function renderSetup() {
    unlock();
    view.innerHTML = `
      <div class="seg"><a href="#/timer" class="seg-link">⏱ Zwisy (timer)</a><a class="seg-link active">🧗 Próby na ścianie</a></div>
      <section class="card">
        <h2>Próby na ścianie</h2>
        <p class="muted">Stoper do treningu na ścianie: mierzy czas każdej próby i odpoczynku między nimi. Ekran nie gaśnie.</p>
        ${MODES.map((m) => `<label class="check"><input type="radio" name="mode" value="${m.id}" ${m.id === modeId ? 'checked' : ''}>
          <span><strong>${esc(m.label)}</strong><br><small class="muted">${esc(m.hint)}</small></span></label>`).join('')}
      </section>
      <button class="btn primary big" id="startSession">▶ Start sesji</button>`;
    view.querySelectorAll('[name="mode"]').forEach((r) => r.addEventListener('change', () => { modeId = r.value; }));
    view.querySelector('#startSession').addEventListener('click', () => {
      s = { mode: modeId, startedAt: Date.now(), phase: 'idle', phaseStart: Date.now(), attempts: [] };
      save(s);
      render();
    });
  }

  function renderRunning() {
    const mode = modeById(s.mode);
    const judged = s.mode === 'boulder' || s.mode === 'routes';
    const n = s.attempts.length;
    const label = s.phase === 'climb' ? `Próba ${n + 1}` : s.phase === 'rest' ? 'Odpoczynek' : 'Gotowy';
    view.innerHTML = `
      <section class="runner att-${s.phase}" id="attRunner">
        <div class="phase-label">${label}</div>
        <div class="phase-time" id="attTime">0:00</div>
        <div class="phase-meta">${esc(mode.label)} · sesja <span id="attTotal">0:00</span></div>
        <div class="phase-next" id="attHint">${s.phase === 'rest' && REST_TARGET[s.mode] ? `Zalecany odpoczynek ${fmtClock(REST_TARGET[s.mode])}` : ''}</div>
      </section>
      <div class="row att-actions">
        ${s.phase === 'climb'
          ? (judged
            ? '<button class="btn primary big" id="sent">✓ Przejście</button><button class="btn big" id="fell">✕ Odpadnięcie</button>'
            : '<button class="btn primary big" id="endAtt">■ Koniec próby</button>')
          : '<button class="btn primary big" id="startAtt">▶ Start próby</button>'}
      </div>
      ${n ? `<section class="card"><h3>Próby (${n})</h3><ol class="att-list">${s.attempts.map((a, i) => `<li>${fmtClock(a.climb_s)}${
        judged ? (a.sent ? ' ✓' : ' ✕') : ''}${a.rest_s ? ` <small class="muted">· odpoczynek ${fmtClock(a.rest_s)}</small>` : ''}${
        i === n - 1 && s.phase === 'rest' ? ' <small class="muted">· odpoczynek trwa</small>' : ''}</li>`).join('')}</ol></section>` : ''}
      <div class="row">
        ${n && s.phase !== 'climb' ? '<button class="btn ghost" id="undo">↶ Cofnij ostatnią</button>' : ''}
        <button class="btn danger" id="endSession">⏹ Zakończ sesję</button>
      </div>`;

    const $ = (q) => view.querySelector(q);
    $('#startAtt')?.addEventListener('click', () => {
      const now = Date.now();
      if (s.phase === 'rest' && n) s.attempts[n - 1].rest_s = Math.round((now - s.phaseStart) / 1000);
      s.phase = 'climb';
      s.phaseStart = now;
      s.restBeeped = false;
      beep(1046, 0.3);
      navigator.vibrate?.(200);
      save(s);
      render();
    });
    const endAttempt = (sent) => {
      const now = Date.now();
      s.attempts.push({ climb_s: Math.round((now - s.phaseStart) / 1000), rest_s: 0, sent });
      s.phase = 'rest';
      s.phaseStart = now;
      beep(523, 0.25);
      navigator.vibrate?.([100, 60, 100]);
      save(s);
      render();
    };
    $('#sent')?.addEventListener('click', () => endAttempt(true));
    $('#fell')?.addEventListener('click', () => endAttempt(false));
    $('#endAtt')?.addEventListener('click', () => endAttempt(null));
    $('#undo')?.addEventListener('click', () => {
      if (!confirm('Cofnąć ostatnią próbę?')) return;
      const last = s.attempts.pop();
      s.phase = 'climb';
      s.phaseStart = Date.now() - last.climb_s * 1000; // wracamy do trwającej próby
      save(s);
      render();
    });
    $('#endSession').addEventListener('click', () => {
      if (!confirm('Zakończyć sesję prób?')) return;
      if (s.phase === 'climb') {
        s.attempts.push({ climb_s: Math.round((Date.now() - s.phaseStart) / 1000), rest_s: 0, sent: judged ? false : null });
      }
      s.endedAt = Date.now();
      save(s);
      render();
    });

    const tick = () => {
      const now = Date.now();
      const el = (Math.max(0, now - s.phaseStart)) / 1000;
      $('#attTime').textContent = fmtClock(el);
      $('#attTotal').textContent = fmtClock((now - s.startedAt) / 1000);
      const target = REST_TARGET[s.mode];
      if (s.phase === 'rest' && target && el >= target && !s.restBeeped) {
        s.restBeeped = true;
        beep(1318, 0.4);
        navigator.vibrate?.([200, 100, 200]);
        $('#attHint').textContent = 'Odpoczynek zalecany minął – gotowy na następną próbę';
        save(s);
      }
    };
    tick();
    interval = setInterval(tick, 250);
    lock();
  }

  function renderSummary() {
    unlock();
    const sum = attemptsSummary(s.attempts);
    view.innerHTML = `
      <section class="card">
        <h2>Podsumowanie sesji</h2>
        <p>${esc(summaryText(s.attempts, s.mode))}</p>
        <div class="stats">
          <div class="stat"><b>${sum.count}</b><span>próby</span></div>
          <div class="stat"><b>${fmtClock(sum.climb_s)}</b><span>wspinanie</span></div>
          <div class="stat"><b>${fmtClock(sum.avg_climb_s)}</b><span>śr. próba</span></div>
        </div>
        <label class="field"><span>Intensywność (RPE)</span>
          <select id="attRpe"><option value="">–</option>${Array.from({ length: 10 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
        <label class="field"><span>Notatka</span><textarea id="attNote" rows="2" placeholder="np. sektor, problemy, samopoczucie"></textarea></label>
        <button class="btn primary big" id="attSave">Zapisz w dzienniku</button>
        <button class="btn ghost" id="attDrop">Odrzuć sesję</button>
      </section>`;
    view.querySelector('#attSave').addEventListener('click', () => {
      const rpe = Number(view.querySelector('#attRpe').value) || null;
      const note = view.querySelector('#attNote').value.trim();
      update((st) => st.sessions.push({
        id: uid(), created: Date.now(), date: today(), type: modeById(s.mode).type,
        duration: sessionMinutes(s.startedAt, s.endedAt), rpe,
        notes: [summaryText(s.attempts, s.mode), note].filter(Boolean).join('\n'),
        attempt_mode: s.mode, attempts: s.attempts,
      }));
      clear();
      s = null;
      toast('Zapisano sesję w dzienniku');
      render();
    });
    view.querySelector('#attDrop').addEventListener('click', () => {
      if (!confirm('Odrzucić sesję? Nie trafi do dziennika.')) return;
      clear();
      s = null;
      render();
    });
  }

  render();
  return () => {
    clearInterval(interval);
    unlock();
    document.removeEventListener('visibilitychange', onVis);
  };
}
