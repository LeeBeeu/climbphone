import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDateLong, plural } from './ui.js';
import {
  SYSTEMS, STYLES, DEFAULT_STYLE, SEND_STYLES, TRAITS, gradeIndex, systemsFor, styleLabel,
} from './grades.js';

const FILTERS = [['all', 'Wszystkie'], ['route', 'Drogi'], ['boulder', 'Bouldery']];
const PAGE = 50;

let filter = 'all';
let query = '';
let limit = PAGE;
let formOpen = false;
let editingId = null;

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
const stars = (n) => (n > 0 ? '★'.repeat(n) : '');

// Domyślna wycena: ostatnio wpisana w tej skali, a jak brak, to coś z dolnej części skali.
function defaultGrade(system) {
  const last = [...getState().ascents].sort(byNewest).find((a) => a.system === system);
  const grades = SYSTEMS[system].grades;
  return last?.grade ?? grades[Math.floor(grades.length / 3)];
}

function matches(a, q) {
  if (!q) return true;
  return [a.name, a.crag, a.sector, a.area, a.grade].some((v) => v?.toLowerCase().includes(q));
}

// ---------- Statystyki (scorecard jak w 8a.nu) ----------

function statsHtml(list) {
  const sends = list.filter((a) => SEND_STYLES.includes(a.style) && gradeIndex(a.system, a.grade) >= 0);
  if (!sends.length) return '';

  const bySystem = {};
  sends.forEach((a) => (bySystem[a.system] ||= []).push(a));

  return Object.entries(bySystem).map(([system, items]) => {
    const grades = SYSTEMS[system].grades;
    const rows = new Map(); // indeks wyceny -> { OS: n, FL: n, ... }
    const totals = Object.fromEntries(SEND_STYLES.map((s) => [s, 0]));
    items.forEach((a) => {
      const i = gradeIndex(system, a.grade);
      const row = rows.get(i) || Object.fromEntries(SEND_STYLES.map((s) => [s, 0]));
      row[a.style]++;
      totals[a.style]++;
      rows.set(i, row);
    });
    const top = [...rows.keys()].sort((a, b) => b - a).slice(0, 10);
    const sum = (row) => SEND_STYLES.reduce((t, s) => t + row[s], 0);
    const max = Math.max(...top.map((i) => sum(rows.get(i))));
    const best = (style) => {
      const i = Math.max(-1, ...items.filter((a) => a.style === style).map((a) => gradeIndex(system, a.grade)));
      return i >= 0 ? grades[i] : '–';
    };

    return `
      <section class="card">
        <div class="card-head">
          <h2>${esc(SYSTEMS[system].label)}</h2>
          <span class="muted">${items.length} ${plural(items.length, 'przejście', 'przejścia', 'przejść')}</span>
        </div>
        <div class="best">
          ${SEND_STYLES.map((s) => `
            <div><span class="dot ${s.toLowerCase()}"></span>${s}
              <b>${best(s)}</b><small>${totals[s]}×</small></div>`).join('')}
        </div>
        <div class="pyramid">
          ${top.map((i) => {
            const row = rows.get(i);
            return `
              <div class="bar-row">
                <span>${grades[i]}</span>
                <div><div class="stack" style="width:${(sum(row) / max) * 100}%">
                  ${SEND_STYLES.filter((s) => row[s]).map((s) => `<div class="${s.toLowerCase()}" style="flex:${row[s]}" title="${s}: ${row[s]}"></div>`).join('')}
                </div></div>
                <span>${sum(row)}</span>
              </div>`;
          }).join('')}
        </div>
        ${rows.size > top.length ? `<p class="muted">Pokazano 10 najtrudniejszych wycen z ${rows.size}.</p>` : ''}
      </section>`;
  }).join('');
}

// ---------- Lista (układ jak logbook w 8a.nu) ----------

export const SORTS = [
  ['date_desc', 'Data: najnowsze'],
  ['date_asc', 'Data: najstarsze'],
  ['grade_desc', 'Trudność: najtrudniejsze'],
  ['grade_asc', 'Trudność: najłatwiejsze'],
];

// Przy sortowaniu po trudności drogi i bouldery idą osobno (różne skale), a w obrębie wyceny od najnowszych.
function sortList(list, sort) {
  const [field, dir] = sort.split('_');
  const m = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (field === 'grade') {
      if (a.kind !== b.kind) return a.kind === 'route' ? -1 : 1;
      if (a.system !== b.system) return a.system.localeCompare(b.system);
      return m * (gradeIndex(a.system, a.grade) - gradeIndex(b.system, b.grade)) || byNewest(a, b);
    }
    return m * (a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  });
}

