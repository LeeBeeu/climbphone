import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDate, monthLabel, fmtMinutes, startOfWeek, parseDate } from './ui.js';

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

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
const sumMinutes = (list) => list.reduce((t, s) => t + (Number(s.duration) || 0), 0);

function formHtml(s) {
  const types = SESSION_TYPES.includes(s.type) ? SESSION_TYPES : [...SESSION_TYPES, s.type];
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
      <label class="field"><span>Notatki</span>
        <textarea name="notes" rows="3" placeholder="Co było w planie, samopoczucie, kontuzje…">${esc(s.notes)}</textarea>
      </label>
      <div class="row">
        <button type="button" class="btn ghost" id="cancel">Anuluj</button>
        <button class="btn primary">Zapisz</button>
      </div>
    </form>`;
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
      ${listHtml([...sessions].sort(byNewest))}`;

    view.querySelector('#add')?.addEventListener('click', () => {
      formOpen = true;
      editingId = null;
      render();
    });
    view.querySelector('#cancel')?.addEventListener('click', closeForm);
    view.querySelector('#form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = {
        date: f.get('date'),
        type: f.get('type'),
        duration: Number(f.get('duration')),
        rpe: f.get('rpe') ? Number(f.get('rpe')) : null,
        notes: f.get('notes').trim(),
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
      formOpen = true;
      editingId = b.dataset.edit;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Usunąć ten trening?')) return;
      update((s) => { s.sessions = s.sessions.filter((x) => x.id !== b.dataset.del); });
      render();
    }));
  }

  function closeForm() {
    formOpen = false;
    editingId = null;
    render();
  }

  render();
}
