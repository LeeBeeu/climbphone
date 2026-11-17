// Karta tygodniowego check-inu (ekran „Plany”). Reguły i sugestia: checkin-calc.js.
import { getState, update, uid } from './store.js';
import { esc, toast, today, parseDate } from './ui.js';
import { QUESTIONS, READINESS, ACTIONS, RULES, suggestion, isComplete } from './checkin-calc.js';
import { weekKeyOf, weekNumber, shiftWeek, planProgress, phaseLabel } from './plan-calc.js';

let editing = false;
let draft = null;

// Którego tygodnia dotyczy check-in: w poniedziałek i wtorek – poprzedniego (właśnie zakończonego),
// od środy – bieżącego. Karta pokazuje formularz albo zapisany wynik tego tygodnia.
export function checkinWeek(st = getState(), dateKey = today()) {
  const current = weekKeyOf(dateKey);
  const dow = parseDate(dateKey).getDay(); // 0 = niedziela
  return dow === 1 || dow === 2 ? shiftWeek(current, -1) : current;
}

// Średnie wykonanie planów w tygodniu. Liczą się tylko plany, w których w tym tygodniu coś odhaczono
// (plan dodany później albo nieużywany nie blokuje „Zwiększ”). null, gdy żadnego takiego planu nie ma.
export function plansPct(st, week) {
  const pcts = st.plans
    .filter((p) => Object.keys(st.planChecks[`${p.id}|${week}`] || {}).length)
    .map((p) => planProgress(p, st.planChecks[`${p.id}|${week}`], week))
    .filter((pr) => pr.total > 0)
    .map((pr) => pr.pct);
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}

const scaleHtml = (q, value) => `
  <div class="ci-q">
    <span>${esc(q.label)}</span>
    <div class="seg ci-scale" data-q="${q.id}">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${value === n ? 'active' : ''}"
        aria-pressed="${value === n}" aria-label="${esc(q.label)}: ${n}">${n}</button>`).join('')}
    </div>
    <small class="muted ci-ends"><span>1 = ${esc(q.low)}</span><span>5 = ${esc(q.high)}</span></small>
  </div>`;

export function checkinCardHtml() {
  const st = getState();
  const week = checkinWeek(st);
  const saved = st.checkins.find((c) => c.week === week);
  const pct = plansPct(st, week);
  const rulesHtml = `<details class="how"><summary>Jak to działa?</summary>
    <ol class="ci-rules">${RULES.map((r) => `<li><span class="badge ${ACTIONS[r.action].css}">${ACTIONS[r.action].label}</span> ${esc(r.text)}</li>`).join('')}</ol>
    <p class="muted">Reguły sprawdzane są po kolei, wygrywa pierwsza pasująca.</p></details>`;

  if (saved && !editing) {
    const s = suggestion(saved, pct);
    const nextPhases = [...new Set(st.plans.map((p) => p.weeks?.[shiftWeek(week, 1)]?.phase).filter(Boolean))];
    return `
      <section class="card" id="checkinCard">
        <div class="card-head"><h2>Check-in – tydzień ${weekNumber(week)}</h2>
          <button class="btn ghost small" id="ciEdit">Zmień</button></div>
        <p class="muted">Ciężkość ${saved.load} · samopoczucie ${saved.wellbeing} · motywacja ${saved.motivation} ·
          ${esc(READINESS.find((r) => r.id === saved.readiness)?.label || '')}${pct !== null ? ` · plan ${pct}%` : ''}</p>
        <p><span class="badge ${ACTIONS[s.action].css}">${ACTIONS[s.action].label}</span> ${esc(s.text)}</p>
        ${nextPhases.length ? `<p class="muted">W planie na tydzień ${weekNumber(shiftWeek(week, 1))}: ${nextPhases.map((p) => esc(phaseLabel(p))).join(', ')}.</p>` : ''}
        ${saved.note ? `<p class="item-notes">${esc(saved.note)}</p>` : ''}
        ${rulesHtml}
      </section>`;
  }

  draft ||= saved ? { ...saved } : { week, load: null, wellbeing: null, motivation: null, readiness: 'normal', note: '' };
  return `
    <section class="card" id="checkinCard">
      <h2>Check-in – tydzień ${weekNumber(week)}</h2>
      <p class="muted">Minuta na koniec tygodnia: aplikacja podpowie, czy w następnym zwiększyć, utrzymać czy zmniejszyć obciążenie.</p>
      ${QUESTIONS.map((q) => scaleHtml(q, draft[q.id])).join('')}
      <label class="field"><span>Gotowość na następny tydzień</span>
        <select id="ciReady">${READINESS.map((r) => `<option value="${r.id}" ${r.id === draft.readiness ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Notatka (opcjonalnie)</span>
        <input id="ciNote" maxlength="200" value="${esc(draft.note)}" placeholder="np. mało snu, ból łokcia"></label>
      <div class="row">
        ${saved ? '<button class="btn ghost" id="ciCancel">Anuluj</button>' : ''}
        <button class="btn primary" id="ciSave">Zapisz check-in</button>
      </div>
      ${rulesHtml}
    </section>`;
}

export function bindCheckin(view, rerender) {
  const card = view.querySelector('#checkinCard');
  if (!card) return;
  card.querySelector('#ciEdit')?.addEventListener('click', () => { editing = true; draft = null; rerender(); });
  card.querySelector('#ciCancel')?.addEventListener('click', () => { editing = false; draft = null; rerender(); });
  card.querySelectorAll('.ci-scale').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    draft[seg.dataset.q] = Number(b.dataset.v);
    seg.querySelectorAll('button').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', x === b);
    });
  }));
  card.querySelector('#ciReady')?.addEventListener('change', (e) => { draft.readiness = e.target.value; });
  card.querySelector('#ciNote')?.addEventListener('input', (e) => { draft.note = e.target.value; });
  card.querySelector('#ciSave')?.addEventListener('click', () => {
    if (!isComplete(draft)) return toast('Zaznacz odpowiedź 1–5 przy każdym pytaniu');
    const entry = {
      id: draft.id || uid(), week: draft.week, load: draft.load, wellbeing: draft.wellbeing, motivation: draft.motivation,
      readiness: draft.readiness, note: (draft.note || '').trim(), created: draft.created || Date.now(),
    };
    update((s) => {
      s.checkins = s.checkins.filter((c) => c.week !== entry.week);
      s.checkins.push(entry);
    });
    const sug = suggestion(entry, plansPct(getState(), entry.week));
    toast(`Check-in zapisany: ${ACTIONS[sug.action].label}`);
    editing = false;
    draft = null;
    rerender();
  });
}