const groupOf = (a, sort) => (sort.startsWith('grade')
  ? { key: `${a.system}|${a.grade}`, label: `${a.grade}${a.kind === 'boulder' ? ' · boulder' : ''}` }
  : { key: a.date, label: fmtDateLong(a.date) });

const placeLong = (a) => [a.country, a.area, a.crag].filter(Boolean).join(', ') + (a.sector ? ` – ${a.sector}` : '');

function styleIcon(a) {
  return `<span class="style-ic st-${a.style.toLowerCase()}" title="${esc(styleLabel(a.kind, a.style))}">
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"
      ${a.style === 'GO' ? 'stroke-dasharray="3 3"' : ''}/>${a.style === 'GO' ? '' : '<circle cx="10" cy="10" r="3.5" fill="currentColor"/>'}</svg>
    <small>${esc(a.style)}</small></span>`;
}

function itemHtml(a) {
  const tags = [
    a.gradeFeel === 'soft' && 'soft',
    a.gradeFeel === 'hard' && 'hard',
    a.firstAscent && 'FA',
    a.repeat && 'powtórzenie',
    a.secondGo && '2. próba',
    a.project && 'projekt',
    a.traditional && 'trad',
    a.recommended && '👍 polecam',
    a.tries > 1 && `${a.tries} ${plural(a.tries, 'próba', 'próby', 'prób')}`,
    ...(a.traits || []).map((t) => TRAITS.find(([k]) => k === t)?.[1]),
  ].filter(Boolean);

  return `
    <li class="log-row ${a.style === 'GO' ? 'attempt' : ''}">
      ${styleIcon(a)}
      <div class="log-name">
        <b>${esc(a.name || (a.kind === 'boulder' ? 'Boulder' : 'Droga'))}</b>${a.rating ? `<span class="stars">${stars(a.rating)}</span>` : ''}
        <small>${esc(placeLong(a))}</small>
      </div>
      <div class="log-grade">${esc(a.grade)}</div>
      <div class="log-notes">${esc(a.notes)}</div>
      <div class="log-tags">${tags.map((t) => `<span class="tag ${t === 'hard' || t === 'soft' ? 'strong' : ''}">${esc(t)}</span>`).join('')}</div>
      <div class="log-date">${fmtDateLong(a.date)}</div>
      <button class="icon log-edit" data-edit="${a.id}" aria-label="Edytuj">✏️</button>
    </li>`;
}

