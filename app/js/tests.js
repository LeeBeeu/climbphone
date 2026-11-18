// Ekran „Testy” – testy siły (Etap 3 w docs/specyfikacja.md): wynik, rekordy, wykres postępu, historia.
import { getState, update, uid } from './store.js';
import { esc, toast, today, fmtDate, parseDate } from './ui.js';
import { bodyWeightOn, fmtAdded, loadFromAdded } from './load-calc.js';
import { dayNumber, keyFromDayNumber } from './weight-calc.js';
import { periodsInWindow } from './weight-stats.js';
import {
  TESTS, GRIPS, testById, valueLabel, valueStep, fmtMetric, fmtValue, testHistory, bestResult, variantLabel,
} from './tests-calc.js';

let selectedTest = TESTS[0].id;
let editingId = null;

const kgText = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const num = (s) => parseFloat(String(s ?? '').replace(',', '.'));
const NICE = [0.5, 1, 2, 5, 10, 20, 25, 50];

function bodyWeight(date) {
  const st = getState();
  return bodyWeightOn(st.weightEntries, st.settings, date, st.settings.hang_body_weight_kg);
}

function formHtml(def, history) {
  const editing = editingId ? getState().strengthTests.find((x) => x.id === editingId) : null;
  const last = history[0];
  const base = editing || { date: today(), value: last?.value ?? (def.kind === 'load' ? 0 : ''),
    edge_mm: last?.edge_mm ?? def.default_edge, grip: last?.grip ?? GRIPS[0], notes: '' };
  return `
    <form class="card" id="tform">
      <h2>${editing ? 'Edytuj wynik' : 'Nowy wynik'}</h2>
      <div class="grid2">
        <label class="field"><span>Data</span><input type="date" name="date" value="${base.date}" required></label>
        <label class="field"><span>${valueLabel(def)}${def.kind === 'load' ? ' <small>– ujemne = odciążenie</small>' : ''}</span>
          <input type="number" name="value" inputmode="decimal" step="${valueStep(def)}" value="${base.value ?? ''}" required>
        </label>
      </div>
      ${def.edge ? `
      <div class="grid2">
        <label class="field"><span>Listwa (mm)</span>
          <input type="number" name="edge_mm" inputmode="numeric" min="4" max="60" value="${base.edge_mm ?? def.default_edge}"></label>
        <label class="field"><span>Chwyt</span>
          <select name="grip">${GRIPS.map((g) => `<option ${g === base.grip ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>` : ''}
      <label class="field"><span>Notatka</span>
        <input name="notes" maxlength="200" value="${esc(base.notes)}" placeholder="np. po dniu odpoczynku, słaba skóra"></label>
      <p class="muted" id="tpreview"></p>
      <div class="row">
        ${editing ? '<button type="button" class="btn ghost" id="tcancel">Anuluj</button><button type="button" class="btn ghost danger" id="tdelete">Usuń</button>' : ''}
        <button class="btn primary">${editing ? 'Zapisz zmiany' : 'Zapisz wynik'}</button>
      </div>
    </form>`;
}

function statsHtml(def, history) {
  if (!history.length) return '';
  const last = history[0];
  const best = bestResult(history, last.variant);
  const count = history.filter((r) => r.variant === last.variant).length;
  const variants = new Set(history.map((r) => r.variant)).size;
  return `
    ${variants > 1 ? `<p class="muted">Wariant: <strong>${esc(variantLabel(def, last))}</strong> (ostatnio używany)</p>` : ''}
    <div class="stats">
      <div class="stat"><b>${best ? fmtMetric(def, best.metric) : '–'}</b><span>rekord${best ? ` · ${fmtDate(best.date)}` : ''}</span></div>
      <div class="stat"><b>${fmtMetric(def, last.metric)}</b><span>ostatni${last.delta !== null ? ` · ${deltaText(def, last.delta)}` : ''}</span></div>
      <div class="stat"><b>${count}</b><span>${count === 1 ? 'test' : 'testów'}</span></div>
    </div>`;
}

function deltaText(def, d) {
  if (!d) return 'bez zmian';
  const unit = { load: ' pp.', reps: '', time_s: ' s', time_min: ' min' }[def.kind];
  return `${d > 0 ? '+' : '−'}${kgText(Math.abs(d))}${unit}`;
}

function historyHtml(def, history) {
  if (!history.length) {
    return '<div class="empty">Brak wyników tego testu.<br>Zrób test według opisu powyżej i zapisz wynik.</div>';
  }
  return `<h3 class="group-title">Historia</h3><ul class="list">${history.map((r) => `
    <li class="item">
      <div class="item-main">
        <div class="item-title">${r.pr && !r.first ? '🏆 ' : ''}${esc(fmtValue(def, r))}</div>
        <div class="item-sub">${fmtDate(r.date)}${def.edge ? ` · ${esc(variantLabel(def, r))}` : ''}${
          r.delta !== null ? ` · <span class="${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}">${deltaText(def, r.delta)}</span>` : ''}${
          def.kind === 'load' && r.body_weight_kg ? ` · MC ${kgText(r.body_weight_kg)} kg` : ''}</div>
        ${r.notes ? `<div class="item-notes">${esc(r.notes)}</div>` : ''}
      </div>
      <div class="item-actions"><button class="icon" data-edit="${r.id}" aria-label="Edytuj">✏️</button></div>
    </li>`).join('')}</ul>`;
}

// Wykres postępu: miara w czasie; linia dla ostatnio używanego wariantu, inne warianty jako szare punkty.
function drawChart(el, def, history) {
  const pts = history.filter((r) => r.metric !== null).map((r) => ({ ...r, day: dayNumber(r.date) })).reverse();
  if (!pts.length) {
    el.innerHTML = '<div class="empty">Wykres pojawi się po pierwszym wyniku.</div>';
    return;
  }
  const width = Math.max(260, el.clientWidth);
  const height = 190;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const main = history[0].variant;
  let start = pts[0].day;
  let end = pts.at(-1).day;
  const span = Math.max(30, end - start);
  start -= span * 0.05 + (end === start ? 15 : 0);
  end += span * 0.05 + (pts.at(-1).day === pts[0].day ? 15 : 0);

  const ys = pts.map((p) => p.metric);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const margin = Math.max((hi - lo) * 0.15, def.kind === 'load' ? 2 : 1);
  lo -= margin; hi += margin;
  const step = NICE.find((s) => (hi - lo) / s <= 4) || 50;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (def.kind !== 'load') lo = Math.max(0, lo);

  const X = (d) => pad.l + ((d - start) / (end - start)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const unit = def.kind === 'load' ? '%' : '';

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Wykres postępu: ${esc(def.name)}">`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg += `<line class="ch-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>
      <text class="ch-label" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${kgText(v)}${unit}</text>`;
  }
  // Oś czasu: 2–5 etykiet miesięcy/dni zależnie od rozpiętości.
  const ticks = Math.max(2, Math.min(5, Math.floor((width - pad.l - pad.r) / 80)));
  for (let i = 0; i <= ticks; i++) {
    const d = Math.round(start + ((end - start) * i) / ticks);
    const opts = end - start > 300 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
    svg += `<text class="ch-label" x="${X(d)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}">${
      parseDate(keyFromDayNumber(d)).toLocaleDateString('pl-PL', opts)}</text>`;
  }
  // Okresy z zakładki Waga (np. „blok siły”) jako pasy z nazwą.
  for (const p of periodsInWindow(getState().weightPeriods, Math.floor(start), Math.ceil(end), today())) {
    const x1 = X(Math.max(p.s, start));
    const x2 = X(Math.min(p.e + 1, end));
    svg += `<rect class="ch-period" x="${x1}" y="${pad.t}" width="${Math.max(2, x2 - x1)}" height="${height - pad.t - pad.b}"><title>${esc(p.name)}</title></rect>
      <text class="ch-period-label" x="${x1 + 3}" y="${pad.t + 10}">${esc(p.name)}</text>`;
  }
  const best = bestResult(history, main);
  if (best) svg += `<line class="ch-best" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(best.metric)}" y2="${Y(best.metric)}"/>`;
  const mainPts = pts.filter((p) => p.variant === main);
  if (mainPts.length > 1) svg += `<polyline class="ch-strength" points="${mainPts.map((p) => `${X(p.day)},${Y(p.metric)}`).join(' ')}"/>`;
  svg += pts.map((p) => `<circle class="${p.variant === main ? 'ch-sdot' : 'ch-dot'}" cx="${X(p.day)}" cy="${Y(p.metric)}" r="${p.variant === main ? 4 : 3}">
    <title>${fmtDate(p.date)}: ${esc(fmtValue(def, p))}${def.edge ? ` (${esc(variantLabel(def, p))})` : ''}</title></circle>`).join('');
  el.innerHTML = `${svg}</svg>`;
}

