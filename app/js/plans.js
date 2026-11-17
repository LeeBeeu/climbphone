import { getState, update, uid } from './store.js';
import { esc, toast, today, parseDate, fmtMinutes } from './ui.js';
import {
  PHASES, phaseLabel, weekKeyOf, weekNumber, weekRange, shiftWeek, effectiveDays, hasWeekOverride, planProgress,
  itemKey, fillBlock, copyPreviousWeek, weekVolume,
} from './plan-calc.js';

const TEMPLATES = [
  {
    name: 'Siła palców – start (3× w tygodniu)',
    desc: 'Dla osób wspinających się co najmniej rok. Między dniami zrób min. 1 dzień przerwy.',
    days: [
      { name: 'Dzień 1 – chwytotablica + bouldering', items: [
        'Rozgrzewka: 15 min łatwego wspinania',
        'Timer: Max hangs 10 s (listwa 20 mm)',
        'Bouldering: 5 problemów blisko limitu',
        'Antagonisty: pompki 3 × 12',
      ] },
      { name: 'Dzień 2 – bouldering', items: [
        'Rozgrzewka: 15 min',
        '4×4: 4 bouldery pod rząd, 4 serie, 4 min przerwy',
        'Core: plank 3 × 45 s',
        'Rozciąganie 10 min',
      ] },
      { name: 'Dzień 3 – wytrzymałość', items: [
        'Rozgrzewka: 10 min',
        'ARC: 2 × 20 min ciągłego, łatwego wspinania',
        'Timer: Repeaters 7/3',
        'Mobilność bioder 10 min',
      ] },
    ],
  },
  {
    name: 'Wytrzymałość na drogach (2× w tygodniu)',
    desc: 'Pod dłuższe drogi z liną. Dobry blok na 4–6 tygodni przed sezonem skałkowym.',
    days: [
      { name: 'Dzień 1 – liny', items: [
        'Rozgrzewka: 2 łatwe drogi',
        '4×4 na drogach: 4 drogi bez odpoczynku, 4 serie',
        'Rozciąganie przedramion',
      ] },
      { name: 'Dzień 2 – ścianka', items: [
        'Rozgrzewka: 10 min trawersu',
        'Interwały na trawersie: 1 min wspinania / 1 min przerwy × 10',
        'Timer: Wytrzymałość 20/10',
        'Core: unoszenie nóg w zwisie 3 × 10',
      ] },
    ],
  },
];

let openId = null;
let draft = null;      // edytowany plan (kopia) z polem scope: 'template' (szablon) albo 'week' (tylko ten tydzień)
let viewWeek = null;   // oglądany tydzień ("2026-W47"); null = bieżący
let blockOpen = false; // formularz „Ustaw blok faz”

const checksKey = (planId, weekKey) => `${planId}|${weekKey}`;
const findPlan = (id) => getState().plans.find((p) => p.id === id);
const currentWeek = () => weekKeyOf(today());

function progress(plan, weekKey) {
  const checks = getState().planChecks[checksKey(plan.id, weekKey)] || {};
  return { ...planProgress(plan, checks, weekKey), checks };
}

function weekLabel(weekKey) {
  const { start, end } = weekRange(weekKey);
  const f = (k, opts) => parseDate(k).toLocaleDateString('pl-PL', opts);
  return `${f(start, { day: 'numeric', month: 'short' })} – ${f(end, { day: 'numeric', month: 'short' })}`;
}

const phaseChip = (id) => (id ? `<span class="phase-chip phase-${id}">${esc(phaseLabel(id))}</span>` : '');