function listHtml(list, sort) {
  if (!list.length) return `<div class="empty">${query ? 'Nic nie pasuje do wyszukiwania.' : 'Brak zapisanych przejść.'}</div>`;
  const counts = new Map();
  list.forEach((a) => {
    const { key } = groupOf(a, sort);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let html = `<div class="logbook ${sort.startsWith('date') ? 'by-date' : 'by-grade'}">`;
  let group = null;
  for (const a of list.slice(0, limit)) {
    const { key, label } = groupOf(a, sort);
    if (key !== group) {
      if (group !== null) html += '</ul>';
      group = key;
      html += `<h3 class="log-head">${esc(label)}<small>${counts.get(key)}</small></h3><ul class="list">`;
    }
    html += itemHtml(a);
  }
  html += '</ul></div>';
  if (list.length > limit) {
    html += `<button class="btn ghost" id="more">Pokaż więcej (${list.length - limit})</button>`;
  }
  return html;
}

// ---------- Formularz ----------

function formHtml(a, crags, sectors) {
  const check = (name, label) =>
    `<label class="chip"><input type="checkbox" name="${name}" ${a[name] ? 'checked' : ''}>${label}</label>`;
  return `
    <form class="card" id="form">
      <h2>${editingId ? 'Edytuj przejście' : 'Nowe przejście'}</h2>
      <div class="seg" id="kind">
        <button type="button" data-k="route" class="${a.kind === 'route' ? 'active' : ''}">Droga</button>
        <button type="button" data-k="boulder" class="${a.kind === 'boulder' ? 'active' : ''}">Boulder</button>
      </div>
      <div class="grid2">
        <label class="field"><span>Nazwa</span>
          <input name="name" maxlength="100" value="${esc(a.name)}" placeholder="np. Mały Gladiator">
        </label>
        <label class="field"><span>Data</span><input type="date" name="date" value="${a.date}" required></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Rejon</span>
          <input name="crag" maxlength="100" list="crags" value="${esc(a.crag)}" placeholder="np. Czarnorzeki">
          <datalist id="crags">${crags.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
        <label class="field"><span>Sektor</span>
          <input name="sector" maxlength="100" list="sectors" value="${esc(a.sector)}" placeholder="np. Krowia Turnia">
          <datalist id="sectors">${sectors.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </label>
      </div>
      <div class="grid2">
        <label class="field"><span>Skala</span><select name="system"></select></label>
        <label class="field"><span>Wycena</span><select name="grade"></select></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Styl</span><select name="style"></select></label>
        <label class="field"><span>Liczba prób</span>
          <input type="number" name="tries" min="1" max="999" inputmode="numeric" value="${a.tries ?? ''}" placeholder="–">
        </label>
      </div>
      <div class="grid2">
        <label class="field"><span>Ocena</span>
          <select name="rating">
            ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === (a.rating || 0) ? 'selected' : ''}>${n ? stars(n) : 'brak'}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Wycena wg mnie</span>
          <select name="gradeFeel">
            <option value="">w sam raz</option>
            <option value="soft" ${a.gradeFeel === 'soft' ? 'selected' : ''}>soft (łatwiejsza)</option>
            <option value="hard" ${a.gradeFeel === 'hard' ? 'selected' : ''}>hard (trudniejsza)</option>
          </select>
        </label>
      </div>
      <div class="chips">
        ${check('repeat', 'Powtórzenie')}
        ${check('secondGo', '2. próba')}
        ${check('firstAscent', 'Pierwsze przejście (FA)')}
        ${check('recommended', '👍 Polecam')}
        ${check('project', 'Projekt')}
        ${check('traditional', 'Trad')}
      </div>
      <details ${a.traits?.length ? 'open' : ''}>
        <summary>Charakter drogi</summary>
        <div class="chips">
          ${TRAITS.map(([key, label]) => `<label class="chip"><input type="checkbox" name="trait" value="${key}" ${a.traits?.includes(key) ? 'checked' : ''}>${label}</label>`).join('')}
        </div>
      </details>
      <details>
        <summary>Region i kraj</summary>
        <div class="grid2">
          <label class="field"><span>Region</span><input name="area" maxlength="100" value="${esc(a.area)}" placeholder="np. Jura"></label>
          <label class="field"><span>Kraj</span><input name="country" maxlength="60" value="${esc(a.country)}" placeholder="np. Poland"></label>
        </div>
      </details>
      <label class="field"><span>Komentarz</span>
        <textarea name="notes" rows="2" placeholder="Patenty, kluczowy ruch, warunki…">${esc(a.notes)}</textarea>
      </label>
      <div class="row">
        ${editingId ? '<button type="button" class="btn ghost danger" id="delete">Usuń</button>' : ''}
        <button type="button" class="btn ghost" id="cancel">Anuluj</button>
        <button class="btn primary">Zapisz</button>
      </div>
    </form>`;
}

// Selecty skali, wyceny i stylu zależą od rodzaju (droga/boulder), więc wypełniamy je w JS.
function bindForm(form, a) {
  let kind = a.kind;
  const sel = (name) => form.elements[name];
  const options = (items, selected) =>
    items.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');

  function fillGrades(system, grade) {
    const grades = SYSTEMS[system].grades;
    // Zachowujemy nietypową wycenę z importu, której nie ma w skali.
    const list = grade && !grades.includes(grade) ? [grade, ...grades] : grades;
    sel('grade').innerHTML = options(list.map((g) => [g, g]), grade ?? defaultGrade(system));
  }
  function fillKind(system, grade, style) {
    sel('system').innerHTML = options(systemsFor(kind).map(([key, s]) => [key, s.label]), system);
    sel('style').innerHTML = options(STYLES[kind], style);
    fillGrades(sel('system').value, grade);
  }

  fillKind(a.system, a.grade, a.style);

  sel('system').addEventListener('change', () => fillGrades(sel('system').value));
  form.querySelectorAll('#kind button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.k === kind) return;
    kind = b.dataset.k;
    form.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('active', x === b));
    const { settings } = getState();
    fillKind(kind === 'route' ? settings.routeSystem : settings.boulderSystem, undefined, DEFAULT_STYLE[kind]);
  }));

  return () => {
    const f = new FormData(form);
    const text = (name) => String(f.get(name) ?? '').trim();
    return {
      date: f.get('date'),
      kind,
      name: text('name'),
      crag: text('crag'),
      sector: text('sector'),
      area: text('area'),
      country: text('country'),
      system: f.get('system'),
      grade: f.get('grade'),
      style: f.get('style'),
      tries: Number(f.get('tries')) || null,
      rating: Number(f.get('rating')) || 0,
      gradeFeel: f.get('gradeFeel'),
      repeat: f.has('repeat'),
      secondGo: f.has('secondGo'),
      firstAscent: f.has('firstAscent'),
      recommended: f.has('recommended'),
      project: f.has('project'),
      traditional: f.has('traditional'),
      traits: f.getAll('trait'),
      notes: text('notes'),
    };
  };
}