export function renderTests(view) {
  let def = testById(selectedTest);
  let history = [];

  function render() {
    def = testById(selectedTest);
    history = testHistory(getState().strengthTests, def);
    view.innerHTML = `
      <section class="card">
        <label class="field"><span>Test</span>
          <select id="tsel">${TESTS.map((t) => `<option value="${t.id}" ${t.id === def.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        </label>
        <details class="how"><summary>Jak wykonać test</summary><p>${esc(def.how)}</p>
          <p class="muted">Rób test w podobnych warunkach (po dniu odpoczynku, ta sama rozgrzewka), co 4–8 tygodni.</p></details>
      </section>
      ${formHtml(def, history)}
      ${statsHtml(def, history)}
      <section class="card">
        <h2>Postęp <small class="muted">(${def.kind === 'load' ? '% masy ciała' : valueLabel(def).toLowerCase()})</small></h2>
        <div class="chart" id="tchart"></div>
        ${history.length ? `<p class="muted legend"><span class="lg-sdot"></span>wynik <span class="lg-best"></span>rekord${
          new Set(history.map((r) => r.variant)).size > 1 ? ' <span class="lg-dot"></span>inny wariant listwy/chwytu' : ''}</p>` : ''}
      </section>
      ${historyHtml(def, history)}`;
    bind();
    drawChart(view.querySelector('#tchart'), def, history);
  }

  function preview() {
    const f = view.querySelector('#tform');
    const out = view.querySelector('#tpreview');
    if (!f || def.kind !== 'load') { if (out) out.textContent = ''; return; }
    const bw = bodyWeight(f.date.value || today());
    const v = num(f.value.value);
    if (!bw) { out.textContent = 'Brak masy ciała z tego dnia – wynik zapisze się bez % MC. Dodaj pomiar w zakładce Waga.'; return; }
    if (!Number.isFinite(v)) { out.textContent = ''; return; }
    const l = loadFromAdded(bw, v);
    out.textContent = `${fmtAdded(v)} → ${kgText(l.total_kg)} kg = ${l.pct_bw}% masy ciała (masa ${kgText(bw)} kg, trend z dnia testu)`;
  }

  function bind() {
    const $ = (s) => view.querySelector(s);
    $('#tsel').addEventListener('change', (e) => { selectedTest = e.target.value; editingId = null; render(); });
    const f = $('#tform');
    f.addEventListener('input', preview);
    preview();
    $('#tcancel')?.addEventListener('click', () => { editingId = null; render(); });
    $('#tdelete')?.addEventListener('click', () => {
      if (!confirm('Usunąć ten wynik?')) return;
      update((s) => { s.strengthTests = s.strengthTests.filter((x) => x.id !== editingId); });
      editingId = null;
      toast('Usunięto wynik');
      render();
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = num(f.value.value);
      if (!Number.isFinite(value)) return toast('Wpisz wynik liczbą');
      if (def.kind !== 'load' && value <= 0) return toast('Wynik musi być większy od zera');
      if (def.kind === 'load' && (value < -100 || value > 150)) return toast('Dociążenie poza zakresem −100…150 kg');
      const date = f.date.value;
      const data = {
        test_id: def.id,
        date,
        value: Math.round(value * 10) / 10,
        // Masa „zamrożona” z dnia testu, żeby % MC w historii się nie zmieniał.
        body_weight_kg: bodyWeight(date),
        edge_mm: def.edge ? Math.round(num(f.edge_mm.value)) || def.default_edge : null,
        grip: def.edge ? f.grip.value : null,
        notes: f.notes.value.trim(),
      };
      const id = editingId || uid();
      update((s) => {
        const existing = s.strengthTests.find((x) => x.id === id);
        if (existing) Object.assign(existing, data);
        else s.strengthTests.push({ id, created: Date.now(), ...data });
      });
      const saved = testHistory(getState().strengthTests, def).find((r) => r.id === id);
      toast(editingId ? 'Zapisano zmiany'
        : saved.first ? 'Zapisano pierwszy wynik'
          : saved.pr ? `🏆 Nowy rekord: ${fmtMetric(def, saved.metric)}`
            : `Zapisano: ${fmtMetric(def, saved.metric)}`);
      editingId = null;
      render();
    });
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editingId = b.dataset.edit;
      render();
      view.querySelector('#tform').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  const onResize = () => drawChart(view.querySelector('#tchart'), def, history);
  window.addEventListener('resize', onResize);
  render();
  return () => window.removeEventListener('resize', onResize);
}

