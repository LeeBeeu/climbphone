// Ekran „Najbliższy trening”: checklista na konkretny dzień – plan przed treningiem, odhaczanie i zmiany w trakcie,
// na końcu wpis do dziennika. Logika w session-calc.js.
import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDate } from './ui.js';
import { weekKeyOf, effectiveDays } from './plan-calc.js';
import { allExercises, allWorkouts, CATEGORIES, timerPresetFrom } from './library-calc.js';
import {
  PLACES, placeLabel, newSession, gearFor, planSources, itemsFromPlan, itemsFromWorkout, itemFromExercise, itemFromText,
  sessionProgress, moveItem, elapsedMinutes, finishSummary, matchPreset,
} from './session-calc.js';
import { selectTimerPreset, BUILTIN } from './timer.js';
import { openJournalWith } from './journal.js';

const all = () => allExercises(getState().customExercises);
const DAY_MS = 86_400_000;
const shiftDay = (key, n) => new Date(Date.UTC(...key.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) + n * DAY_MS).toISOString().slice(0, 10);

export function dayLabel(date) {
  const t = today();
  if (date === t) return 'dziś';
  if (date === shiftDay(t, 1)) return 'jutro';
  if (date === shiftDay(t, -1)) return 'wczoraj';
  return fmtDate(date);
}

// Protokół timera dla ćwiczenia (jak „Uruchom w timerze” w bibliotece) i przejście do timera.
export function startTimerFor(e) {
  const preset = timerPresetFrom(e);
  if (!preset) return;
  update((s) => {
    const i = s.timerPresets.findIndex((p) => p.id === preset.id);
    if (i < 0) s.timerPresets.push(preset);
    else if (e.custom) s.timerPresets[i] = { ...s.timerPresets[i], ...e.timer, name: e.name };
  });
  selectTimerPreset(preset.id);
  location.hash = '#/timer';
}

function ensureSession(s) {
  if (!s.nextSession) s.nextSession = newSession({ id: uid(), date: today(), lastGear: s.settings.gear_last, idFn: uid });
  return s.nextSession;
}

// Dopisanie pozycji z biblioteki (ćwiczenie albo trening); zakłada trening na dziś, jeśli go nie ma.
export function addToNextSession(kind, obj) {
  let added = 0;
  update((s) => {
    const ns = ensureSession(s);
    const list = kind === 'workout' ? itemsFromWorkout(obj, allExercises(s.customExercises), uid) : [itemFromExercise(obj, uid)];
    for (const it of list) {
      if (!ns.items.some((x) => x.exId && x.exId === it.exId)) { ns.items.push(it); added++; }
    }
  });
  return added;
}

// Odhaczenie pozycji planu tygodnia razem z pozycją treningu.
function syncPlanCheck(s, item) {
  if (!item.src) return;
  const key = `${item.src.planId}|${item.src.week}`;
  const checks = (s.planChecks[key] ||= {});
  if (item.done && !item.skipped) checks[item.src.key] = true; else delete checks[item.src.key];
}

// Karta na ekranie Plany.
export function sessionCardHtml() {
  const ns = getState().nextSession;
  if (!ns) {
    return `<section class="card next-card">
      <div class="card-head"><h2>Najbliższy trening</h2></div>
      <p class="muted">Zaplanuj konkretny trening: ćwiczenia z planu tygodnia lub biblioteki i rzeczy do zabrania – jako checklista do odhaczania w trakcie.</p>
      <a class="btn primary" href="#/trening">＋ Zaplanuj trening</a>
    </section>`;
  }
  const pr = sessionProgress(ns);
  return `<a class="card next-card link-card" href="#/trening">
    <div class="card-head"><h2>Najbliższy trening</h2><span class="muted">${pr.done}/${pr.total}</span></div>
    <p><strong>${esc(ns.title || placeLabel(ns.place))}</strong> · ${esc(dayLabel(ns.date))}${ns.startedAt ? ' · <span class="up">w trakcie</span>' : ''}</p>
    <div class="meter"><div style="width:${pr.pct}%"></div></div>
  </a>`;
}

let openItem = null; // pozycja z rozwiniętymi akcjami
let gearOpen = null; // null – automatycznie

