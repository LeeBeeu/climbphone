import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDate, fmtDateLong, monthLabel, fmtMinutes, startOfWeek, parseDate } from './ui.js';
import {
  monthGrid, weekDays, shiftMonth, sessionsByDate, weekStatus, planWeekPct, STATUS_LABELS,
} from './calendar-calc.js';
import { weekKeyOf, shiftWeek } from './plan-calc.js';
import { fmtAdded, fmtSets, bodyWeightOn, effortOptions } from './load-calc.js';
import {
  exerciseCatalog, lastExercise, cleanExercises, exPct, fmtExSets, bestExSet, exKey, journalPickerGroups,
  checklistStatus, performedSessions, cleanItems, isPlanned,
} from './exercises.js';
import { findExercise, journalExerciseFrom } from './library-calc.js';

// Obciążenie zapisane z timera: „+5 kg · 106% MC (MC 80,8 kg)”.
function hangLoadHtml(l) {
  if (!l) return '';
  const pct = l.pct_bw ? ` · <strong>${l.pct_bw}% MC</strong> <small>(MC ${String(l.body_weight_kg).replace('.', ',')} kg)</small>` : '';
  return `<div class="item-sub">🏋️ ${fmtAdded(l.added_kg)}${pct}</div>`;
}

// Ćwiczenia poza timerem: „💪 Podciąganie: 2×5 +20 kg, 1×4 +20 kg · 125% MC”.
// Ćwiczenia i pozycje bez serii we wpisie. Gdy coś czeka na odhaczenie (albo trening jest zaplanowany),
// każda linia ma pole do odhaczenia prosto z listy.
function exercisesHtml(s, checkable) {
  const box = (kind, i, done) => (checkable
    ? `<input type="checkbox" class="jl-check" data-tick="${s.id}|${kind}|${i}" ${done ? 'checked' : ''} aria-label="Zrobione">` : '');
  const ex = (s.exercises || []).map((x, i) => {
    const best = x.bodyweight ? bestExSet(x.sets) : null;
    const pct = best && s.body_weight_kg && x.done !== false ? ` · <strong>${exPct(s.body_weight_kg, best.added_kg)}% MC</strong>` : '';
    return `<label class="item-sub jl-line ${x.done === false ? 'open' : ''}">${box('ex', i, x.done !== false)}<span>💪 ${esc(x.name)}: ${esc(fmtExSets(x))}${pct}</span></label>`;
  });
  const items = (s.items || []).map((x, i) => `<label class="item-sub jl-line ${x.done === false ? 'open' : ''}">${box('it', i, x.done !== false)}<span>${checkable ? '' : (x.done === false ? '○ ' : '✓ ')}${esc(x.text)}</span></label>`);
  return [...ex, ...items].join('');
}

const kgText = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

// Masa ciała w dniu treningu (MC-50): trend z zakładki Waga, a bez pomiarów – masa wpisana w timerze.
function bodyWeightAt(date) {
  const st = getState();
  return bodyWeightOn(st.weightEntries, st.settings, date, st.settings.hang_body_weight_kg);
}

export const SESSION_TYPES = [
  'Bouldering',
  'Wspinanie z liną',
  'Skały',
  'Chwytotablica',
  'Kampus',
  'Wytrzymałość / ARC',
  'Siła / ogólnorozwojówka',
  'Mobilność / rozciąganie',
  'Inne',
];

let formOpen = false;
let editingId = null;
let draftEx = []; // ćwiczenia w otwartym formularzu: [{ name, bodyweight, done, sets: [{ reps, added_kg }] }]
let draftItems = []; // pozycje bez serii (na ścianie, timer, czas): [{ text, done }]
let pendingType = null;  // rodzaj treningu podpowiedziany z biblioteki
let pendingNotes = '';   // notatka podpowiedziana z biblioteki (np. lista ćwiczeń treningu bez serii)
let draftFields = null;  // pola formularza zapisane w szkicu (data, rodzaj, czas, RPE, notatki)

// Widok: lista albo kalendarz (miesiąc / tydzień).
let jmode = 'list';
let calScope = 'month';
let cal = { year: Number(today().slice(0, 4)), month: Number(today().slice(5, 7)) };
let calWeek = weekKeyOf(today());
let selDay = null;

