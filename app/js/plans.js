import { getState, update, uid } from './store.js';
import { esc, toast, isoWeek, weekRangeLabel } from './ui.js';

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
let draft = null; // edytowany plan (kopia), null gdy nie edytujemy

const checksKey = (planId, weekKey) => `${planId}|${weekKey}`;
const itemKey = (dayIdx, text) => `${dayIdx}:${text}`;
const findPlan = (id) => getState().plans.find((p) => p.id === id);

function progress(plan, weekKey) {
  const checks = getState().planChecks[checksKey(plan.id, weekKey)] || {};
  let total = 0;
  let done = 0;
  plan.days.forEach((day, i) => day.items.forEach((text) => {
    total++;
    if (checks[itemKey(i, text)]) done++;
  }));
  return { total, done, checks, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function renderPlans(view) {
  const week = isoWeek();

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
    view.innerHTML = `
      <p class="muted">Tydzień ${week.week} · ${weekRangeLabel()}</p>
      ${plans.length ? plans.map((p) => {
        const pr = progress(p, week.key);
        return `
          <button class="card" data-open="${p.id}">
            <div class="card-head"><h2>${esc(p.name)}</h2><span class="muted">${pr.done}/${pr.total}</span></div>
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

    view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => go(() => { openId = b.dataset.open; })));
    view.querySelector('#new').addEventListener('click', () => go(() => {
      draft = { name: '', desc: '', days: [{ name: 'Dzień 1', items: [] }] };
    }));
    view.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      const plan = { id: uid(), ...structuredClone(TEMPLATES[b.dataset.tpl]) };
      update((s) => s.plans.push(plan));
      toast('Dodano plan z szablonu');
      go(() => { openId = plan.id; });
    }));
  }

  // ---------- Szczegóły planu (odhaczanie w bieżącym tygodniu) ----------

  function renderPlan(plan) {
    const pr = progress(plan, week.key);
    view.innerHTML = `
      <button class="btn ghost small" id="back" style="align-self:flex-start">← Wszystkie plany</button>
      <section class="card">
        <div class="card-head"><h2>${esc(plan.name)}</h2><span class="muted">${pr.done}/${pr.total}</span></div>
        ${plan.desc ? `<p class="muted">${esc(plan.desc)}</p>` : ''}
        <div class="meter"><div style="width:${pr.pct}%"></div></div>
        <p class="muted">Tydzień ${week.week} (${weekRangeLabel()}). Odhaczenia zaczynają się od nowa co tydzień.</p>
      </section>
      ${plan.days.map((day, i) => `
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
        <button class="btn" id="edit">✏️ Edytuj</button>
        <button class="btn" id="reset">↺ Odznacz tydzień</button>
        <button class="btn danger" id="del">🗑️ Usuń</button>
      </div>`;

    const key = checksKey(plan.id, week.key);
    view.querySelector('#back').addEventListener('click', () => go(() => { openId = null; }));
    view.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      update((s) => {
        const checks = (s.planChecks[key] ||= {});
        if (cb.checked) checks[cb.dataset.key] = true; else delete checks[cb.dataset.key];
      });
      render();
    }));
    view.querySelector('#edit').addEventListener('click', () => go(() => { draft = structuredClone(plan); }));
    view.querySelector('#reset').addEventListener('click', () => {
      update((s) => { delete s.planChecks[key]; });
      render();
    });
    view.querySelector('#del').addEventListener('click', () => {
      if (!confirm(`Usunąć plan „${plan.name}”?`)) return;
      update((s) => {
        s.plans = s.plans.filter((p) => p.id !== plan.id);
        Object.keys(s.planChecks).filter((k) => k.startsWith(`${plan.id}|`)).forEach((k) => delete s.planChecks[k]);
      });
      toast('Usunięto plan');
      go(() => { openId = null; });
    });
  }

  // ---------- Edytor planu ----------

  function renderEditor() {
    view.innerHTML = `
      <form class="card" id="editor">
        <h2>${draft.id ? 'Edytuj plan' : 'Nowy plan'}</h2>
        <label class="field"><span>Nazwa</span><input name="name" maxlength="80" value="${esc(draft.name)}" required></label>
        <label class="field"><span>Opis (opcjonalnie)</span><input name="desc" maxlength="200" value="${esc(draft.desc)}"></label>
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
          <button class="btn primary">Zapisz plan</button>
        </div>
      </form>`;

    const form = view.querySelector('#editor');

    // Przepisuje to, co wpisano w formularzu, do draftu (przed dodaniem/usunięciem dnia).
    function sync() {
      draft.name = form.elements.name.value;
      draft.desc = form.elements.desc.value;
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
      const plan = {
        id: draft.id || uid(),
        name: draft.name.trim(),
        desc: draft.desc.trim(),
        days: draft.days
          .map((d, i) => ({ name: d.name.trim() || `Dzień ${i + 1}`, items: d.items }))
          .filter((d) => d.items.length),
      };
      if (!plan.days.length) return toast('Dodaj przynajmniej jedno ćwiczenie');
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