export function renderSession(view) {
  let timerId = null;

  function save(fn) { update((s) => { if (s.nextSession) fn(s.nextSession, s); }); render(); }

  function render() {
    const st = getState();
    const ns = st.nextSession;
    clearInterval(timerId);
    if (!ns) return renderEmpty();

    const pr = sessionProgress(ns);
    const exs = all();
    const exOf = (i) => (i.exId ? exs.find((e) => e.id === i.exId) : null);
    // Do timera: ćwiczenie z protokołem albo pozycja „Timer: …” z nazwą protokołu.
    const presets = [...BUILTIN, ...st.timerPresets];
    const timerOf = (i) => (exOf(i)?.kind === 'timer' ? { ex: exOf(i) } : (() => { const p = matchPreset(i.text, presets); return p ? { preset: p.id } : null; })());
    const week = weekKeyOf(ns.date);
    const sources = planSources(st.plans, week);
    const workouts = allWorkouts(st.workouts);
    const gearDone = ns.gear.filter((g) => g.done).length;
    const showGear = gearOpen ?? (!ns.startedAt && gearDone < ns.gear.length);
    const started = ns.startedAt ? new Date(ns.startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';

    view.innerHTML = `
      <section class="card">
        <div class="card-head"><h2>Trening ${esc(dayLabel(ns.date))}</h2><span class="muted">${pr.done}/${pr.total}</span></div>
        <div class="seg" id="place">${PLACES.map((p) => `<button type="button" data-p="${p.id}" class="${p.id === ns.place ? 'active' : ''}">${p.icon} ${p.label}</button>`).join('')}</div>
        <div class="grid2">
          <label class="field"><span>Data</span><input type="date" id="sdate" value="${ns.date}"></label>
          <label class="field"><span>Nazwa (opcjonalnie)</span><input id="stitle" maxlength="60" value="${esc(ns.title)}" placeholder="np. Siła palców"></label>
        </div>
        <div class="meter"><div style="width:${pr.pct}%"></div></div>
        <p class="muted">${pr.total ? `Zrobione ${pr.done} z ${pr.total}${pr.skipped ? `, pominięte ${pr.skipped}` : ''}.` : 'Dodaj ćwiczenia poniżej.'}
          ${ns.startedAt ? ` W trakcie od ${started} (<span id="elapsed">${elapsedMinutes(ns)}</span> min).` : ''}</p>
        ${ns.startedAt ? '' : '<button class="btn primary big" id="startS">▶ Zaczynam trening</button>'}
      </section>

      <details class="card" id="gearBox" ${showGear ? 'open' : ''}>
        <summary class="card-sum"><strong>🎒 Co zabrać</strong> <span class="muted">${gearDone}/${ns.gear.length}</span></summary>
        ${ns.gear.map((g) => `
          <div class="ns-row">
            <label class="check ${g.done ? 'done' : ''}"><input type="checkbox" data-gear="${g.id}" ${g.done ? 'checked' : ''}><span>${esc(g.text)}</span></label>
            <button class="icon" data-rmgear="${g.id}" aria-label="Usuń ${esc(g.text)}">✕</button>
          </div>`).join('')}
        <form class="add-row" id="gearForm"><input id="gearText" maxlength="60" placeholder="Dodaj rzecz…"><button class="btn small">＋</button></form>
      </details>

      <section class="card">
        <h3>📋 Plan treningu</h3>
        ${ns.items.length ? '' : '<p class="muted">Pusto. Dodaj dzień z planu tygodnia, trening z biblioteki albo własną pozycję.</p>'}
        ${ns.items.map((it, idx) => {
          const open = openItem === it.id;
          return `
          <div class="ns-item ${it.skipped ? 'skipped' : ''}">
            <div class="ns-row">
              <label class="check ${it.done ? 'done' : ''}">
                <input type="checkbox" data-done="${it.id}" ${it.done ? 'checked' : ''} ${it.skipped ? 'disabled' : ''}>
                <span>${esc(it.text)}${it.skipped ? ' <small class="muted">(pominięte)</small>' : ''}</span></label>
              ${timerOf(it) && !it.skipped ? `<button class="icon" data-timer="${it.id}" aria-label="Uruchom w timerze">⏱</button>` : ''}
              <button class="icon" data-more="${it.id}" aria-label="Zmień" aria-expanded="${open}">⋯</button>
            </div>
            ${open ? `
            <div class="ns-edit">
              <form class="add-row" data-editform="${it.id}"><input data-edit="${it.id}" maxlength="120" value="${esc(it.text)}"><button class="btn small">Zapisz</button></form>
              <div class="row-links">
                <button class="btn ghost small" data-mv="${idx}|-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn ghost small" data-mv="${idx}|1" ${idx === ns.items.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn ghost small" data-skip="${it.id}">${it.skipped ? '↺ Przywróć' : '⏭ Pomiń'}</button>
                <button class="btn ghost small danger-text" data-rm="${it.id}">🗑 Usuń</button>
              </div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </section>

      <section class="card">
        <h3>＋ Dodaj</h3>
        <label class="field"><span>Z planu albo biblioteki</span>
          <select id="addSrc">
            <option value="">– wybierz –</option>
            ${sources.length ? `<optgroup label="Plan tygodnia ${week.split('-W')[1]}">${sources.map((x) => `<option value="plan:${esc(x.value)}">${esc(x.label)} (${x.count})</option>`).join('')}</optgroup>` : ''}
            <optgroup label="Treningi z biblioteki">${workouts.map((w) => `<option value="wk:${esc(w.id)}">${esc(w.name)}</option>`).join('')}</optgroup>
            ${CATEGORIES.map((c) => {
              const list = exs.filter((e) => e.cat === c.id);
              return list.length ? `<optgroup label="${esc(c.label)}">${list.map((e) => `<option value="ex:${esc(e.id)}">${esc(e.name)}</option>`).join('')}</optgroup>` : '';
            }).join('')}
          </select></label>
        <button class="btn" id="addSel">＋ Dodaj wybrane</button>
        <form class="add-row" id="addForm"><input id="addText" maxlength="120" placeholder="Własna pozycja, np. 3 drogi 6b na rozgrzewkę"><button class="btn small">＋</button></form>
      </section>

      <button class="btn primary big" id="finish">✓ Zakończ i zapisz w dzienniku</button>
      <div class="row">
        <button class="btn ghost" id="toPlans">← Plany</button>
        <button class="btn danger" id="delS">🗑️ Usuń trening</button>
      </div>`;

    bind(ns, timerOf);
    if (ns.startedAt) {
      timerId = setInterval(() => {
        const el = view.querySelector('#elapsed');
        const cur = getState().nextSession;
        if (el && cur) el.textContent = elapsedMinutes(cur);
      }, 30000);
    }
  }

  function renderEmpty() {
    const t = today();
    view.innerHTML = `
      <section class="card">
        <h2>Najbliższy trening</h2>
        <p class="muted">Ułóż trening na konkretny dzień: ćwiczenia z planu tygodnia albo biblioteki i listę rzeczy do zabrania.
          W trakcie odhaczasz, pomijasz, zmieniasz dawki i dopisujesz, a na końcu wszystko trafia do dziennika.</p>
        <form id="newForm">
          <div class="seg" id="place">${PLACES.map((p, i) => `<button type="button" data-p="${p.id}" class="${i === 0 ? 'active' : ''}">${p.icon} ${p.label}</button>`).join('')}</div>
          <label class="field"><span>Kiedy</span>
            <select id="ndate"><option value="${t}">Dziś</option><option value="${shiftDay(t, 1)}">Jutro</option><option value="${shiftDay(t, 2)}">Pojutrze</option></select></label>
          <button class="btn primary big">＋ Zaplanuj trening</button>
        </form>
      </section>
      <button class="btn ghost" id="toPlans">← Plany</button>`;
    let place = 'gym';
    view.querySelectorAll('#place button').forEach((b) => b.addEventListener('click', () => {
      place = b.dataset.p;
      view.querySelectorAll('#place button').forEach((x) => x.classList.toggle('active', x === b));
    }));
    view.querySelector('#newForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const date = view.querySelector('#ndate').value;
      update((s) => { s.nextSession = newSession({ id: uid(), date, place, lastGear: s.settings.gear_last, idFn: uid }); });
      gearOpen = null;
      render();
    });
    view.querySelector('#toPlans').addEventListener('click', () => { location.hash = '#/plany'; });
  }

  function bind(ns, timerOf) {
    const $ = (sel) => view.querySelector(sel);
    const $$ = (sel) => view.querySelectorAll(sel);
    const item = (n, id) => n.items.find((i) => i.id === id);

    $$('#place button').forEach((b) => b.addEventListener('click', () => save((n, s) => {
      if (n.place === b.dataset.p) return;
      n.place = b.dataset.p;
      // Lista rzeczy dla nowego miejsca – o ile nic jeszcze nie odhaczono.
      if (!n.gear.some((g) => g.done)) n.gear = gearFor(n.place, s.settings.gear_last, uid);
    })));
    $('#sdate').addEventListener('change', (ev) => { if (ev.target.value) save((n) => { n.date = ev.target.value; }); });
    $('#stitle').addEventListener('change', (ev) => save((n) => { n.title = ev.target.value.trim(); }));
    $('#startS')?.addEventListener('click', () => { gearOpen = false; save((n) => { n.startedAt = Date.now(); }); });

    // Co zabrać – zmiany listy zapamiętujemy jako domyślne dla miejsca.
    const rememberGear = (n, s) => { (s.settings.gear_last ||= {})[n.place] = n.gear.map((g) => g.text); };
    $('#gearBox').addEventListener('toggle', (ev) => { gearOpen = ev.target.open; });
    $$('[data-gear]').forEach((cb) => cb.addEventListener('change', () => save((n) => {
      const g = n.gear.find((x) => x.id === cb.dataset.gear);
      if (g) g.done = cb.checked;
    })));
    $$('[data-rmgear]').forEach((b) => b.addEventListener('click', () => save((n, s) => {
      n.gear = n.gear.filter((g) => g.id !== b.dataset.rmgear);
      rememberGear(n, s);
    })));
    $('#gearForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = $('#gearText').value.trim();
      if (!text) return;
      gearOpen = true;
      save((n, s) => { n.gear.push({ id: uid(), text, done: false }); rememberGear(n, s); });
      view.querySelector('#gearText')?.focus();
    });

    // Pozycje treningu
    $$('[data-done]').forEach((cb) => cb.addEventListener('change', () => save((n, s) => {
      const it = item(n, cb.dataset.done);
      if (!it) return;
      it.done = cb.checked;
      syncPlanCheck(s, it);
    })));
    $$('[data-more]').forEach((b) => b.addEventListener('click', () => {
      openItem = openItem === b.dataset.more ? null : b.dataset.more;
      render();
    }));
    $$('[data-timer]').forEach((b) => b.addEventListener('click', () => {
      const t = timerOf(item(ns, b.dataset.timer));
      if (t?.ex) startTimerFor(t.ex);
      else if (t?.preset) { selectTimerPreset(t.preset); location.hash = '#/timer'; }
    }));
    $$('[data-editform]').forEach((f) => f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = f.querySelector('input').value.trim();
      if (!text) return;
      openItem = null;
      save((n) => { const it = item(n, f.dataset.editform); if (it) it.text = text; });
    }));
    $$('[data-mv]').forEach((b) => b.addEventListener('click', () => {
      const [idx, dir] = b.dataset.mv.split('|').map(Number);
      save((n) => { n.items = moveItem(n.items, idx, dir); });
    }));
    $$('[data-skip]').forEach((b) => b.addEventListener('click', () => {
      openItem = null;
      save((n, s) => {
        const it = item(n, b.dataset.skip);
        if (!it) return;
        it.skipped = !it.skipped;
        if (it.skipped) it.done = false;
        syncPlanCheck(s, it);
      });
    }));
    $$('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      openItem = null;
      save((n) => { n.items = n.items.filter((i) => i.id !== b.dataset.rm); });
    }));

    // Dodawanie
    $('#addSel').addEventListener('click', () => {
      const val = $('#addSrc').value;
      if (!val) return toast('Wybierz, co dodać');
      const [kind, ...rest] = val.split(':');
      const ref = rest.join(':');
      let added = 0;
      save((n, s) => {
        const exs = allExercises(s.customExercises);
        let list = [];
        if (kind === 'plan') {
          const [planId, part] = ref.split('|');
          const plan = s.plans.find((p) => p.id === planId);
          const week = weekKeyOf(n.date);
          if (plan) list = itemsFromPlan(plan, week, part, { checks: s.planChecks[`${planId}|${week}`] || {}, all: exs, existing: n.items, idFn: uid });
          const day = plan && part !== 'pool' ? effectiveDays(plan, week)[Number(part.slice(1))] : null;
          if (!n.title && day) n.title = `${plan.name} – ${day.name}`;
        } else if (kind === 'wk') {
          const w = allWorkouts(s.workouts).find((x) => x.id === ref);
          if (w) { list = itemsFromWorkout(w, exs, uid); if (!n.title) n.title = w.name; }
        } else if (kind === 'ex') {
          const e = exs.find((x) => x.id === ref);
          if (e) list = [itemFromExercise(e, uid)];
        }
        n.items.push(...list);
        added = list.length;
      });
      toast(added ? `Dodano ${added} ${added === 1 ? 'pozycję' : added < 5 ? 'pozycje' : 'pozycji'}` : 'Nic nowego do dodania');
    });
    $('#addForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = $('#addText').value.trim();
      if (!text) return;
      save((n, s) => { n.items.push(itemFromText(text, allExercises(s.customExercises), uid)); });
      view.querySelector('#addText')?.focus();
    });

    $('#finish').addEventListener('click', () => {
      const cur = getState().nextSession;
      const pr = sessionProgress(cur);
      if (!pr.done && !confirm('Nic nie jest odhaczone. Zakończyć i otworzyć wpis w dzienniku mimo to?')) return;
      const summary = finishSummary(cur, all());
      update((s) => { s.nextSession = null; });
      openItem = null;
      gearOpen = null;
      openJournalWith(summary);
      toast('Uzupełnij czas i RPE, potem zapisz');
      location.hash = '#/dziennik';
    });
    $('#delS').addEventListener('click', () => {
      if (!confirm('Usunąć zaplanowany trening? Odhaczenia w planie tygodnia zostaną.')) return;
      update((s) => { s.nextSession = null; });
      openItem = null;
      render();
    });
    $('#toPlans').addEventListener('click', () => { location.hash = '#/plany'; });
  }

  render();
  return () => clearInterval(timerId);
}