// Kolor rodzaju treningu w kalendarzu (kolejność jak SESSION_TYPES; własne rodzaje – szary).
const TYPE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#14b8a6', '#eab308', '#ec4899', '#94a3b8'];
const typeColor = (type) => TYPE_COLORS[SESSION_TYPES.indexOf(type)] || '#94a3b8';

// Szkic niezapisanego treningu (NF-05): przywracany po ponownym otwarciu aplikacji, do doby.
const DRAFT_KEY = 'climbphone.draft';
const DRAFT_MAX_MS = 24 * 60 * 60 * 1000;
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* brak pamięci */ } };

// Otwiera formularz nowego treningu z ćwiczeniami (np. „Dodaj do dziennika” w bibliotece) – przed przejściem do #/dziennik.
// Serie każdego ćwiczenia z ostatniego wykonania, a gdy go nie było – domyślne z biblioteki.
export function openJournalWith({ exercises = [], type = null, notes = '', fields = null, items = [] } = {}) {
  const sessions = getState().sessions;
  formOpen = true;
  editingId = null;
  draftFields = fields; // np. data i czas z „Najbliższego treningu”
  pendingType = type;
  pendingNotes = notes;
  draftItems = items.map((x) => ({ text: x.text ?? x, done: x.done ?? true }));
  draftEx = exercises.map((exercise) => {
    const last = lastExercise(sessions, exercise.name);
    return last
      ? { name: exercise.name, bodyweight: !!last.exercise.bodyweight, sets: structuredClone(last.exercise.sets) }
      : structuredClone(exercise);
  });
}

export const openJournalWithExercise = (exercise, type = null) => openJournalWith({ exercises: [exercise], type });

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
const sumMinutes = (list) => list.reduce((t, s) => t + (Number(s.duration) || 0), 0);

