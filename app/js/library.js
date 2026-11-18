// Ekran „Biblioteka ćwiczeń”: wyszukiwanie, filtry, opis ćwiczenia i akcje
// (dodaj do planu, uruchom w timerze, dodaj do dziennika). Dane: library-data.js, obliczenia: library-calc.js.
import { getState, update, uid } from './store.js';
import { esc, toast } from './ui.js';
import {
  LIBRARY, CATEGORIES, EQUIPMENT, filterLibrary, byId, catLabel, planItemText, timerPresetFrom, journalExerciseFrom, countByCat,
} from './library-calc.js';
import { LEVELS } from './library-data.js';
import { selectTimerPreset } from './timer.js';
import { openJournalWithExercise } from './journal.js';

const filters = { q: '', cat: '', equip: '', level: 0 };
let openId = null;
let lastPlanId = null;

const KIND_LABEL = { timer: 'protokół timera', sets: 'serie × powtórzenia', time: 'na czas', climb: 'na ścianie' };
const levelDots = (n) => `<span class="lvl" title="${LEVELS[n]}" aria-label="Poziom: ${LEVELS[n]}">${'●'.repeat(n)}${'○'.repeat(3 - n)}</span>`;

// Rodzaj treningu w dzienniku dla ćwiczenia z biblioteki.
function sessionType(e) {
  if (e.cat === 'fingers') return 'Chwytotablica';
  if (e.equip.includes('campus')) return 'Kampus';
  if (e.cat === 'mobility') return 'Mobilność / rozciąganie';
  if (['strength', 'core', 'antagonist', 'warmup'].includes(e.cat)) return 'Siła / ogólnorozwojówka';
  return null;
}

function listHtml() {
  const list = filterLibrary(LIBRARY, filters);
  if (!list.length) return '<div class="empty">Nic nie pasuje do filtrów.<br>Spróbuj innego słowa albo wyczyść filtry.</div>';
  return CATEGORIES.map((c) => {
    const items = list.filter((e) => e.cat === c.id);
    if (!items.length) return '';
    return `<h3 class="group-title">${c.icon} ${esc(c.label)} <small class="muted">(${items.length})</small></h3>
      <ul class="list">${items.map((e) => `
        <li><button class="item lib-item" data-open="${e.id}">
          <div class="item-main">
            <div class="item-title">${esc(e.name)}</div>
            <div class="item-sub">${esc(e.dose)}</div>
            <div class="item-sub">${levelDots(e.level)} ${esc(e.equip.map((k) => EQUIPMENT[k]).join(', '))}</div>
          </div>
          <span class="muted" aria-hidden="true">›</span>
        </button></li>`).join('')}</ul>`;
  }).join('');
}

function planOptions(plans) {
  return [...plans.map((p) => `<option value="${p.id}" ${p.id === lastPlanId ? 'selected' : ''}>${esc(p.name)}</option>`),
    '<option value="__new">+ Nowy plan „Mój plan”</option>'].join('');
}

