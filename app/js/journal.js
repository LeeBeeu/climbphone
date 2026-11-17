import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDate, monthLabel, fmtMinutes, startOfWeek, parseDate } from './ui.js';
import { fmtAdded, fmtSets, bodyWeightOn, effortOptions } from './load-calc.js';
import {
  exerciseCatalog, lastExercise, cleanExercises, exPct, fmtExSets, bestExSet, exKey,
} from './exercises.js';

// Obciążenie zapisane z timera: „+5 kg · 106% MC (MC 80,8 kg)”.
function hangLoadHtml(l) {
  if (!l) return '';
  const pct = l.pct_bw ? ` · <strong>${l.pct_bw}% MC</strong> <small>(MC ${String(l.body_weight_kg).replace('.', ',')} kg)</small>` : '';
  return `<div class="item-sub">🏋️ ${fmtAdded(l.added_kg)}${pct}</div>`;
}

// Ćwiczenia poza timerem: „💪 Podciąganie: 2×5 +20 kg, 1×4 +20 kg · 125% MC”.
function exercisesHtml(s) {
  return (s.exercises || []).map((ex) => {
    const best = ex.bodyweight ? bestExSet(ex.sets) : null;
    const pct = best && s.body_weight_kg ? ` · <strong>${exPct(s.body_weight_kg, best.added_kg)}% MC</strong>` : '';
    return `<div class="item-sub">💪 ${esc(ex.name)}: ${esc(fmtExSets(ex))}${pct}</div>`;
  }).join('');
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
let draftEx = []; // ćwiczenia w otwartym formularzu: [{ name, bodyweight, sets: [{ reps, added_kg }] }]

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
const sumMinutes = (list) => list.reduce((t, s) => t + (Number(s.duration) || 0), 0);

function formHtml(s) {
  const types = SESSION_TYPES.includes(s.type) ? SESSION_TYPES : [...SESSION_TYPES, s.type];
  const catalog = exerciseCatalog(getState().sessions);
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
      <h3 class="sub-title">Ćwiczenia <small class="muted">(serie: powtórzenia × kg)</small></h3>
      <div id="exList"></div>
      <label class="field"><span class="sr-only">Dodaj ćwiczenie</span>
        <select id="exPick">
          <option value="">+ Dodaj ćwiczenie…</option>
          ${catalog.map((e) => `<option value="${esc(e.name)}">${esc(e.name)}${e.bodyweight ? '' : ' (ciężar)'}</option>`).join('')}
          <option value="__new">Inne ćwiczenie…</option>
        </select>
      </label>
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
        <div class="card-head"><strong>${esc(ex.name)}</strong>
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

function listHtml(sessions) {
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
    html += `
      <li class="item">
        <div class="item-main">
          <div class="item-title">${esc(s.type)}</div>
          <div class="item-sub">${fmtDate(s.date)} · ${fmtMinutes(Number(s.duration) || 0)}${s.rpe ? ` · RPE ${s.rpe}` : ''}</div>
          ${hangLoadHtml(s.hang_load)}
          ${s.hang_sets?.length ? `<div class="item-sub">Serie: ${esc(fmtSets(s.hang_sets))}</div>` : ''}
          ${exercisesHtml(s)}
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
    const weekStart = startOfWeek();
    const week = sessions.filter((s) => parseDate(s.date) >= weekStart);
    const month = sessions.filter((s) => s.date.startsWith(today().slice(0, 7)));
    const editing = sessions.find((s) => s.id === editingId);
    const draft = editing || { date: today(), type: SESSION_TYPES[0], duration: 90, rpe: null, notes: '' };

    view.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${week.length}</b><span>sesje w tym tygodniu</span></div>
        <div class="stat"><b>${fmtMinutes(sumMinutes(week))}</b><span>czas w tym tygodniu</span></div>
        <div class="stat"><b>${month.length}</b><span>sesje w tym miesiącu</span></div>
      </div>
      ${formOpen ? formHtml(draft) : '<button class="btn primary big" id="add">+ Nowy trening</button>'}
      <a class="btn ghost small" href="#/analityka" style="align-self:flex-end">📊 Analityka i obciążenie</a>
      ${listHtml([...sessions].sort(byNewest))}`;

    view.querySelector('#add')?.addEventListener('click', () => openForm(null));
    view.querySelector('#cancel')?.addEventListener('click', closeForm);
    if (formOpen) bindExercises();
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
        // Masa ciała „zamrożona” w dniu treningu, żeby % MC w historii się nie zmieniał.
        body_weight_kg: exercises.some((x) => x.bodyweight) ? bodyWeightAt(date) : null,
      };
      update((s) => {
        const existing = s.sessions.find((x) => x.id === editingId);
        if (existing) Object.assign(existing, data);
        else s.sessions.push({ id: uid(), created: Date.now(), ...data });
      });
      toast(editingId ? 'Zapisano zmiany' : 'Dodano trening');
      closeForm();
    });

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
    const draw = () => { list.innerHTML = exListHtml(dateInput.value || today()); };
    draw();
    dateInput.addEventListener('change', draw);

    view.querySelector('#exPick').addEventListener('change', (e) => {
      let name = e.target.value;
      e.target.value = '';
      if (!name) return;
      let bodyweight;
      if (name === '__new') {
        name = prompt('Nazwa ćwiczenia:')?.trim();
        if (!name) return;
        bodyweight = confirm('Ćwiczenie z masą ciała (kg to dociążenie, liczymy % masy ciała)?\nAnuluj = ćwiczenie z ciężarem (kg to ciężar sztangi/hantli).');
      } else {
        bodyweight = exerciseCatalog(getState().sessions).find((x) => exKey(x.name) === exKey(name))?.bodyweight ?? true;
      }
      if (draftEx.some((x) => exKey(x.name) === exKey(name))) return toast('To ćwiczenie jest już na liście');
      // Wstępne wypełnienie seriami z ostatniego wykonania tego ćwiczenia.
      const last = lastExercise(getState().sessions, name, editingId);
      const sets = last ? last.exercise.sets.map((s) => ({ ...s })) : [{ reps: 5, added_kg: 0 }];
      draftEx.push({ name, bodyweight: last ? !!last.exercise.bodyweight : bodyweight, sets });
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

    list.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const card = e.target.closest('[data-i]');
      if (!a || !card) return;
      const ex = draftEx[card.dataset.i];
      if (a === 'delEx') draftEx.splice(card.dataset.i, 1);
      if (a === 'addSet') ex.sets.push({ ...(ex.sets.at(-1) || { reps: 5, added_kg: 0 }) }); // kopia ostatniej serii
      if (a === 'delSet') ex.sets.splice(e.target.closest('[data-j]').dataset.j, 1);
      draw();
    });
  }

  function openForm(id) {
    formOpen = true;
    editingId = id;
    const s = id ? getState().sessions.find((x) => x.id === id) : null;
    draftEx = structuredClone(s?.exercises || []);
    render();
  }

  function closeForm() {
    formOpen = false;
    editingId = null;
    draftEx = [];
    render();
  }

  render();
}