// ---------- Widok ----------

const currentSort = () => getState().settings.ascentSort || 'date_desc';

export function renderAscents(view) {
  view.innerHTML = `
    <div class="seg" id="filter">
      ${FILTERS.map(([k, label]) => `<button data-f="${k}" class="${filter === k ? 'active' : ''}">${label}</button>`).join('')}
    </div>
    <div class="toolbar">
      <input type="search" id="search" placeholder="Szukaj: nazwa, rejon, sektor, wycena…" value="${esc(query)}">
      <select id="sort" aria-label="Sortowanie">
        ${SORTS.map(([k, label]) => `<option value="${k}" ${k === currentSort() ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    <div id="formSlot"></div>
    <div id="results" class="stack-col"></div>`;

  const formSlot = view.querySelector('#formSlot');
  const results = view.querySelector('#results');

  view.querySelectorAll('#filter button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    limit = PAGE;
    view.querySelectorAll('#filter button').forEach((x) => x.classList.toggle('active', x === b));
    renderResults();
  }));
  view.querySelector('#search').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    limit = PAGE;
    renderResults();
  });
  view.querySelector('#sort').addEventListener('change', (e) => {
    update((s) => { s.settings.ascentSort = e.target.value; });
    limit = PAGE;
    renderResults();
  });

  function renderForm() {
    if (!formOpen) {
      formSlot.innerHTML = '<button class="btn primary big" id="add">+ Dodaj przejście</button>';
      formSlot.querySelector('#add').addEventListener('click', () => {
        formOpen = true;
        editingId = null;
        renderForm();
      });
      return;
    }

    const { ascents, settings } = getState();
    const sorted = [...ascents].sort(byNewest);
    const unique = (key) => [...new Set(ascents.map((a) => a[key]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pl'));
    const editing = ascents.find((a) => a.id === editingId);
    const kind = filter === 'boulder' ? 'boulder' : 'route';
    const draft = editing || {
      date: today(),
      kind,
      name: '',
      crag: sorted[0]?.crag ?? '',
      sector: sorted[0]?.sector ?? '',
      area: sorted[0]?.area ?? '',
      country: sorted[0]?.country ?? '',
      system: kind === 'route' ? settings.routeSystem : settings.boulderSystem,
      grade: undefined,
      style: DEFAULT_STYLE[kind],
      rating: 0,
      traits: [],
      notes: '',
    };

    formSlot.innerHTML = formHtml(draft, unique('crag'), unique('sector'));
    const form = formSlot.querySelector('#form');
    const read = bindForm(form, draft);
    form.querySelector('#cancel').addEventListener('click', closeForm);
    form.querySelector('#delete')?.addEventListener('click', () => {
      if (!confirm('Usunąć to przejście?')) return;
      update((s) => { s.ascents = s.ascents.filter((x) => x.id !== editingId); });
      toast('Usunięto przejście');
      closeForm();
      renderResults();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = read();
      update((s) => {
        const existing = s.ascents.find((x) => x.id === editingId);
        if (existing) Object.assign(existing, data);
        else s.ascents.push({ id: uid(), created: Date.now(), ...data });
      });
      toast(editingId ? 'Zapisano zmiany' : 'Dodano przejście');
      closeForm();
      renderResults();
    });
  }

  function closeForm() {
    formOpen = false;
    editingId = null;
    renderForm();
  }

  function renderResults() {
    const sort = currentSort();
    const list = sortList(
      getState().ascents.filter((a) => (filter === 'all' || a.kind === filter) && matches(a, query)),
      sort,
    );

    results.innerHTML = `${query ? '' : statsHtml(list)}${listHtml(list, sort)}`;

    results.querySelector('#more')?.addEventListener('click', () => {
      limit += PAGE;
      renderResults();
    });
    results.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      formOpen = true;
      editingId = b.dataset.edit;
      renderForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  }

  renderForm();
  renderResults();
}