function targetOptions(plan) {
  const days = plan ? plan.days.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`) : [];
  return ['<option value="pool">Pula tygodnia (dowolny dzień)</option>', ...days].join('');
}

export function renderLibrary(view) {
  function render() {
    const e = openId ? byId(openId) : null;
    if (e) renderDetail(e); else renderList();
  }

  function renderList() {
    const counts = countByCat(LIBRARY);
    view.innerHTML = `
      <section class="card">
        <label class="field"><span class="sr-only">Szukaj</span>
          <input type="search" id="lq" placeholder="Szukaj, np. palce, kampus, łopatki…" value="${esc(filters.q)}" autocomplete="off"></label>
        <div class="chips" id="lcat" role="group" aria-label="Kategoria">
          <button data-cat="" class="${filters.cat ? '' : 'active'}">Wszystkie (${LIBRARY.length})</button>
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
      <div id="libList">${listHtml()}</div>`;

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
    bindOpen();
  }

  function bindOpen() {
    view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      openId = b.dataset.open;
      render();
      window.scrollTo(0, 0);
    }));
  }

  function renderDetail(e) {
    const { plans } = getState();
    const selPlan = plans.find((p) => p.id === lastPlanId) || plans[0] || null;
    if (selPlan) lastPlanId = selPlan.id;
    view.innerHTML = `
      <button class="btn ghost small" id="lback" style="align-self:flex-start">← Biblioteka</button>
      <section class="card">
        <h2>${esc(e.name)}</h2>
        <p class="lib-meta"><span class="phase-chip">${esc(catLabel(e.cat))}</span> ${levelDots(e.level)} <small class="muted">${esc(LEVELS[e.level])}</small></p>
        <p class="muted">Sprzęt: ${esc(e.equip.map((k) => EQUIPMENT[k]).join(', '))} · ${KIND_LABEL[e.kind]}</p>
        <p><strong>${esc(e.dose)}</strong></p>
        <h3>Jak wykonać</h3>
        <p>${esc(e.how)}</p>
        ${e.tips ? `<h3>Progresja i wskazówki</h3><p>${esc(e.tips)}</p>` : ''}
        ${e.caution ? `<p class="hint">⚠️ ${esc(e.caution)}</p>` : ''}
        ${e.kind === 'timer' ? `<p class="muted">Timer: ${e.timer.sets} × ${e.timer.reps} · zwis ${e.timer.hang} s / przerwa ${e.timer.rest} s · między seriami ${e.timer.setRest} s</p>` : ''}
      </section>
      ${e.kind === 'timer' ? '<button class="btn primary big" id="toTimer">▶ Uruchom w timerze</button>' : ''}
      ${e.kind === 'sets' ? '<button class="btn primary big" id="toJournal">📓 Dodaj do dziennika</button>' : ''}
      <section class="card">
        <h2>Dodaj do planu</h2>
        <div class="grid2">
          <label class="field"><span>Plan</span><select id="lplan">${planOptions(plans)}</select></label>
          <label class="field"><span>Gdzie</span><select id="ltarget">${targetOptions(selPlan)}</select></label>
        </div>
        <p class="muted">Pozycja: „${esc(planItemText(e))}”. Trafi do szablonu planu (wszystkie tygodnie).</p>
        <button class="btn" id="toPlan">+ Dodaj do planu</button>
      </section>`;

    view.querySelector('#lback').addEventListener('click', () => { openId = null; render(); });
    view.querySelector('#lplan').addEventListener('change', (ev) => {
      lastPlanId = ev.target.value === '__new' ? null : ev.target.value;
      view.querySelector('#ltarget').innerHTML = targetOptions(plans.find((p) => p.id === lastPlanId));
    });

    view.querySelector('#toPlan').addEventListener('click', () => {
      const planVal = view.querySelector('#lplan').value;
      const target = view.querySelector('#ltarget').value;
      const text = planItemText(e);
      let name = '';
      let dup = false;
      update((s) => {
        let plan = s.plans.find((p) => p.id === planVal);
        if (!plan) {
          plan = { id: uid(), name: 'Mój plan', desc: '', days: [], pool: [], weeks: {} };
          s.plans.push(plan);
        }
        lastPlanId = plan.id;
        name = plan.name;
        const list = target === 'pool' ? (plan.pool ||= []) : plan.days[Number(target)].items;
        if (list.includes(text)) dup = true; else list.push(text);
      });
      toast(dup ? `Już jest w planie „${name}”` : `Dodano do planu „${name}”`);
      render();
    });

    view.querySelector('#toTimer')?.addEventListener('click', () => {
      const preset = timerPresetFrom(e);
      update((s) => {
        const i = s.timerPresets.findIndex((p) => p.id === preset.id);
        if (i < 0) s.timerPresets.push(preset); // istniejący zostaje – mógł być zmieniony przez użytkownika
      });
      selectTimerPreset(preset.id);
      location.hash = '#/timer';
    });

    view.querySelector('#toJournal')?.addEventListener('click', () => {
      openJournalWithExercise(journalExerciseFrom(e), sessionType(e));
      location.hash = '#/dziennik';
    });
  }

  render();
}
