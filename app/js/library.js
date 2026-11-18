// Ekran „Biblioteka”: ćwiczenia (wbudowane i własne) oraz treningi (zestawy ćwiczeń).
// Akcje: dodaj do planu, uruchom w timerze, dodaj do dziennika, kopiuj jako własne, edytuj, usuń.
// Dane: library-data.js (+ state.customExercises, state.workouts), obliczenia: library-calc.js.
import { getState, update, uid } from './store.js';
import { esc, toast } from './ui.js';
import {
  CATEGORIES, EQUIPMENT, KINDS, filterLibrary, catLabel, planItemText, timerPresetFrom, journalExerciseFrom, countByCat,
  allExercises, findExercise, validateExercise, copyAsCustom, allWorkouts, workoutExercises, workoutPlanItems,
  workoutPoolItem, workoutJournal, removeFromWorkouts,
} from './library-calc.js';
import { LEVELS } from './library-data.js';
import { selectTimerPreset } from './timer.js';
import { openJournalWith } from './journal.js';

const filters = { q: '', cat: '', equip: '', level: 0 };
let mode = 'exercises';  // 'exercises' | 'workouts'
let openId = null;       // otwarte ćwiczenie
let openWorkout = null;  // otwarty trening
let backTo = null;       // powrót z ćwiczenia do treningu
let exDraft = null;      // formularz ćwiczenia (nowe albo edycja własnego)
let wkDraft = null;      // edytor treningu
let lastPlanId = null;

const levelDots = (n) => `<span class="lvl" title="${LEVELS[n]}" aria-label="Poziom: ${LEVELS[n]}">${'●'.repeat(n)}${'○'.repeat(3 - n)}</span>`;
const custom = () => getState().customExercises;
const all = () => allExercises(custom());

// Rodzaj treningu w dzienniku dla ćwiczenia z biblioteki.
function sessionType(e) {
  if (!e) return null;
  if (e.cat === 'fingers') return 'Chwytotablica';
  if (e.equip.includes('campus')) return 'Kampus';
  if (e.cat === 'mobility') return 'Mobilność / rozciąganie';
  if (['strength', 'core', 'antagonist', 'warmup'].includes(e.cat)) return 'Siła / ogólnorozwojówka';
  if (e.cat === 'endurance') return 'Wytrzymałość / ARC';
  return null;
}