export function renderPlans(view) {
  function render() {
    if (draft) renderEditor();
    else if (openId && findPlan(openId)) renderPlan(findPlan(openId));
    else {
      openId = null;
      renderList();
    }
  }

  function go(fn) {
    fn();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Lista planów ----------

  function renderList() {
    const { plans } = getState();
    const week = currentWeek();
    view.innerHTML = `
      <p class="muted">Tydzień ${weekNumber(week)} · ${weekLabel(week)}</p>
      ${plans.length ? plans.map((p) => {
        const pr = progress(p, week);
        return `
          <button class="card" data-open="${p.id}">
            <div class="card-head"><h2>${esc(p.name)}</h2><span class="muted">${pr.done}/${pr.total}</span></div>
            ${phaseChip(p.weeks?.[week]?.phase)}
            ${p.desc ? `<p class="muted">${esc(p.desc)}</p>` : ''}
            <div class="meter"><div style="width:${pr.pct}%"></div></div>
          </button>`;
      }).join('') : '<div class="empty">Nie masz jeszcze planów.<br>Zacznij od szablonu albo utwórz własny.</div>'}
      <button class="btn primary big" id="new">+ Nowy plan</button>
      <section class="card">
        <h2>Szablony</h2>
        ${TEMPLATES.map((t, i) => `
          <div class="tpl">
            <div><strong>${esc(t.name)}</strong><p class="muted">${esc(t.desc)}</p></div>
            <button class="btn small" data-tpl="${i}">Dodaj</button>
          </div>`).join('')}
      </section>`;

    view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => go(() => {
      openId = b.dataset.open;
      viewWeek = null;
    })));
    view.querySelector('#new').addEventListener('click', () => go(() => {
      draft = { scope: 'template', name: '', desc: '', days: [{ name: 'Dzień 1', items: [] }] };
    }));
    view.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      const plan = { id: uid(), ...structuredClone(TEMPLATES[b.dataset.tpl]), weeks: {} };
      update((s) => s.plans.push(plan));
      toast('Dodano plan z szablonu');
      go(() => { openId = plan.id; viewWeek = null; });
    }));
  }

  // ---------- Szczegóły planu: wybrany tydzień ----------

  function renderPlan(plan) {
    const week = viewWeek || currentWeek();
    const isCurrent = week === currentWeek();
    const pr = progress(plan, week);
    const phase = plan.weeks?.[week]?.phase || '';
    const override = hasWeekOverride(plan, week);
    const days = effectiveDays(plan, week);
    const hist = Array.from({ length: 8 }, (_, i) => shiftWeek(week, i - 7));
    const sessions = getState().sessions;

    view.innerHTML = `
      <button class="btn ghost small" id="back" style="align-self:flex-start">← Wszystkie plany</button>
      <section class="card">
        <div class="card-head"><h2>${esc(plan.name)}</h2><span class="muted">${pr.done}/${pr.total}</span></div>
        ${plan.desc ? `<p class="muted">${esc(plan.desc)}</p>` : ''}
        <div class="week-nav">
          <button class="btn small" id="prevW" aria-label="Poprzedni tydzień">‹</button>
          <div><strong>Tydzień ${weekNumber(week)}</strong>${isCurrent ? ' <small class="muted">(bieżący)</small>' : ''}<br>
            <small class="muted">${weekLabel(week)}</small></div>
          <button class="btn small" id="nextW" aria-label="Następny tydzień">›</button>
        </div>
        ${isCurrent ? '' : '<button class="btn ghost small" id="thisW">Wróć do bieżącego tygodnia</button>'}
        <label class="field"><span>Faza tygodnia</span>
          <select id="phase"><option value="">– brak –</option>
            ${PHASES.map((p) => `<option value="${p.id}" ${p.id === phase ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
          </select>
        </label>
        <div class="meter"><div style="width:${pr.pct}%"></div></div>
        ${override
          ? '<p class="hint">Ten tydzień ma własny plan (inny niż szablon). <button class="btn ghost small" id="resetWeek">Przywróć szablon</button></p>'
          : '<p class="muted">Tydzień według szablonu planu. Odhaczenia są osobne dla każdego tygodnia.</p>'}
      </section>
      ${days.map((day, i) => `
        <section class="card">
          <h3>${esc(day.name)}</h3>
          <div>
            ${day.items.map((text) => {
              const checked = !!pr.checks[itemKey(i, text)];
              return `<label class="check ${checked ? 'done' : ''}">
                <input type="checkbox" data-key="${esc(itemKey(i, text))}" ${checked ? 'checked' : ''}>
                <span>${esc(text)}</span>
              </label>`;
            }).join('')}
          </div>
        </section>`).join('')}
      <div class="row">
        <button class="btn" id="copyPrev">⧉ Kopiuj poprzedni tydzień</button>
        <button class="btn" id="editWeek">✏️ Edytuj ten tydzień</button>
      </div>
      <div class="row">
        <button class="btn" id="edit">✏️ Edytuj szablon</button>
        <button class="btn" id="reset">↺ Odznacz tydzień</button>
        <button class="btn danger" id="del">🗑️ Usuń</button>
      </div>

      <section class="card">
        <div class="card-head"><h2>Blok faz</h2>
          <button class="btn ghost small" id="toggleBlock">${blockOpen ? 'Zwiń' : 'Ustaw blok'}</button></div>
        <p class="muted">Np. 8 tygodni siły w mikrocyklu 3:1: trzy tygodnie pracy, czwarty lżejszy (deload).</p>
        ${blockOpen ? `
        <form id="blockForm">
          <div class="grid2">
            <label class="field"><span>Faza</span>
              <select name="phase">${PHASES.filter((p) => p.id !== 'deload').map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label>
            <label class="field"><span>Liczba tygodni</span>
              <input type="number" name="count" min="1" max="26" value="8" inputmode="numeric"></label>
          </div>
          <label class="check"><input type="checkbox" name="deload" checked><span>Mikrocykl 3:1 – co 4. tydzień deload</span></label>
          <button class="btn primary">Ustaw od tygodnia ${weekNumber(week)}</button>
        </form>` : ''}
      </section>

      <section class="card">
        <h2>Objętość – 8 tygodni</h2>
        <p class="muted">Odhaczone ćwiczenia z planu i treningi zapisane w dzienniku.</p>
        <div class="vol">
          ${hist.map((k) => {
            const p = progress(plan, k);
            const v = weekVolume(sessions, k);
            const ph = plan.weeks?.[k]?.phase;
            return `<button class="vol-row ${k === week ? 'current' : ''}" data-week="${k}">
              <span class="vol-w">T${weekNumber(k)}</span>
              <span class="vol-ph">${ph ? phaseChip(ph) : ''}</span>
              <span class="meter"><span style="width:${p.pct}%"></span></span>
              <span class="vol-n">${p.done}/${p.total} · ${v.count} tr.${v.minutes ? ` · ${fmtMinutes(v.minutes)}` : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </section>`;

    const key = checksKey(plan.id, week);
    const setWeeks = (fn) => update((s) => {
      const p = s.plans.find((x) => x.id === plan.id);
      p.weeks = fn(p);
    });
    const $ = (sel) => view.querySelector(sel);

    $('#back').addEventListener('click', () => go(() => { openId = null; }));
    $('#prevW').addEventListener('click', () => { viewWeek = shiftWeek(week, -1); render(); });
    $('#nextW').addEventListener('click', () => { viewWeek = shiftWeek(week, 1); render(); });
    $('#thisW')?.addEventListener('click', () => { viewWeek = null; render(); });
    view.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => {
      viewWeek = b.dataset.week;
      go(() => {});
    }));
    $('#phase').addEventListener('change', (e) => {
      setWeeks((p) => {
        const weeks = { ...(p.weeks || {}) };
        const entry = { ...(weeks[week] || {}), phase: e.target.value || undefined };
        if (!entry.phase) delete entry.phase;
        if (Object.keys(entry).length) weeks[week] = entry; else delete weeks[week];
        return weeks;
      });
      render();
    });
    view.querySelectorAll('input[type=checkbox][data-key]').forEach((cb) => cb.addEventListener('change', () => {
      update((s) => {
        const checks = (s.planChecks[key] ||= {});
        if (cb.checked) checks[cb.dataset.key] = true; else delete checks[cb.dataset.key];
      });
      render();
    }));
    $('#copyPrev').addEventListener('click', () => {
      if (override && !confirm('Ten tydzień ma już własny plan. Zastąpić go planem z poprzedniego tygodnia?')) return;
      setWeeks((p) => copyPreviousWeek(p, week));
      toast(`Skopiowano tydzień ${weekNumber(shiftWeek(week, -1))}`);
      render();
    });
    $('#resetWeek')?.addEventListener('click', () => {
      if (!confirm('Przywrócić szablon w tym tygodniu? Własny plan tego tygodnia zostanie usunięty.')) return;
      setWeeks((p) => {
        const weeks = { ...(p.weeks || {}) };
        const { days: _drop, ...rest } = weeks[week] || {};
        if (Object.keys(rest).length) weeks[week] = rest; else delete weeks[week];
        return weeks;
      });
      render();
    });
    $('#editWeek').addEventListener('click', () => go(() => {
      draft = { scope: 'week', weekKey: week, id: plan.id, name: plan.name, desc: plan.desc, days: structuredClone(days) };
    }));
    $('#edit').addEventListener('click', () => go(() => { draft = { scope: 'template', ...structuredClone(plan) }; }));
    $('#reset').addEventListener('click', () => {
      update((s) => { delete s.planChecks[key]; });
      render();
    });
    $('#del').addEventListener('click', () => {
      if (!confirm(`Usunąć plan „${plan.name}”?`)) return;
      update((s) => {
        s.plans = s.plans.filter((p) => p.id !== plan.id);
        Object.keys(s.planChecks).filter((k) => k.startsWith(`${plan.id}|`)).forEach((k) => delete s.planChecks[k]);
      });
      toast('Usunięto plan');
      go(() => { openId = null; });
    });
    $('#toggleBlock').addEventListener('click', () => { blockOpen = !blockOpen; render(); });
    $('#blockForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const count = Math.max(1, Math.min(26, parseInt(f.count.value, 10) || 1));
      setWeeks((p) => fillBlock(p.weeks, week, f.phase.value, count, f.deload.checked ? 4 : 0));
      blockOpen = false;
      toast(`Ustawiono ${count} tyg. od tygodnia ${weekNumber(week)}`);
      render();
    });
  }

  // ---------- Edytor: szablon planu albo tylko wybrany tydzień ----------

  function renderEditor() {
    const weekOnly = draft.scope === 'week';
    view.innerHTML = `
      <form class="card" id="editor">
        <h2>${weekOnly ? `Plan tygodnia ${weekNumber(draft.weekKey)}` : draft.id ? 'Edytuj szablon planu' : 'Nowy plan'}</h2>
        ${weekOnly
          ? `<p class="muted">${esc(draft.name)} · ${weekLabel(draft.weekKey)}. Zmiany dotyczą tylko tego tygodnia – szablon zostaje bez zmian.</p>`
          : `<label class="field"><span>Nazwa</span><input name="name" maxlength="80" value="${esc(draft.name)}" required></label>
        <label class="field"><span>Opis (opcjonalnie)</span><input name="desc" maxlength="200" value="${esc(draft.desc)}"></label>`}
        ${draft.days.map((day, i) => `
          <fieldset class="day">
            <div class="card-head">
              <input class="day-name" data-name="${i}" maxlength="80" value="${esc(day.name)}" placeholder="Nazwa dnia">
              <button type="button" class="icon" data-rm="${i}" aria-label="Usuń dzień">✕</button>
            </div>
            <textarea data-items="${i}" rows="${Math.max(3, day.items.length + 1)}"
              placeholder="Jedno ćwiczenie w linii, np.&#10;Rozgrzewka 15 min&#10;Timer: Repeaters 7/3">${esc(day.items.join('\n'))}</textarea>
          </fieldset>`).join('')}
        <button type="button" class="btn ghost" id="addDay">+ Dodaj dzień</button>
        <div class="row">
          <button type="button" class="btn ghost" id="cancel">Anuluj</button>
          <button class="btn primary">${weekOnly ? 'Zapisz tydzień' : 'Zapisz plan'}</button>
        </div>
      </form>`;

    const form = view.querySelector('#editor');

    // Przepisuje to, co wpisano w formularzu, do draftu (przed dodaniem/usunięciem dnia).
    function sync() {
      if (!weekOnly) {
        draft.name = form.elements.name.value;
        draft.desc = form.elements.desc.value;
      }
      draft.days.forEach((day, i) => {
        day.name = form.querySelector(`[data-name="${i}"]`).value;
        day.items = form.querySelector(`[data-items="${i}"]`).value.split('\n').map((t) => t.trim()).filter(Boolean);
      });
    }

    view.querySelector('#addDay').addEventListener('click', () => {
      sync();
      draft.days.push({ name: `Dzień ${draft.days.length + 1}`, items: [] });
      render();
    });
    view.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      sync();
      draft.days.splice(Number(b.dataset.rm), 1);
      render();
    }));
    view.querySelector('#cancel').addEventListener('click', () => go(() => { draft = null; }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sync();
      const days = draft.days
        .map((d, i) => ({ name: d.name.trim() || `Dzień ${i + 1}`, items: d.items }))
        .filter((d) => d.items.length);
      if (!days.length) return toast('Dodaj przynajmniej jedno ćwiczenie');
      if (weekOnly) {
        update((s) => {
          const p = s.plans.find((x) => x.id === draft.id);
          p.weeks = { ...(p.weeks || {}), [draft.weekKey]: { ...(p.weeks?.[draft.weekKey] || {}), days } };
        });
        toast(`Zapisano plan tygodnia ${weekNumber(draft.weekKey)}`);
        return go(() => { viewWeek = draft.weekKey; draft = null; });
      }
      const existing = draft.id ? findPlan(draft.id) : null;
      const plan = {
        id: draft.id || uid(),
        name: draft.name.trim(),
        desc: draft.desc.trim(),
        days,
        weeks: existing?.weeks || {},
      };
      update((s) => {
        const i = s.plans.findIndex((p) => p.id === plan.id);
        if (i >= 0) s.plans[i] = plan; else s.plans.push(plan);
      });
      toast('Zapisano plan');
      go(() => {
        openId = plan.id;
        draft = null;
      });
    });
  }

  render();
}