function formHtml(s) {
  const types = SESSION_TYPES.includes(s.type) ? SESSION_TYPES : [...SESSION_TYPES, s.type];
  const pickerGroups = journalPickerGroups(getState().sessions, getState().customExercises);
  return `
    <form class="card" id="form">
      <h2>${editingId ? 'Edytuj trening' : 'Nowy trening'}</h2>
      <div class="grid2">
        <label class="field"><span>Data</span><input type="date" name="date" value="${s.date}" required></label>
        <label class="field"><span>Czas (min)</span>
          <input type="number" name="duration" min="1" max="1440" inputmode="numeric" value="${s.duration ?? ''}" required>
        </label>
      </div>
      <div class="grid2">
        <label class="field"><span>Rodzaj</span>
          <select name="type">${types.map((t) => `<option ${t === s.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Intensywność (RPE)</span>
          <select name="rpe">
            <option value="">–</option>
            ${Array.from({ length: 10 }, (_, i) => i + 1)
              .map((n) => `<option ${n === s.rpe ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="card-head"><h3 class="sub-title">Ćwiczenia <small class="muted">(serie: powtórzenia × kg)</small></h3>
        <a class="btn ghost small" href="#/biblioteka">📚 Opisy</a></div>
      <p class="hint" id="planHint" hidden>📅 Data w przyszłości – trening zaplanowany. Po wykonaniu odhacz ćwiczenia (tu albo prosto na liście), a jeśli treningu nie było – usuń wpis.</p>
      <div id="exList"></div>
      <div id="itemList"></div>
      <label class="field"><span class="sr-only">Dodaj ćwiczenie</span>
        <select id="exPick">
          <option value="">+ Dodaj ćwiczenie…</option>
          ${pickerGroups.map((g) => `<optgroup label="${esc(g.label)}">${g.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</optgroup>`).join('')}
          <option value="__new">Inne ćwiczenie…</option>
        </select>
      </label>
      <div class="add-row"><input id="itemText" maxlength="120" placeholder="Pozycja bez serii, np. 3 drogi 6c+ OS"><button type="button" class="btn small" id="itemAdd">＋</button></div>
      <label class="field"><span>Notatki</span>
        <textarea name="notes" rows="3" placeholder="Co było w planie, samopoczucie, kontuzje…">${esc(s.notes)}</textarea>
      </label>
      <div class="row">
        <button type="button" class="btn ghost" id="cancel">Anuluj</button>
        <button class="btn primary">Zapisz</button>
      </div>
    </form>`;
}

// Lista ćwiczeń w formularzu; rysowana osobno, żeby nie gubić wpisanych pól formularza.
function exListHtml(date) {
  if (!draftEx.length) return '';
  const bw = bodyWeightAt(date);
  const sessions = getState().sessions;
  return draftEx.map((ex, i) => {
    const last = lastExercise(sessions, ex.name, editingId);
    const unit = ex.bodyweight ? 'dociążenie kg' : 'ciężar kg';
    return `
      <div class="ex-card" data-i="${i}">
        <div class="card-head"><label class="check ex-done"><input type="checkbox" data-a="done" ${ex.done !== false ? 'checked' : ''}><strong>${esc(ex.name)}</strong></label>
          <button type="button" class="icon" data-a="delEx" aria-label="Usuń ćwiczenie">🗑️</button></div>
        ${last ? `<p class="muted">Ostatnio (${fmtDate(last.date)}): ${esc(fmtExSets(last.exercise))}</p>` : ''}
        <div class="ex-row ex-head"><span>Seria</span><span>Powt.</span><span>${unit}</span><span>${ex.bodyweight ? '% MC' : ''}</span><span title="Wysiłek 1–5">Wys.</span><span></span></div>
        ${ex.sets.map((s, j) => `
          <div class="ex-row" data-j="${j}">
            <span>${j + 1}</span>
            <input type="number" inputmode="numeric" min="0" max="999" value="${s.reps ?? ''}" data-f="reps" aria-label="Powtórzenia w serii ${j + 1}">
            <input type="number" inputmode="decimal" step="0.5" min="-200" max="500" value="${s.added_kg ?? 0}" data-f="added_kg" aria-label="Kilogramy w serii ${j + 1}">
            <span class="muted" data-pct>${ex.bodyweight && bw ? `${exPct(bw, s.added_kg)}%` : ''}</span>
            <select data-f="effort" aria-label="Wysiłek w serii ${j + 1}">${effortOptions(s.effort ?? null)}</select>
            <button type="button" class="icon" data-a="delSet" aria-label="Usuń serię ${j + 1}">✕</button>
          </div>`).join('')}
        <button type="button" class="btn ghost small" data-a="addSet">+ Seria</button>
        ${ex.bodyweight && !bw ? '<p class="muted">Brak masy ciała z tego dnia – % MC pojawi się po dodaniu pomiaru w zakładce Waga.</p>' : ''}
        ${ex.bodyweight && bw ? `<p class="muted">Masa ciała ${kgText(bw)} kg (trend z dnia treningu). Ujemne kg = odciążenie gumą.</p>` : ''}
      </div>`;
  }).join('');
}

// Pozycje bez serii w formularzu: odhaczanie i usuwanie.
function itemListHtml() {
  if (!draftItems.length) return '';
  return `<div class="ex-card"><strong>Bez serii</strong>${draftItems.map((x, i) => `
    <div class="ns-row" data-k="${i}">
      <label class="check ${x.done ? 'done' : ''}"><input type="checkbox" data-b="tick" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span></label>
      <button type="button" class="icon" data-b="del" aria-label="Usuń pozycję">✕</button>
    </div>`).join('')}</div>`;
}

function listHtml(sessions) {
  const todayKey = today();
  if (!sessions.length) {
    return '<div class="empty">Brak zapisanych treningów.<br>Dodaj pierwszy albo zapisz sesję z timera.</div>';
  }
  let html = '';
  let month = '';
  for (const s of sessions) {
    const m = s.date.slice(0, 7);
    if (m !== month) {
      if (month) html += '</ul>';
      month = m;
      html += `<h3 class="group-title">${monthLabel(s.date)}</h3><ul class="list">`;
    }
    const planned = isPlanned(s, todayKey);
    const st = checklistStatus(s);
    const checkable = planned || st.open > 0;
    const badge = planned ? '<span class="badge plan">📅 zaplanowany</span>'
      : st.open ? `<span class="badge todo">do odhaczenia ${st.done}/${st.total}</span>` : '';
    html += `
      <li class="item ${planned ? 'planned' : ''}">
        <div class="item-main">
          <div class="item-title">${esc(s.type)} ${badge}</div>
          <div class="item-sub">${fmtDate(s.date)} · ${fmtMinutes(Number(s.duration) || 0)}${s.rpe ? ` · RPE ${s.rpe}` : ''}</div>
          ${hangLoadHtml(s.hang_load)}
          ${s.hang_sets?.length ? `<div class="item-sub">Serie: ${esc(fmtSets(s.hang_sets))}</div>` : ''}
          ${exercisesHtml(s, checkable)}
          ${s.notes ? `<div class="item-notes">${esc(s.notes)}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="icon" data-edit="${s.id}" aria-label="Edytuj">✏️</button>
          <button class="icon" data-del="${s.id}" aria-label="Usuń">🗑️</button>
        </div>
      </li>`;
  }
  return `${html}</ul>`;
}

export function renderJournal(view) {
  function render() {
    const { sessions } = getState();
    const done = performedSessions(sessions, today()); // bez zaplanowanych
    const weekStart = startOfWeek();
    const week = done.filter((s) => parseDate(s.date) >= weekStart);
    const month = done.filter((s) => s.date.startsWith(today().slice(0, 7)));
    const editing = sessions.find((s) => s.id === editingId);
    const base = editing || { date: today(), type: pendingType || SESSION_TYPES[0], duration: 90, rpe: null, notes: pendingNotes };
    const draft = draftFields ? { ...base, ...draftFields } : base;

    view.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${week.length}</b><span>sesje w tym tygodniu</span></div>
        <div class="stat"><b>${fmtMinutes(sumMinutes(week))}</b><span>czas w tym tygodniu</span></div>
        <div class="stat"><b>${month.length}</b><span>sesje w tym miesiącu</span></div>
      </div>
      ${formOpen ? formHtml(draft) : '<button class="btn primary big" id="add">+ Nowy trening</button>'}
      <span class="row-links" style="align-self:flex-end"><a class="btn ghost small" href="#/biblioteka">📚 Biblioteka ćwiczeń</a><a class="btn ghost small" href="#/analityka">📊 Analityka</a></span>
      <div class="seg" id="jmode">
        <button data-m="list" class="${jmode === 'list' ? 'active' : ''}">📋 Lista</button>
        <button data-m="calendar" class="${jmode === 'calendar' ? 'active' : ''}">📅 Kalendarz</button>
      </div>
      ${jmode === 'calendar' ? calendarHtml(sessions) : listHtml([...sessions].sort(byNewest))}`;

    view.querySelectorAll('#jmode button').forEach((b) => b.addEventListener('click', () => { jmode = b.dataset.m; render(); }));
    bindCalendar();
    view.querySelector('#add')?.addEventListener('click', () => openForm(null));
    view.querySelector('#cancel')?.addEventListener('click', closeForm);
    if (formOpen) {
      bindExercises();
      const form = view.querySelector('#form');
      // NF-05: szkic formularza zapisywany przy każdej zmianie (także serii ćwiczeń).
      form.addEventListener('input', () => persistDraft(form));
      form.addEventListener('change', () => persistDraft(form));
      form.addEventListener('click', () => setTimeout(() => persistDraft(form)));
    }
    view.querySelector('#form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const exercises = cleanExercises(draftEx);
      const date = f.get('date');
      const data = {
        date,
        type: f.get('type'),
        duration: Number(f.get('duration')),
        rpe: f.get('rpe') ? Number(f.get('rpe')) : null,
        notes: f.get('notes').trim(),
        exercises,
        items: cleanItems(draftItems),
        // Masa ciała „zamrożona” w dniu treningu, żeby % MC w historii się nie zmieniał.
        body_weight_kg: exercises.some((x) => x.bodyweight) ? bodyWeightAt(date) : null,
      };
      update((s) => {
        const existing = s.sessions.find((x) => x.id === editingId);
        if (existing) Object.assign(existing, data);
        else s.sessions.push({ id: uid(), created: Date.now(), ...data });
      });
      toast(editingId ? 'Zapisano zmiany' : date > today() ? 'Zaplanowano trening' : 'Dodano trening');
      closeForm();
    });

    // Odhaczanie prosto z listy (bez otwierania edycji).
    view.querySelectorAll('[data-tick]').forEach((cb) => cb.addEventListener('change', () => {
      const [id, kind, i] = cb.dataset.tick.split('|');
      update((s) => {
        const x = s.sessions.find((y) => y.id === id);
        const el = (kind === 'ex' ? x?.exercises : x?.items)?.[Number(i)];
        if (!el) return;
        el.done = cb.checked;
        // Pierwsze odhaczone ćwiczenie z masą ciała: zamrażamy masę z dnia treningu (do % MC).
        if (kind === 'ex' && cb.checked && el.bodyweight && x.body_weight_kg == null) x.body_weight_kg = bodyWeightAt(x.date);
      });
      render();
    }));
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      openForm(b.dataset.edit);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Usunąć ten trening?')) return;
      update((s) => { s.sessions = s.sessions.filter((x) => x.id !== b.dataset.del); });
      render();
    }));
  }

  function bindExercises() {
    const list = view.querySelector('#exList');
    const dateInput = view.querySelector('#form [name="date"]');
    const itemsEl = view.querySelector('#itemList');
    const planned = () => (dateInput.value || today()) > today();
    const draw = () => {
      list.innerHTML = exListHtml(dateInput.value || today());
      itemsEl.innerHTML = itemListHtml();
      view.querySelector('#planHint').hidden = !planned();
    };
    draw();
    dateInput.addEventListener('change', draw);

    view.querySelector('#exPick').addEventListener('change', (e) => {
      const val = e.target.value;
      e.target.value = '';
      if (!val) return;
      let name;
      let bodyweight;
      let libSets = null; // domyślne serie z biblioteki, gdy ćwiczenia nie było jeszcze w dzienniku
      if (val === '__new') {
        name = prompt('Nazwa ćwiczenia:')?.trim();
        if (!name) return;
        bodyweight = confirm('Ćwiczenie z masą ciała (kg to dociążenie, liczymy % masy ciała)?\nAnuluj = ćwiczenie z ciężarem (kg to ciężar sztangi/hantli).');
      } else if (val.startsWith('lib:')) {
        const lib = findExercise(val.slice(4), getState().customExercises);
        if (!lib) return;
        if (lib.kind !== 'sets') {
          // Bez serii (timer, czas, na ścianie): dopisujemy linię do notatki.
          const text = `${lib.name} – ${lib.dose}`;
          if (draftItems.some((x) => x.text === text)) return toast('To ćwiczenie jest już na liście');
          draftItems.push({ text, done: !planned() });
          return draw();
        }
        name = lib.name;
        bodyweight = !!lib.sets.bodyweight;
        libSets = journalExerciseFrom(lib).sets;
      } else {
        name = val.replace(/^name:/, '');
        bodyweight = exerciseCatalog(getState().sessions, getState().customExercises).find((x) => exKey(x.name) === exKey(name))?.bodyweight ?? true;
      }
      if (draftEx.some((x) => exKey(x.name) === exKey(name))) return toast('To ćwiczenie jest już na liście');
      // Wstępne wypełnienie seriami z ostatniego wykonania tego ćwiczenia (albo domyślnymi z biblioteki).
      const last = lastExercise(getState().sessions, name, editingId);
      const sets = last ? last.exercise.sets.map((s) => ({ ...s })) : libSets || [{ reps: 5, added_kg: 0 }];
      draftEx.push({ name, bodyweight: last ? !!last.exercise.bodyweight : bodyweight, done: !planned(), sets });
      draw();
    });

    list.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      const card = e.target.closest('[data-i]');
      const row = e.target.closest('[data-j]');
      if (!f || !card || !row) return;
      const ex = draftEx[card.dataset.i];
      const set = ex.sets[row.dataset.j];
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      if (f === 'effort') { set.effort = Number.isFinite(v) ? v : null; return; }
      set[f] = Number.isFinite(v) ? v : (f === 'reps' ? null : 0);
      if (f === 'added_kg' && ex.bodyweight) {
        const bw = bodyWeightAt(dateInput.value || today());
        row.querySelector('[data-pct]').textContent = bw ? `${exPct(bw, set.added_kg)}%` : '';
      }
    });

    itemsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]')?.dataset.b;
      const row = e.target.closest('[data-k]');
      if (!b || !row || e.target.tagName === 'SPAN') return;
      if (b === 'tick') draftItems[row.dataset.k].done = e.target.checked;
      if (b === 'del') draftItems.splice(row.dataset.k, 1);
      draw();
    });
    const addItem = () => {
      const inp = view.querySelector('#itemText');
      const text = inp.value.trim();
      if (!text) return;
      if (!draftItems.some((x) => x.text.toLowerCase() === text.toLowerCase())) draftItems.push({ text, done: !planned() });
      inp.value = '';
      draw();
    };
    view.querySelector('#itemAdd').addEventListener('click', addItem);
    view.querySelector('#itemText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

    list.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const card = e.target.closest('[data-i]');
      if (!a || !card) return;
      const ex = draftEx[card.dataset.i];
      if (a === 'done') { ex.done = e.target.checked; return; }
      if (a === 'delEx') draftEx.splice(card.dataset.i, 1);
      if (a === 'addSet') ex.sets.push({ ...(ex.sets.at(-1) || { reps: 5, added_kg: 0 }) }); // kopia ostatniej serii
      if (a === 'delSet') ex.sets.splice(e.target.closest('[data-j]').dataset.j, 1);
      draw();
    });
  }

  function openForm(id) {
    formOpen = true;
    editingId = id;
    draftFields = null;
    const s = id ? getState().sessions.find((x) => x.id === id) : null;
    draftEx = structuredClone(s?.exercises || []);
    draftItems = structuredClone(s?.items || []);
    render();
  }

  function closeForm() {
    formOpen = false;
    editingId = null;
    draftEx = [];
    draftItems = [];
    pendingType = null;
    pendingNotes = '';
    draftFields = null;
    clearDraft();
    render();
  }

  // ---------- Kalendarz ----------

  function calendarHtml(sessions) {
    const st = getState();
    const byDate = sessionsByDate(sessions);
    const todayKey = today();
    const statusOf = (week) => weekStatus(planWeekPct(st.plans, st.planChecks, week), week, todayKey);
    const statusDot = (week) => {
      const s = statusOf(week);
      return s ? `<span class="wk-status ${s}" title="Plan: ${STATUS_LABELS[s]}"></span>` : '';
    };
    // Zaplanowane (data w przyszłości) – kropka z obwódką zamiast wypełnionej.
    const dots = (list) => list.slice(0, 3).map((s) => (s.date > todayKey ? `<i class="pl" style="border-color:${typeColor(s.type)}"></i>` : `<i style="background:${typeColor(s.type)}"></i>`)).join('')
      + (list.length > 3 ? '<b>+</b>' : '');
    let body;
    if (calScope === 'month') {
      const grid = monthGrid(cal.year, cal.month);
      const ym = `${cal.year}-${String(cal.month).padStart(2, '0')}`;
      const title = parseDate(`${ym}-01`).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
      body = `
        <div class="cal-head"><button class="btn small" data-cal="-1" aria-label="Poprzedni miesiąc">‹</button>
          <strong>${title}</strong><button class="btn small" data-cal="1" aria-label="Następny miesiąc">›</button></div>
        <div class="cal-grid">
          <span class="cal-h">T.</span>${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => `<span class="cal-h">${d}</span>`).join('')}
          ${grid.map((w) => `<span class="cal-wk">${Number(w.week.split('-W')[1])}${statusDot(w.week)}</span>
            ${w.days.map((d) => {
              const list = byDate[d] || [];
              return `<button class="cal-day ${d.startsWith(ym) ? '' : 'other'} ${d === todayKey ? 'today' : ''} ${d === selDay ? 'sel' : ''}"
                data-day="${d}" aria-label="${fmtDate(d)}: ${list.length} ${list.length === 1 ? 'trening' : 'treningów'}">
                <span>${Number(d.slice(8))}</span><span class="cal-dots">${dots(list)}</span></button>`;
            }).join('')}`).join('')}
        </div>`;
    } else {
      const days = weekDays(calWeek);
      body = `
        <div class="cal-head"><button class="btn small" data-calw="-1" aria-label="Poprzedni tydzień">‹</button>
          <strong>Tydzień ${Number(calWeek.split('-W')[1])} ${statusDot(calWeek)}</strong>
          <button class="btn small" data-calw="1" aria-label="Następny tydzień">›</button></div>
        <ul class="list cal-week">${days.map((d) => {
          const list = byDate[d] || [];
          return `<li><button class="item cal-wrow ${d === todayKey ? 'today' : ''}" data-day="${d}">
            <span class="cal-wd">${parseDate(d).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span>${list.length ? list.map((s) => `<span class="cal-tag" style="border-color:${typeColor(s.type)}">${esc(s.type)} · ${fmtMinutes(Number(s.duration) || 0)}</span>`).join(' ')
              : '<small class="muted">odpoczynek</small>'}</span></button></li>`;
        }).join('')}</ul>`;
    }
    // Legenda: rodzaje treningów widoczne w pokazanym okresie.
    const shown = calScope === 'month' ? monthGrid(cal.year, cal.month).flatMap((w) => w.days) : weekDays(calWeek);
    const used = [...new Set(shown.flatMap((d) => (byDate[d] || []).map((s) => s.type)))];
    const selList = selDay ? (byDate[selDay] || []) : [];
    return `
      <section class="card cal">
        <div class="seg" id="calScope">
          <button data-s="month" class="${calScope === 'month' ? 'active' : ''}">Miesiąc</button>
          <button data-s="week" class="${calScope === 'week' ? 'active' : ''}">Tydzień</button>
        </div>
        ${body}
        <p class="muted legend">${used.slice(0, 9).map((t) => `<span class="lg-type" style="background:${typeColor(t)}"></span>${esc(t)}`).join(' ')}</p>
        <p class="muted legend"><span class="wk-status done"></span>plan wykonany <span class="wk-status partial"></span>częściowo
          <span class="wk-status missed"></span>pominięty</p>
      </section>
      ${selDay ? `<h3 class="group-title">${fmtDateLong(selDay)}</h3>
        ${selList.length ? listHtml([...selList].sort(byNewest)).replace(/<h3 class="group-title">[^<]*<\/h3>/, '') : '<p class="muted">Brak treningów tego dnia.</p>'}
        <button class="btn" id="addOnDay">+ Trening tego dnia</button>` : ''}`;
  }

  function bindCalendar() {
    view.querySelectorAll('#calScope button').forEach((b) => b.addEventListener('click', () => {
      calScope = b.dataset.s;
      if (calScope === 'week') calWeek = weekKeyOf(selDay || today());
      render();
    }));
    view.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
      cal = shiftMonth(cal.year, cal.month, Number(b.dataset.cal));
      render();
    }));
    view.querySelectorAll('[data-calw]').forEach((b) => b.addEventListener('click', () => {
      calWeek = shiftWeek(calWeek, Number(b.dataset.calw));
      render();
    }));
    view.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
      selDay = selDay === b.dataset.day ? null : b.dataset.day;
      render();
    }));
    view.querySelector('#addOnDay')?.addEventListener('click', () => {
      openForm(null);
      draftFields = { date: selDay };
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function persistDraft(form) {
    if (!formOpen || !form.isConnected) return;
    const f = new FormData(form);
    draftFields = {
      date: f.get('date'), type: f.get('type'), duration: f.get('duration'),
      rpe: f.get('rpe') ? Number(f.get('rpe')) : null, notes: f.get('notes'),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), editingId, fields: draftFields, draftEx, draftItems }));
    } catch { /* brak pamięci */ }
  }

  // Po ponownym otwarciu aplikacji: przywróć niezapisany formularz (do doby).
  if (!formOpen) {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (saved && Date.now() - saved.at < DRAFT_MAX_MS) {
        formOpen = true;
        editingId = saved.editingId && getState().sessions.some((s) => s.id === saved.editingId) ? saved.editingId : null;
        draftFields = saved.fields;
        draftEx = saved.draftEx || [];
        draftItems = saved.draftItems || [];
        setTimeout(() => toast('Przywrócono niezapisany wpis'), 0);
      }
    } catch { /* uszkodzony szkic – pomijamy */ }
  }

  render();
}