function planOptions(plans) {
  return [...plans.map((p) => `<option value="${p.id}" ${p.id === lastPlanId ? 'selected' : ''}>${esc(p.name)}</option>`),
    '<option value="__new">+ Nowy plan „Mój plan”</option>'].join('');
}
function targetOptions(plan) {
  const days = plan ? plan.days.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`) : [];
  return ['<option value="pool">Pula tygodnia (dowolny dzień)</option>', ...days].join('');
}
function planCardHtml(note) {
  const { plans } = getState();
  const sel = plans.find((p) => p.id === lastPlanId) || plans[0] || null;
  if (sel) lastPlanId = sel.id;
  return `
    <section class="card">
      <h2>Dodaj do planu</h2>
      <div class="grid2">
        <label class="field"><span>Plan</span><select id="lplan">${planOptions(plans)}</select></label>
        <label class="field"><span>Gdzie</span><select id="ltarget">${targetOptions(sel)}</select></label>
      </div>
      <p class="muted">${note}</p>
      <button class="btn" id="toPlan">+ Dodaj do planu</button>
    </section>`;
}

// Dopisuje pozycje do szablonu planu; zwraca { name, added }.
function addToPlan(planVal, target, poolText, dayTexts) {
  let name = '';
  let added = 0;
  update((s) => {
    let plan = s.plans.find((p) => p.id === planVal);
    if (!plan) {
      plan = { id: uid(), name: 'Mój plan', desc: '', days: [], pool: [], weeks: {} };
      s.plans.push(plan);
    }
    lastPlanId = plan.id;
    name = plan.name;
    const list = target === 'pool' ? (plan.pool ||= []) : plan.days[Number(target)].items;
    for (const text of target === 'pool' ? [poolText] : dayTexts) {
      if (!list.includes(text)) { list.push(text); added++; }
    }
  });
  return { name, added };
}

export function renderLibrary(view) {
  const go = () => { render(); window.scrollTo(0, 0); };

  function render() {
    if (exDraft) return renderExerciseForm();
    if (wkDraft) return renderWorkoutEditor();
    const e = openId ? findExercise(openId, custom()) : null;
    if (e) return renderExercise(e);
    const w = openWorkout ? allWorkouts(getState().workouts).find((x) => x.id === openWorkout) : null;
    if (w) return renderWorkout(w);
    openId = null;
    openWorkout = null;
    return mode === 'workouts' ? renderWorkoutList() : renderExerciseList();
  }

  const modeHtml = () => `
    <div class="seg" id="lmode">
      <button data-m="exercises" class="${mode === 'exercises' ? 'active' : ''}">Ćwiczenia (${all().length})</button>
      <button data-m="workouts" class="${mode === 'workouts' ? 'active' : ''}">Treningi (${allWorkouts(getState().workouts).length})</button>
    </div>`;
  const bindMode = () => view.querySelectorAll('#lmode button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.m;
    go();
  }));

  // ---------- Lista ćwiczeń ----------

  function listHtml() {
    const list = filterLibrary(all(), filters);
    if (!list.length) return '<div class="empty">Nic nie pasuje do filtrów.<br>Spróbuj innego słowa albo wyczyść filtry.</div>';
    return CATEGORIES.map((c) => {
      const items = list.filter((e) => e.cat === c.id);
      if (!items.length) return '';
      return `<h3 class="group-title">${c.icon} ${esc(c.label)} <small class="muted">(${items.length})</small></h3>
        <ul class="list">${items.map((e) => `
          <li><button class="item lib-item" data-open="${e.id}">
            <div class="item-main">
              <div class="item-title">${esc(e.name)}${e.custom ? ' <span class="own-tag">własne</span>' : ''}</div>
              <div class="item-sub">${esc(e.dose)}</div>
              <div class="item-sub">${levelDots(e.level)} ${esc(e.equip.map((k) => EQUIPMENT[k]).join(', '))}</div>
            </div>
            <span class="muted" aria-hidden="true">›</span>
          </button></li>`).join('')}</ul>`;
    }).join('');
  }

  function renderExerciseList() {
    const counts = countByCat(all());
    view.innerHTML = `
      ${modeHtml()}
      <section class="card">
        <label class="field"><span class="sr-only">Szukaj</span>
          <input type="search" id="lq" placeholder="Szukaj, np. palce, kampus, łopatki…" value="${esc(filters.q)}" autocomplete="off"></label>
        <div class="chips" id="lcat" role="group" aria-label="Kategoria">
          <button data-cat="" class="${filters.cat ? '' : 'active'}">Wszystkie (${all().length})</button>
          ${CATEGORIES.map((c) => `<button data-cat="${c.id}" class="${filters.cat === c.id ? 'active' : ''}">${c.icon} ${esc(c.label)} (${counts[c.id]})</button>`).join('')}
        </div>
        <div class="grid2">
          <label class="field"><span>Sprzęt</span>
            <select id="lequip"><option value="">dowolny</option>
              ${Object.entries(EQUIPMENT).map(([k, v]) => `<option value="${k}" ${filters.equip === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
            </select></label>
          <label class="field"><span>Poziom</span>
            <select id="llevel"><option value="0">każdy</option>
              <option value="1" ${filters.level === 1 ? 'selected' : ''}>tylko początkujący</option>
              <option value="2" ${filters.level === 2 ? 'selected' : ''}>do średniozaawansowanego</option>
            </select></label>
        </div>
        <p class="muted">Opisy są ogólną wiedzą treningową, nie zastępują trenera. ● początkujący · ●● po ok. 1–2 latach · ●●● zaawansowani.</p>
      </section>
      <button class="btn primary" id="newEx">+ Własne ćwiczenie</button>
      <div id="libList">${listHtml()}</div>`;

    bindMode();
    const drawList = () => {
      view.querySelector('#libList').innerHTML = listHtml();
      bindOpen();
    };
    view.querySelector('#lq').addEventListener('input', (ev) => { filters.q = ev.target.value; drawList(); });
    view.querySelectorAll('#lcat button').forEach((b) => b.addEventListener('click', () => {
      filters.cat = b.dataset.cat;
      view.querySelectorAll('#lcat button').forEach((x) => x.classList.toggle('active', x === b));
      drawList();
    }));
    view.querySelector('#lequip').addEventListener('change', (ev) => { filters.equip = ev.target.value; drawList(); });
    view.querySelector('#llevel').addEventListener('change', (ev) => { filters.level = Number(ev.target.value); drawList(); });
    view.querySelector('#newEx').addEventListener('click', () => {
      exDraft = { id: null, name: '', cat: filters.cat || 'fingers', level: 1, equip: ['wall'], kind: 'sets', dose: '', how: '', tips: '',
        timer: { prep: 10, hang: 10, rest: 0, reps: 1, sets: 5, setRest: 180 }, sets: { sets: 3, reps: 8, bodyweight: true } };
      go();
    });
    bindOpen();
  }

  function bindOpen() {
    view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      openId = b.dataset.open;
      go();
    }));
  }

  // ---------- Szczegóły ćwiczenia ----------

  function renderExercise(e) {
    const own = getState().workouts;
    view.innerHTML = `
      <button class="btn ghost small" id="lback" style="align-self:flex-start">← ${backTo ? 'Trening' : 'Biblioteka'}</button>
      <section class="card">
        <h2>${esc(e.name)}</h2>
        <p class="lib-meta"><span class="phase-chip">${esc(catLabel(e.cat))}</span> ${levelDots(e.level)} <small class="muted">${esc(LEVELS[e.level])}</small>
          ${e.custom ? '<span class="own-tag">własne</span>' : ''}</p>
        <p class="muted">Sprzęt: ${esc(e.equip.map((k) => EQUIPMENT[k]).join(', '))} · ${KINDS[e.kind]}</p>
        <p><strong>${esc(e.dose)}</strong></p>
        <h3>Jak wykonać</h3>
        <p class="pre">${esc(e.how)}</p>
        ${e.tips ? `<h3>Progresja i wskazówki</h3><p class="pre">${esc(e.tips)}</p>` : ''}
        ${e.caution ? `<p class="hint">⚠️ ${esc(e.caution)}</p>` : ''}
        ${e.kind === 'timer' ? `<p class="muted">Timer: ${e.timer.sets} × ${e.timer.reps} · zwis ${e.timer.hang} s / przerwa ${e.timer.rest} s · między seriami ${e.timer.setRest} s</p>` : ''}
        <div class="row">
          ${e.custom
            ? '<button class="btn ghost small" id="editEx">✏️ Edytuj</button><button class="btn ghost small danger" id="delEx">🗑️ Usuń</button>'
            : '<button class="btn ghost small" id="copyEx">⧉ Kopiuj jako własne</button>'}
        </div>
      </section>
      ${e.kind === 'timer' ? '<button class="btn primary big" id="toTimer">▶ Uruchom w timerze</button>' : ''}
      ${e.kind === 'sets' ? '<button class="btn primary big" id="toJournal">📓 Dodaj do dziennika</button>' : ''}
      ${planCardHtml(`Pozycja: „${esc(planItemText(e))}”. Trafi do szablonu planu (wszystkie tygodnie).`)}
      <section class="card">
        <h2>Dodaj do treningu</h2>
        <div class="grid2">
          <label class="field"><span>Trening</span>
            <select id="lwk">${own.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}<option value="__new">+ Nowy trening</option></select></label>
          <button class="btn" id="toWorkout" style="align-self:end">+ Dodaj</button>
        </div>
      </section>`;

    view.querySelector('#lback').addEventListener('click', () => {
      openId = null;
      if (backTo) { openWorkout = backTo; backTo = null; }
      go();
    });
    bindPlanCard((planVal, target) => addToPlan(planVal, target, planItemText(e), [planItemText(e)]));
    view.querySelector('#copyEx')?.addEventListener('click', () => {
      exDraft = copyAsCustom(e, null);
      go();
    });
    view.querySelector('#editEx')?.addEventListener('click', () => { exDraft = structuredClone(e); go(); });
    view.querySelector('#delEx')?.addEventListener('click', () => {
      const used = getState().workouts.filter((w) => w.items.includes(e.id)).length;
      if (!confirm(`Usunąć „${e.name}”?${used ? `\nZniknie też z ${used} ${used === 1 ? 'treningu' : 'treningów'}.` : ''}\nWpisy w dzienniku i planach zostają.`)) return;
      update((s) => {
        s.customExercises = s.customExercises.filter((x) => x.id !== e.id);
        s.workouts = removeFromWorkouts(s.workouts, e.id);
      });
      toast('Usunięto ćwiczenie');
      openId = null;
      go();
    });
    view.querySelector('#toTimer')?.addEventListener('click', () => {
      const preset = timerPresetFrom(e);
      update((s) => {
        const i = s.timerPresets.findIndex((p) => p.id === preset.id);
        if (i < 0) s.timerPresets.push(preset);
        else if (e.custom) s.timerPresets[i] = { ...s.timerPresets[i], ...e.timer, name: e.name }; // własne: czasy po edycji
      });
      selectTimerPreset(preset.id);
      location.hash = '#/timer';
    });
    view.querySelector('#toJournal')?.addEventListener('click', () => {
      openJournalWith({ exercises: [journalExerciseFrom(e)], type: sessionType(e) });
      location.hash = '#/dziennik';
    });
    view.querySelector('#toWorkout').addEventListener('click', () => {
      const val = view.querySelector('#lwk').value;
      let name = '';
      let dup = false;
      update((s) => {
        let w = s.workouts.find((x) => x.id === val);
        if (!w) {
          w = { id: `wk-${uid()}`, name: `Mój trening ${s.workouts.length + 1}`, desc: '', items: [] };
          s.workouts.push(w);
        }
        name = w.name;
        if (w.items.includes(e.id)) dup = true; else w.items.push(e.id);
      });
      toast(dup ? `Już jest w treningu „${name}”` : `Dodano do treningu „${name}”`);
      render();
    });
  }

  function bindPlanCard(onAdd) {
    const plans = getState().plans;
    view.querySelector('#lplan').addEventListener('change', (ev) => {
      lastPlanId = ev.target.value === '__new' ? null : ev.target.value;
      view.querySelector('#ltarget').innerHTML = targetOptions(plans.find((p) => p.id === lastPlanId));
    });
    view.querySelector('#toPlan').addEventListener('click', () => {
      const { name, added } = onAdd(view.querySelector('#lplan').value, view.querySelector('#ltarget').value);
      toast(added ? `Dodano do planu „${name}”` : `Już jest w planie „${name}”`);
      render();
    });
  }

  // ---------- Formularz własnego ćwiczenia ----------

  function renderExerciseForm() {
    const d = exDraft;
    const editing = !!d.id;
    const num = (name, label, val, min = 0, max = 3600) => `<label class="field"><span>${label}</span>
      <input type="number" inputmode="numeric" name="${name}" min="${min}" max="${max}" value="${val}"></label>`;
    view.innerHTML = `
      <form class="card" id="exForm">
        <h2>${editing ? 'Edytuj własne ćwiczenie' : 'Własne ćwiczenie'}</h2>
        <label class="field"><span>Nazwa</span><input name="name" maxlength="80" value="${esc(d.name)}" required></label>
        <div class="grid2">
          <label class="field"><span>Kategoria</span>
            <select name="cat">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === d.cat ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Poziom</span>
            <select name="level">${[1, 2, 3].map((n) => `<option value="${n}" ${n === d.level ? 'selected' : ''}>${esc(LEVELS[n])}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Rodzaj</span>
          <select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        ${d.kind === 'timer' ? `<div class="grid2">
          ${num('prep', 'Przygotowanie (s)', d.timer.prep)}${num('hang', 'Zwis / praca (s)', d.timer.hang, 1)}
          ${num('rest', 'Odpoczynek (s)', d.timer.rest)}${num('reps', 'Powtórzenia', d.timer.reps, 1)}
          ${num('sets', 'Serie', d.timer.sets, 1)}${num('setRest', 'Przerwa między seriami (s)', d.timer.setRest)}
        </div>` : ''}
        ${d.kind === 'sets' ? `<div class="grid2">
          ${num('setsN', 'Serie', d.sets.sets, 1, 20)}${num('reps', 'Powtórzenia', d.sets.reps, 1, 200)}
        </div>
        <label class="check"><input type="checkbox" name="bodyweight" ${d.sets.bodyweight ? 'checked' : ''}>
          <span>Z masą ciała (kg w dzienniku to dociążenie, liczymy % masy ciała)</span></label>` : ''}
        <fieldset class="day"><strong>Sprzęt</strong>
          <div class="equip-grid">${Object.entries(EQUIPMENT).map(([k, v]) => `<label class="check"><input type="checkbox" name="equip" value="${k}" ${d.equip.includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
        </fieldset>
        <label class="field"><span>Dawka</span><input name="dose" maxlength="120" value="${esc(d.dose)}" placeholder="np. 4 × 6, 3 min przerwy"></label>
        <label class="field"><span>Jak wykonać</span><textarea name="how" rows="4" maxlength="1000">${esc(d.how)}</textarea></label>
        <label class="field"><span>Progresja i wskazówki (opcjonalnie)</span><textarea name="tips" rows="3" maxlength="1000">${esc(d.tips || '')}</textarea></label>
        <div class="row">
          <button type="button" class="btn ghost" id="exCancel">Anuluj</button>
          <button class="btn primary">Zapisz ćwiczenie</button>
        </div>
      </form>`;

    const f = view.querySelector('#exForm');
    const int = (n) => parseInt(f.elements[n]?.value, 10);
    function sync() {
      d.name = f.elements.name.value;
      d.cat = f.elements.cat.value;
      d.level = Number(f.elements.level.value);
      d.dose = f.elements.dose.value;
      d.how = f.elements.how.value;
      d.tips = f.elements.tips.value;
      d.equip = [...f.querySelectorAll('[name="equip"]:checked')].map((x) => x.value);
      if (d.kind === 'timer') ['prep', 'hang', 'rest', 'reps', 'sets', 'setRest'].forEach((k) => { d.timer[k] = int(k); });
      if (d.kind === 'sets') d.sets = { sets: int('setsN'), reps: int('reps'), bodyweight: f.elements.bodyweight.checked };
    }
    f.elements.kind.addEventListener('change', () => {
      sync();
      d.kind = f.elements.kind.value;
      d.timer ||= { prep: 10, hang: 10, rest: 0, reps: 1, sets: 5, setRest: 180 };
      d.sets ||= { sets: 3, reps: 8, bodyweight: true };
      render();
    });
    view.querySelector('#exCancel').addEventListener('click', () => { exDraft = null; go(); });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      sync();
      const id = d.id || `own-${uid()}`;
      const ex = {
        id, name: d.name.trim(), cat: d.cat, level: d.level, equip: d.equip, kind: d.kind, dose: d.dose.trim(),
        how: d.how.trim(), tips: (d.tips || '').trim(), custom: true,
        ...(d.caution ? { caution: d.caution } : {}),
        ...(d.kind === 'timer' ? { timer: { ...d.timer } } : {}),
        ...(d.kind === 'sets' ? { sets: { ...d.sets } } : {}),
      };
      const err = validateExercise(ex, all());
      if (err) return toast(err);
      update((s) => {
        const i = s.customExercises.findIndex((x) => x.id === id);
        if (i >= 0) s.customExercises[i] = ex; else s.customExercises.push(ex);
      });
      toast(d.id ? 'Zapisano zmiany' : 'Dodano ćwiczenie do biblioteki');
      exDraft = null;
      openId = id;
      go();
    });
  }

  // ---------- Treningi ----------

  function renderWorkoutList() {
    const list = allWorkouts(getState().workouts);
    const ex = all();
    view.innerHTML = `
      ${modeHtml()}
      <p class="muted">Trening to zestaw ćwiczeń z biblioteki w kolejności wykonania. Możesz dodać go do planu albo do dziennika jednym przyciskiem.</p>
      <button class="btn primary" id="newWk">+ Nowy trening</button>
      <ul class="list">${list.map((w) => {
        const n = workoutExercises(w, ex).length;
        return `<li><button class="item lib-item" data-wk="${w.id}">
          <div class="item-main">
            <div class="item-title">${esc(w.name)}${w.builtin ? '' : ' <span class="own-tag">własny</span>'}</div>
            <div class="item-sub">${n} ${n === 1 ? 'ćwiczenie' : n < 5 ? 'ćwiczenia' : 'ćwiczeń'}${w.desc ? ` · ${esc(w.desc)}` : ''}</div>
          </div>
          <span class="muted" aria-hidden="true">›</span>
        </button></li>`;
      }).join('')}</ul>`;
    bindMode();
    view.querySelector('#newWk').addEventListener('click', () => { wkDraft = { id: null, name: '', desc: '', items: [] }; go(); });
    view.querySelectorAll('[data-wk]').forEach((b) => b.addEventListener('click', () => { openWorkout = b.dataset.wk; go(); }));
  }

  function renderWorkout(w) {
    const ex = workoutExercises(w, all());
    view.innerHTML = `
      <button class="btn ghost small" id="wback" style="align-self:flex-start">← Treningi</button>
      <section class="card">
        <h2>${esc(w.name)}</h2>
        ${w.desc ? `<p class="muted">${esc(w.desc)}</p>` : ''}
        <ol class="wk-list">${ex.map((e) => `<li><button class="link" data-open="${e.id}">${esc(e.name)}</button>
          <small class="muted">${esc(e.dose)}</small></li>`).join('')}</ol>
        ${ex.length < w.items.length ? '<p class="muted">Część ćwiczeń usunięto z biblioteki – pominięte.</p>' : ''}
        <div class="row">
          ${w.builtin
            ? '<button class="btn ghost small" id="copyWk">⧉ Kopiuj jako własny</button>'
            : '<button class="btn ghost small" id="editWk">✏️ Edytuj</button><button class="btn ghost small danger" id="delWk">🗑️ Usuń</button>'}
        </div>
      </section>
      <button class="btn primary big" id="wkJournal">📓 Dodaj do dziennika</button>
      ${planCardHtml(`Do dnia: każde ćwiczenie osobną pozycją (${ex.length}). Do puli: jedna pozycja „${esc(workoutPoolItem(w))}”.`)}`;

    view.querySelector('#wback').addEventListener('click', () => { openWorkout = null; go(); });
    view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      backTo = w.id;
      openWorkout = null;
      openId = b.dataset.open;
      go();
    }));
    bindPlanCard((planVal, target) => addToPlan(planVal, target, workoutPoolItem(w), workoutPlanItems(w, all())));
    view.querySelector('#wkJournal').addEventListener('click', () => {
      const j = workoutJournal(w, all());
      // Rodzaj według głównej części treningu (bez rozgrzewki i mobilności).
      const main = ex.filter((e) => !['warmup', 'mobility'].includes(e.cat));
      const types = (main.length ? main : ex).map(sessionType).filter(Boolean);
      openJournalWith({ exercises: j.exercises, notes: j.notes, type: types[0] || null });
      location.hash = '#/dziennik';
    });
    view.querySelector('#copyWk')?.addEventListener('click', () => {
      wkDraft = { id: null, name: `${w.name} (mój)`, desc: w.desc, items: [...w.items] };
      go();
    });
    view.querySelector('#editWk')?.addEventListener('click', () => { wkDraft = structuredClone(w); go(); });
    view.querySelector('#delWk')?.addEventListener('click', () => {
      if (!confirm(`Usunąć trening „${w.name}”? Wpisy w planach i dzienniku zostają.`)) return;
      update((s) => { s.workouts = s.workouts.filter((x) => x.id !== w.id); });
      toast('Usunięto trening');
      openWorkout = null;
      go();
    });
  }

  function renderWorkoutEditor() {
    const d = wkDraft;
    const ex = all();
    const byCat = CATEGORIES.map((c) => `<optgroup label="${esc(c.label)}">${ex.filter((e) => e.cat === c.id)
      .map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
    view.innerHTML = `
      <form class="card" id="wkForm">
        <h2>${d.id ? 'Edytuj trening' : 'Nowy trening'}</h2>
        <label class="field"><span>Nazwa</span><input name="name" maxlength="80" value="${esc(d.name)}" required></label>
        <label class="field"><span>Opis (opcjonalnie)</span><input name="desc" maxlength="200" value="${esc(d.desc)}" placeholder="np. ok. 60 min, po dniu odpoczynku"></label>
        <strong>Ćwiczenia w kolejności</strong>
        <ol class="wk-edit">${d.items.map((id, i) => {
          const e = ex.find((x) => x.id === id);
          return `<li data-i="${i}"><span>${e ? esc(e.name) : '<em class="muted">usunięte ćwiczenie</em>'}</span>
            <button type="button" class="icon" data-a="up" aria-label="W górę" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon" data-a="down" aria-label="W dół" ${i === d.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon" data-a="rm" aria-label="Usuń z treningu">✕</button></li>`;
        }).join('')}</ol>
        ${d.items.length ? '' : '<p class="muted">Dodaj pierwsze ćwiczenie poniżej.</p>'}
        <label class="field"><span>Dodaj ćwiczenie</span>
          <select id="wkAdd"><option value="">– wybierz z biblioteki –</option>${byCat}</select></label>
        <div class="row">
          <button type="button" class="btn ghost" id="wkCancel">Anuluj</button>
          <button class="btn primary">Zapisz trening</button>
        </div>
      </form>`;

    const f = view.querySelector('#wkForm');
    const sync = () => { d.name = f.elements.name.value; d.desc = f.elements.desc.value; };
    view.querySelector('#wkAdd').addEventListener('change', (ev) => {
      if (!ev.target.value) return;
      sync();
      d.items.push(ev.target.value);
      render();
    });
    view.querySelector('.wk-edit').addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a;
      const i = Number(ev.target.closest('[data-i]')?.dataset.i);
      if (!a) return;
      sync();
      if (a === 'rm') d.items.splice(i, 1);
      if (a === 'up' && i > 0) [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]];
      if (a === 'down' && i < d.items.length - 1) [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]];
      render();
    });
    view.querySelector('#wkCancel').addEventListener('click', () => { wkDraft = null; go(); });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      sync();
      if (!d.name.trim()) return toast('Podaj nazwę treningu');
      if (!d.items.length) return toast('Dodaj co najmniej jedno ćwiczenie');
      const w = { id: d.id || `wk-${uid()}`, name: d.name.trim(), desc: d.desc.trim(), items: [...d.items] };
      update((s) => {
        const i = s.workouts.findIndex((x) => x.id === w.id);
        if (i >= 0) s.workouts[i] = w; else s.workouts.push(w);
      });
      toast('Zapisano trening');
      wkDraft = null;
      openWorkout = w.id;
      mode = 'workouts';
      go();
    });
  }

  render();
}
