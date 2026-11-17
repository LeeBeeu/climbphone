// Ekran „Waga” – moduł masy ciała wzorem Libry (Etap 1 w docs/specyfikacja.md).
import { getState, update, uid } from './store.js';
import { esc, toast, plural, parseDate, monthLabel, today as todayKey } from './ui.js';
import * as W from './weight-calc.js';
import { parseWeightCsv, splitDuplicates, toWeightCsv } from './weight-csv.js';
import { strengthProtocols, strengthSeries, fmtAdded } from './load-calc.js';

const RANGES = [['14', '2 tyg.'], ['90', '3 mies.'], ['365', 'Rok'], ['all', 'Całość']];
const STATUS = {
  on_pace: ['w zakresie', 'ok'],
  too_fast: ['za szybko', 'warn'],
  too_slow: ['za wolno', 'warn'],
  flat: ['stoi', 'warn'],
  wrong_way: ['w przeciwną stronę', 'bad'],
  in_goal: ['w celu', 'ok'],
};
export const DEFAULT_HINT = 'Więcej spacerów, nie mniej kalorii.';
const PAGE = 50;
const STALE_DAYS = 7;

// Stan widoku zapamiętany między przełączeniami zakładek.
let range = '90';
let panDays = 0;
let listLimit = PAGE;
let editingId = null;
let goalFormOpen = false;
let pendingImport = null;
let strengthPreset = null; // protokół na wykresie siły względnej

const kg = (v, digits = 1) => (v === null || v === undefined ? '–' : v.toFixed(digits).replace('.', ','));
const signedKg = (v, digits = 1) =>
  (v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${kg(Math.abs(v), digits)}`);
const fmtDay = (key, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parseDate(key).toLocaleDateString('pl-PL', opts);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const toInput = (date) => W.toLocalISO(date).slice(0, 16);
const num = (s) => (String(s ?? '').trim() === '' ? null : parseFloat(String(s).replace(',', '.')));
const byTime = (a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at);

export const activeGoal = (st = getState()) => [...st.weightGoals].reverse().find((g) => !g.ended_at) || null;

function computeModel() {
  const st = getState();
  const entries = st.weightEntries;
  const series = W.buildSeries(entries, st.settings);
  const goal = activeGoal(st);
  const last = series.at(-1) || null;
  const today = todayKey();
  const v = W.pace(series);
  const status = last ? W.paceStatus(v, last.trend, goal) : null;
  return {
    entries,
    series,
    goal,
    last,
    today,
    v,
    status,
    lastEntry: [...entries].sort(byTime).at(-1) || null,
    todayCount: entries.filter((e) => W.dayKey(e.measured_at) === today).length,
    paceN: last ? series.filter((p) => p.day > last.day - W.PACE_WINDOW_DAYS).length : 0,
    week: W.trendChange(series, 7),
    forecast: last ? W.forecast(series, v, goal, today) : null,
    plateau: !!goal && status !== 'in_goal' && W.isPlateau(series),
    stale: last ? W.dayNumber(today) - last.day > STALE_DAYS : false,
    ...strengthModel(st.sessions, series),
  };
}

// Siła względna (MC-52): sesje z timera z zapisanym obciążeniem, wybrany protokół.
function strengthModel(sessions, series) {
  const protocols = strengthProtocols(sessions);
  if (!protocols.some((p) => p.id === strengthPreset)) strengthPreset = protocols[0]?.id ?? null;
  return { protocols, strength: strengthPreset ? strengthSeries(sessions, strengthPreset, series) : [] };
}

// ---------- Wpis pomiaru (MC-01…MC-05) ----------

function entryHtml(m) {
  const e = editingId ? m.entries.find((x) => x.id === editingId) : null;
  const base = e ? e.weight_kg : m.lastEntry?.weight_kg;
  return `
    <section class="card entry">
      <div class="card-head">
        <h2>${e ? 'Edytuj pomiar' : 'Waga'}</h2>
        ${!e && m.todayCount ? `<span class="muted">dziś zapisano ${m.todayCount}×</span>` : ''}
      </div>
      <div class="stepper">
        <button type="button" class="btn step" data-step="-0.1" aria-label="Mniej o 0,1 kg">−</button>
        <label class="kg-input">
          <input id="kg" type="text" inputmode="decimal" autocomplete="off" aria-label="Waga w kg"
            value="${base === undefined ? '' : kg(base)}" placeholder="np. 78,5">
          <span>kg</span>
        </label>
        <button type="button" class="btn step" data-step="0.1" aria-label="Więcej o 0,1 kg">+</button>
      </div>
      <details ${e ? 'open' : ''}>
        <summary>Data i godzina, % tłuszczu, notatka</summary>
        <div class="grid2">
          <label class="field"><span>Data i godzina</span>
            <input type="datetime-local" id="when" value="${toInput(e ? new Date(e.measured_at) : new Date())}">
          </label>
          <label class="field"><span>% tkanki tłuszczowej</span>
            <input type="text" inputmode="decimal" id="fat" value="${e?.body_fat_pct == null ? '' : kg(e.body_fat_pct)}" placeholder="opcjonalnie">
          </label>
        </div>
        <label class="field"><span>Notatka</span>
          <input id="note" maxlength="200" value="${esc(e?.note)}" placeholder="np. po wyjeździe, przeziębienie">
        </label>
      </details>
      <div class="row">
        ${e ? '<button type="button" class="btn ghost danger" id="delete">Usuń</button><button type="button" class="btn ghost" id="cancel">Anuluj</button>' : ''}
        <button type="button" class="btn primary big" id="save">${e ? 'Zapisz zmiany' : 'Zapisz wagę'}</button>
      </div>
    </section>`;
}

// ---------- Kafel: trend, zmiana od tygodnia, tempo, cel (MC-32, MC-13, MC-21…MC-23) ----------

function goalTile(m) {
  if (!m.goal) return ['brak', 'ustaw cel poniżej'];
  const f = m.forecast;
  if (!f) return ['–', ''];
  if (f.status === 'in_goal') return ['w celu ✓', `${kg(m.goal.target_min_kg)}–${kg(m.goal.target_max_kg)} kg`];
  if (f.status === 'unreachable') return ['–', 'przy obecnym tempie cel nie jest osiągany'];
  if (f.status === 'stale') return ['–', 'zważ się, by odświeżyć prognozę'];
  const n = f.daysFromToday;
  return [n === 0 ? 'dziś' : `za ${n} ${plural(n, 'dzień', 'dni', 'dni')}`, fmtDay(f.date)];
}

function formulasHtml(m) {
  const s = getState().settings;
  const dec = (v) => String(v).replace('.', ',');
  const prev = m.series.at(-2);
  const f = m.forecast;
  const trend = s.weight_trend_method === 'ema'
    ? `<p><b>Trend</b> (The Hacker's Diet): T = T<sub>poprz.</sub> + α · (W − T<sub>poprz.</sub>), α = ${dec(s.weight_trend_alpha)}.
        ${prev
          ? `Ostatnio: ${kg(prev.trend, 2)} + ${dec(s.weight_trend_alpha)} · (${kg(m.last.value, 2)} − ${kg(prev.trend, 2)}) = <b>${kg(m.last.trend, 2)} kg</b>.`
          : 'Pierwszy pomiar jest trendem startowym.'}</p>
       <p><b>Wartość dnia</b>: ${s.weight_daily_mode === 'mean' ? 'średnia z pomiarów dnia' : 'pierwszy pomiar dnia'}.
        Dni bez pomiaru nie zmieniają trendu.</p>`
    : `<p><b>Trend</b> (jak w Librze): T = W + (T<sub>poprz.</sub> − W) · e<sup>−Δt / τ</sup>, τ = ${dec(s.weight_trend_tau_days)} dni,
        Δt = czas od poprzedniego pomiaru. Liczy się każdy pomiar; po dniu przerwy nowy pomiar waży ok. 13%,
        a po długiej przerwie trend szybko zbliża się do nowego pomiaru. Teraz: <b>${kg(m.last.trend, 2)} kg</b>.</p>`;
  return `
    ${trend}
    <p class="muted">Metodę trendu zmienisz w Ustawieniach.</p>
    <p><b>Tempo</b>: 7 × nachylenie prostej dopasowanej metodą najmniejszych kwadratów do trendu z ostatnich
      ${W.PACE_WINDOW_DAYS} dni (${m.paceN} ${plural(m.paceN, 'pomiar', 'pomiary', 'pomiarów')})
      = <b>${m.v === null ? 'za mało danych' : `${signedKg(m.v, 2)} kg/tydz.`}</b>
      Poniżej ±${kg(W.MIN_PACE, 2)} kg/tydz. trend uznajemy za stojący.</p>
    <p><b>Prognoza</b>: dni do celu = |trend − granica celu| / (|tempo| / 7)${f?.status === 'date'
      ? ` = |${kg(f.from.trend, 2)} − ${kg(f.target)}| / (${kg(Math.abs(m.v), 2)} / 7) = ${f.days} dni od ostatniego pomiaru → ${fmtDay(f.date)}`
      : ''}. Liczona tylko, gdy tempo prowadzi do celu i wynosi co najmniej ${kg(W.MIN_PACE, 2)} kg/tydz.</p>
    <p><b>Zastój</b>: trend zmienił się w ostatnich ${W.PLATEAU_DAYS} dniach o mniej niż ${kg(W.PLATEAU_KG)} kg.</p>`;
}

function summaryHtml(m) {
  if (!m.last) {
    return `<section class="card"><p class="muted">Dodaj pierwszy pomiar, a pojawi się trend, tempo i prognoza celu.
      Historię z Libry wczytasz na dole ekranu (Import CSV).</p></section>`;
  }
  const st = m.status && STATUS[m.status];
  const [goalBig, goalSmall] = goalTile(m);
  return `
    <section class="card">
      <div class="tiles">
        <div class="tile"><span>Trend</span><b>${kg(m.last.trend)} kg</b>
          <small>ostatni pomiar ${kg(m.lastEntry.weight_kg)} kg</small></div>
        <div class="tile"><span>Od tygodnia</span><b>${m.week === null ? '–' : `${signedKg(m.week)} kg`}</b>
          <small>zmiana trendu</small></div>
        <div class="tile"><span>Tempo</span><b>${m.v === null ? '–' : signedKg(m.v, 2)}</b>
          <small>kg/tydz. ${st ? `<span class="badge ${st[1]}">${st[0]}</span>` : ''}</small></div>
        <div class="tile"><span>Cel</span><b>${goalBig}</b><small>${goalSmall}</small></div>
      </div>
      ${m.stale ? `<div class="hint">Ostatni pomiar był ${fmtDay(m.last.date)}. Trend i tempo dotyczą tamtego dnia.</div>` : ''}
      ${m.plateau ? `<div class="hint">💡 Trend stoi od ${W.PLATEAU_DAYS} dni (zmiana poniżej ${kg(W.PLATEAU_KG)} kg). ${esc(m.goal.plateau_hint || DEFAULT_HINT)}</div>` : ''}
      <details class="info"><summary>ⓘ Jak to liczymy?</summary>${formulasHtml(m)}</details>
    </section>`;
}

// ---------- Wykres (MC-30, MC-31) ----------

const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];

function chartWindow(m) {
  const today = W.dayNumber(m.today);
  if (range === 'all') {
    const fEnd = m.forecast?.status === 'date' ? Math.min(W.dayNumber(m.forecast.date), today + 365) : today;
    const end = Math.max(today, fEnd);
    const start = Math.min(m.series[0]?.day ?? end - 14, end - 14);
    return { start, end };
  }
  const end = today - panDays;
  return { start: end - Number(range), end };
}

function xTicks(start, end, maxTicks) {
  const span = end - start;
  if (span <= 120) {
    const step = [1, 2, 3, 7, 14, 21, 28].find((s) => span / s <= maxTicks) || 28;
    const ticks = [];
    for (let d = Math.ceil(start / step) * step; d <= end; d += step) ticks.push(d);
    return ticks.map((d) => [d, fmtDay(W.keyFromDayNumber(d), { day: 'numeric', month: 'short' })]);
  }
  const every = [1, 2, 3, 6, 12, 24, 36].find((k) => span / (30.4 * k) <= maxTicks) || 36;
  const ticks = [];
  const s = parseDate(W.keyFromDayNumber(start));
  const cur = new Date(s.getFullYear(), s.getMonth() + 1, 1);
  while (W.dayNumber(W.dayKey(cur)) <= end) {
    const month = cur.getMonth();
    const show = every >= 12 ? month === 0 && cur.getFullYear() % (every / 12) === 0 : month % every === 0;
    if (show) {
      const label = every >= 12 ? String(cur.getFullYear())
        : cur.toLocaleDateString('pl-PL', span > 400 ? { month: 'short', year: '2-digit' } : { month: 'short' });
      ticks.push([W.dayNumber(W.dayKey(cur)), label]);
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return ticks;
}

function drawChart(el, m) {
  const width = Math.max(260, el.clientWidth);
  const height = 230;
  const pad = { l: 38, r: 10, t: 12, b: 24 };
  if (!m.series.length) {
    el.innerHTML = '<div class="empty">Brak pomiarów do pokazania.</div>';
    return;
  }

  const { start, end } = chartWindow(m);
  // Ładujemy tylko widoczne dane (MC-31) plus po jednym punkcie za krawędziami, żeby linia trendu była ciągła.
  let first = m.series.findIndex((p) => p.day >= start);
  if (first === -1) first = m.series.length;
  let after = m.series.findIndex((p) => p.day > end);
  after = after === -1 ? m.series.length : after + 1;
  const trendPts = m.series.slice(Math.max(0, first - 1), after);
  const dots = trendPts.filter((p) => p.day >= start && p.day <= end);
  const f = m.forecast?.status === 'date' ? m.forecast : null;

  const ys = [...dots.map((p) => p.value), ...trendPts.map((p) => p.trend)];
  if (m.goal) ys.push(m.goal.target_min_kg, m.goal.target_max_kg);
  if (!ys.length) ys.push(m.last.trend);
  let lo = Math.min(...ys) - 0.3;
  let hi = Math.max(...ys) + 0.3;
  const step = NICE.find((s) => (hi - lo) / s <= 5) || 20;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const X = (d) => pad.l + ((d - start) / (end - start)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const today = W.dayNumber(m.today);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"
    aria-label="Wykres wagi i trendu"><defs><clipPath id="plot"><rect x="${pad.l}" y="0" width="${width - pad.l - pad.r}" height="${height}"/></clipPath></defs>`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg += `<line class="ch-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>
      <text class="ch-label" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${kg(v, step < 1 ? 1 : 0)}</text>`;
  }
  for (const [d, label] of xTicks(start, end, Math.max(2, Math.floor((width - pad.l - pad.r) / 62)))) {
    svg += `<text class="ch-label" x="${X(d)}" y="${height - 6}" text-anchor="middle">${label}</text>`;
  }
  svg += '<g clip-path="url(#plot)">';
  if (m.goal) {
    svg += `<rect class="ch-goal" x="${pad.l}" width="${width - pad.l - pad.r}"
      y="${Y(m.goal.target_max_kg)}" height="${Y(m.goal.target_min_kg) - Y(m.goal.target_max_kg)}"/>`;
  }
  if (today >= start && today <= end) {
    svg += `<line class="ch-today" x1="${X(today)}" x2="${X(today)}" y1="${pad.t}" y2="${height - pad.b}"/>`;
  }
  svg += dots.map((p) => `<circle class="ch-dot" cx="${X(p.day)}" cy="${Y(p.value)}" r="2.6"/>`).join('');
  svg += `<polyline class="ch-trend" points="${trendPts.map((p) => `${X(p.day)},${Y(p.trend)}`).join(' ')}"/>`;
  if (f) {
    svg += `<line class="ch-forecast" x1="${X(f.from.day)}" y1="${Y(f.from.trend)}"
      x2="${X(W.dayNumber(f.date))}" y2="${Y(f.target)}"/>`;
  }
  svg += '</g></svg>';
  el.innerHTML = svg;
}

// Wykres siły względnej (MC-52): ta sama oś czasu co wykres wagi, żeby oba czytać razem.
const PCT_STEPS = [1, 2, 5, 10, 20, 25, 50];

function drawStrength(el, m) {
  if (!el) return;
  const width = Math.max(260, el.clientWidth);
  const height = 150;
  const pad = { l: 38, r: 10, t: 10, b: 24 };
  const { start, end } = chartWindow(m);
  const pts = m.strength;
  const inside = pts.filter((p) => p.day >= start && p.day <= end);
  // Linia łączy też punkty tuż za krawędziami, żeby nie urywała się na brzegu wykresu.
  const first = pts.findIndex((p) => p.day >= start);
  const lastIn = pts.findLastIndex((p) => p.day <= end);
  const linePts = pts.slice(Math.max(0, (first === -1 ? pts.length : first) - 1), lastIn + 2);

  const ys = (inside.length ? inside : linePts).map((p) => p.pct_bw);
  if (!ys.length) ys.push(100);
  let lo = Math.min(...ys) - 2;
  let hi = Math.max(...ys) + 2;
  const step = PCT_STEPS.find((s) => (hi - lo) / s <= 4) || 50;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const X = (d) => pad.l + ((d - start) / (end - start)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const today = W.dayNumber(m.today);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"
    aria-label="Wykres siły względnej w procentach masy ciała"><defs><clipPath id="plotS"><rect x="${pad.l}" y="0" width="${width - pad.l - pad.r}" height="${height}"/></clipPath></defs>`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg += `<line class="ch-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>
      <text class="ch-label" x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`;
  }
  for (const [d, label] of xTicks(start, end, Math.max(2, Math.floor((width - pad.l - pad.r) / 62)))) {
    svg += `<text class="ch-label" x="${X(d)}" y="${height - 6}" text-anchor="middle">${label}</text>`;
  }
  svg += '<g clip-path="url(#plotS)">';
  if (100 >= lo && 100 <= hi) {
    svg += `<line class="ch-bw" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(100)}" y2="${Y(100)}"/>`;
  }
  if (today >= start && today <= end) {
    svg += `<line class="ch-today" x1="${X(today)}" x2="${X(today)}" y1="${pad.t}" y2="${height - pad.b}"/>`;
  }
  if (linePts.length > 1) {
    svg += `<polyline class="ch-strength" points="${linePts.map((p) => `${X(p.day)},${Y(p.pct_bw)}`).join(' ')}"/>`;
  }
  svg += inside.map((p) => `<circle class="ch-sdot" cx="${X(p.day)}" cy="${Y(p.pct_bw)}" r="3.5">
    <title>${fmtDay(p.date)}: ${Math.round(p.pct_bw)}% MC · ${fmtAdded(p.added_kg)} przy ${kg(p.body_weight_kg)} kg${p.reps ? ` · ${p.reps} powt.` : ''}</title></circle>`).join('');
  svg += '</g>';
  if (!inside.length) {
    svg += `<text class="ch-label" x="${(pad.l + width - pad.r) / 2}" y="${height / 2}" text-anchor="middle">Brak treningów w tym zakresie</text>`;
  }
  el.innerHTML = `${svg}</svg>`;
}

function strengthHtml(m) {
  if (!m.protocols.length) {
    return `<h3 class="sub-title">Siła względna</h3>
      <p class="muted">Zapisz trening z timera z obciążeniem albo ćwiczenie z masą ciała w dzienniku (np. podciąganie), a tutaj zobaczysz obciążenie w % masy ciała obok trendu wagi.</p>`;
  }
  const last = m.strength.at(-1);
  const best = m.strength.reduce((b, p) => (!b || p.pct_bw > b.pct_bw ? p : b), null);
  const pct = (v) => `${Math.round(v)}%`;
  return `
    <div class="card-head"><h3 class="sub-title">Siła względna <small class="muted">(% masy ciała)</small></h3>
      <select id="sPreset" aria-label="Protokół albo ćwiczenie">
        ${m.protocols.map((p) => `<option value="${esc(p.id)}" ${p.id === strengthPreset ? 'selected' : ''}>${esc(p.name)} (${p.count})</option>`).join('')}
      </select>
    </div>
    <div class="chart" id="schart"></div>
    ${last ? `<p class="muted">Ostatnio ${fmtDay(last.date)}: <strong>${pct(last.pct_bw)}</strong> (${fmtAdded(last.added_kg)} przy ${kg(last.body_weight_kg)} kg)
      · najlepiej ${pct(best.pct_bw)} (${fmtDay(best.date)})</p>` : ''}
    <p class="muted legend"><span class="lg-sdot"></span>trening (najwyższy % dnia) <span class="lg-bw"></span>100% = sama masa ciała</p>`;
}

// Przewijanie wykresu w poziomie palcem lub myszą (MC-30). `redraw` rysuje oba wykresy.
function bindPan(el, redraw) {
  let x0 = null;
  let pan0 = 0;
  let frame = 0;
  el.addEventListener('pointerdown', (e) => {
    if (range === 'all') return;
    x0 = e.clientX;
    pan0 = panDays;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const pxPerDay = (el.clientWidth - 48) / Number(range);
    panDays = Math.round(pan0 + (e.clientX - x0) / pxPerDay);
    panDays = Math.max(-Number(range), panDays);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(redraw);
  });
  const stop = () => { x0 = null; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

// ---------- Cel (MC-20) ----------

function goalHtml(m) {
  const g = m.goal;
  if (goalFormOpen) {
    return `
      <form class="card" id="goalForm">
        <h2>${g ? 'Zmień cel' : 'Ustaw cel'}</h2>
        <div class="grid2">
          <label class="field"><span>Masa od (kg)</span><input name="min" inputmode="decimal" value="${g ? kg(g.target_min_kg) : ''}" placeholder="np. 74" required></label>
          <label class="field"><span>Masa do (kg)</span><input name="max" inputmode="decimal" value="${g ? kg(g.target_max_kg) : ''}" placeholder="np. 76" required></label>
          <label class="field"><span>Tempo od (kg/tydz.)</span><input name="pmin" inputmode="decimal" value="${g ? kg(g.pace_min_kg_week) : '-0,3'}" required></label>
          <label class="field"><span>Tempo do (kg/tydz.)</span><input name="pmax" inputmode="decimal" value="${g ? kg(g.pace_max_kg_week) : '-0,5'}" required></label>
        </div>
        <label class="field"><span>Podpowiedź przy zastoju (14 dni bez zmian)</span>
          <textarea name="hint" rows="2">${esc(g?.plateau_hint ?? DEFAULT_HINT)}</textarea>
        </label>
        <p class="muted">Tempo ujemne = chudnięcie. Zmiana celu zapisuje poprzedni w historii.</p>
        <div class="row">
          ${g ? '<button type="button" class="btn ghost danger" id="endGoal">Zakończ cel</button>' : ''}
          <button type="button" class="btn ghost" id="cancelGoal">Anuluj</button>
          <button class="btn primary">Zapisz cel</button>
        </div>
      </form>`;
  }
  return `
    <section class="card">
      <div class="card-head"><h2>Cel</h2><button class="btn ghost small" id="editGoal">${g ? 'Zmień' : 'Ustaw cel'}</button></div>
      ${g
        ? `<p>Przedział <b>${kg(g.target_min_kg)}–${kg(g.target_max_kg)} kg</b>, tempo
             <b>${signedKg(g.pace_min_kg_week)} do ${signedKg(g.pace_max_kg_week)} kg/tydz.</b></p>
           <p class="muted">Podpowiedź przy zastoju: „${esc(g.plateau_hint || DEFAULT_HINT)}” · od ${fmtDay(g.start_date)}</p>`
        : '<p class="muted">Ustaw przedział masy i docelowe tempo, a aplikacja oceni tempo i policzy, kiedy dojdziesz do celu.</p>'}
    </section>`;
}

// ---------- Lista wpisów (MC-35) ----------

function listHtml(m) {
  if (!m.entries.length) return '';
  const trendByDay = new Map(m.series.map((p) => [p.date, p.trend]));
  const monthChange = (month) => {
    const inMonth = m.series.filter((p) => p.date.startsWith(month));
    const before = m.series.filter((p) => p.date < `${month}-01`).at(-1) || inMonth[0];
    return inMonth.length ? inMonth.at(-1).trend - before.trend : null;
  };
  const sorted = [...m.entries].sort((a, b) => byTime(b, a));
  let html = '<section class="card"><h2>Pomiary</h2>';
  let month = '';
  for (const e of sorted.slice(0, listLimit)) {
    const day = W.dayKey(e.measured_at);
    if (day.slice(0, 7) !== month) {
      if (month) html += '</ul>';
      month = day.slice(0, 7);
      const change = monthChange(month);
      html += `<h3 class="group-title">${monthLabel(day)}${change === null ? '' : ` · ${signedKg(change)} kg`}</h3><ul class="list w-list">`;
    }
    html += `
      <li class="w-row">
        <div class="w-date">${fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}<small>${fmtTime(e.measured_at)}</small></div>
        <div class="w-val"><b>${kg(e.weight_kg)}</b><small>trend ${kg(trendByDay.get(day))}</small></div>
        <div class="w-extra">${e.body_fat_pct == null ? '' : `<span class="tag">${kg(e.body_fat_pct)} % tł.</span> `}${esc(e.note)}</div>
        <button class="icon" data-edit="${e.id}" aria-label="Edytuj pomiar">✏️</button>
      </li>`;
  }
  html += '</ul>';
  if (sorted.length > listLimit) html += `<button class="btn ghost" id="more">Pokaż więcej (${sorted.length - listLimit})</button>`;
  return `${html}</section>`;
}

// ---------- Import i eksport CSV (MC-60, MC-61) ----------

function dataHtml() {
  const p = pendingImport;
  const preview = p ? `
    <div class="preview">
      <b>${esc(p.fileName)}</b>
      <p>Pomiarów w pliku: ${p.rows.length} · nowych: <b>${p.fresh.length}</b> · duplikatów: ${p.duplicates} · błędów: ${p.errors.length}</p>
      ${p.rows.length ? `<p class="muted">Zakres: ${fmtDay(W.dayKey(p.first))} – ${fmtDay(W.dayKey(p.lastAt))} · jednostka w pliku: ${p.unit}</p>` : ''}
      ${p.errors.length ? `<p class="muted">Pominięte wiersze: ${p.errors.slice(0, 5).map((e) => `${e.line} (${esc(e.message)})`).join(', ')}${p.errors.length > 5 ? '…' : ''}</p>` : ''}
      ${p.fresh.length ? `<ul class="list mini">${p.fresh.slice(0, 5).map((r) =>
        `<li>${fmtDay(W.dayKey(r.measured_at))} ${fmtTime(r.measured_at)} · <b>${kg(r.weight_kg)} kg</b>${r.note ? ` · ${esc(r.note)}` : ''}</li>`).join('')}
        ${p.fresh.length > 5 ? `<li class="muted">… i ${p.fresh.length - 5} więcej</li>` : ''}</ul>` : ''}
      <div class="row">
        <button class="btn ghost" id="cancelImport">Anuluj</button>
        <button class="btn primary" id="confirmImport" ${p.fresh.length ? '' : 'disabled'}>Importuj ${p.fresh.length}</button>
      </div>
    </div>` : '';
  return `
    <section class="card">
      <h2>Import i eksport</h2>
      <p class="muted">Import historii z pliku CSV wyeksportowanego z Libry albo z ClimbPhone. Przed zapisem zobaczysz podgląd, a duplikaty zostaną pominięte.</p>
      ${preview}
      <div class="row">
        <button class="btn" id="importCsv">⬆️ Import CSV</button>
        <button class="btn" id="exportCsv">⬇️ Eksport CSV</button>
      </div>
      <input type="file" id="csvFile" accept=".csv,text/csv,text/plain" hidden>
    </section>`;
}

// ---------- Widok ----------

export function renderWeight(view) {
  let model = null;

  function render() {
    model = computeModel();
    view.innerHTML = `
      ${entryHtml(model)}
      ${summaryHtml(model)}
      <section class="card">
        <div class="card-head"><h2>Wykres</h2><button class="btn ghost small" id="today">Dziś</button></div>
        <div class="seg" id="range">
          ${RANGES.map(([k, label]) => `<button data-r="${k}" class="${range === k ? 'active' : ''}">${label}</button>`).join('')}
        </div>
        <div class="chart" id="chart"></div>
        <p class="muted legend"><span class="lg-dot"></span>pomiar <span class="lg-trend"></span>trend
          ${model.goal ? '<span class="lg-goal"></span>cel <span class="lg-fc"></span>prognoza' : ''}</p>
        ${strengthHtml(model)}
      </section>
      ${goalHtml(model)}
      ${listHtml(model)}
      ${dataHtml()}`;
    bind();
    drawAll();
    bindPan(view.querySelector('#chart'), drawAll);
    const schart = view.querySelector('#schart');
    if (schart) bindPan(schart, drawAll);
  }

  function drawAll() {
    if (!model) return;
    drawChart(view.querySelector('#chart'), model);
    drawStrength(view.querySelector('#schart'), model);
  }

  function bind() {
    const $ = (sel) => view.querySelector(sel);
    let whenTouched = false;
    $('#when').addEventListener('input', () => { whenTouched = true; });

    view.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const current = num($('#kg').value) ?? model.last?.trend ?? 70;
      $('#kg').value = kg(Math.round((current + Number(b.dataset.step)) * 10) / 10);
    }));

    $('#save').addEventListener('click', () => {
      const editing = editingId ? model.entries.find((x) => x.id === editingId) : null;
      const value = num($('#kg').value);
      const check = W.validateWeight(value, editing ? null : model.last?.trend);
      if (check.error) return toast(check.error);
      if (check.warning && !confirm(`To ${kg(check.warning)} kg różnicy wobec trendu (${kg(model.last.trend)} kg). Na pewno?`)) return;
      const when = editing || whenTouched ? new Date($('#when').value) : new Date();
      if (Number.isNaN(when.getTime())) return toast('Nieprawidłowa data');
      const fat = num($('#fat').value);
      if (fat !== null && !(fat > 0 && fat < 80)) return toast('% tkanki tłuszczowej poza zakresem');
      const now = W.toLocalISO(new Date());
      const data = {
        measured_at: W.toLocalISO(when),
        weight_kg: Math.round(value * 100) / 100,
        body_fat_pct: fat,
        note: $('#note').value.trim(),
        updated_at: now,
      };
      update((s) => {
        const target = s.weightEntries.find((x) => x.id === editingId);
        if (target) Object.assign(target, data);
        else s.weightEntries.push({ id: uid(), ...data, source: 'manual', created_at: now });
      });
      toast(editing ? 'Zapisano zmiany' : `Zapisano ${kg(value)} kg`);
      editingId = null;
      render();
    });
    $('#cancel')?.addEventListener('click', () => { editingId = null; render(); });
    $('#delete')?.addEventListener('click', () => {
      if (!confirm('Usunąć ten pomiar?')) return;
      update((s) => { s.weightEntries = s.weightEntries.filter((x) => x.id !== editingId); });
      editingId = null;
      toast('Usunięto pomiar');
      render();
    });

    view.querySelectorAll('#range button').forEach((b) => b.addEventListener('click', () => {
      range = b.dataset.r;
      panDays = 0;
      render();
    }));
    $('#today').addEventListener('click', () => {
      panDays = 0;
      drawAll();
    });
    $('#sPreset')?.addEventListener('change', (e) => {
      strengthPreset = e.target.value;
      render();
    });

    $('#editGoal')?.addEventListener('click', () => { goalFormOpen = true; render(); });
    $('#cancelGoal')?.addEventListener('click', () => { goalFormOpen = false; render(); });
    $('#endGoal')?.addEventListener('click', () => {
      if (!confirm('Zakończyć obecny cel? Zostanie w historii.')) return;
      update((s) => { const g = activeGoal(s); if (g) g.ended_at = todayKey(); });
      goalFormOpen = false;
      render();
    });
    $('#goalForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const goal = {
        target_min_kg: num(f.get('min')),
        target_max_kg: num(f.get('max')),
        pace_min_kg_week: num(f.get('pmin')),
        pace_max_kg_week: num(f.get('pmax')),
        plateau_hint: String(f.get('hint')).trim() || DEFAULT_HINT,
      };
      if (Object.values(goal).some((v) => v === null || Number.isNaN(v))) return toast('Uzupełnij wszystkie pola liczbami');
      if (goal.target_min_kg >= goal.target_max_kg) return toast('„Masa od” musi być mniejsza niż „Masa do”');
      if (goal.target_min_kg < W.WEIGHT_MIN || goal.target_max_kg > W.WEIGHT_MAX) return toast('Cel poza zakresem 30–200 kg');
      if (goal.pace_min_kg_week === 0 && goal.pace_max_kg_week === 0) return toast('Tempo nie może być zerowe');
      update((s) => {
        const prev = activeGoal(s);
        if (prev) prev.ended_at = todayKey();
        s.weightGoals.push({ id: uid(), ...goal, start_date: todayKey(), ended_at: null });
      });
      goalFormOpen = false;
      toast('Zapisano cel');
      render();
    });

    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editingId = b.dataset.edit;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    $('#more')?.addEventListener('click', () => { listLimit += PAGE; render(); });

    const file = $('#csvFile');
    $('#importCsv').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const { rows, errors, unit } = parseWeightCsv(await f.text());
      const { fresh, duplicates } = splitDuplicates(getState().weightEntries, rows);
      const times = rows.map((r) => r.measured_at).sort((a, b) => Date.parse(a) - Date.parse(b));
      pendingImport = { fileName: f.name, rows, errors, unit, fresh, duplicates, first: times[0], lastAt: times.at(-1) };
      render();
      view.querySelector('.preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#cancelImport')?.addEventListener('click', () => { pendingImport = null; render(); });
    $('#confirmImport')?.addEventListener('click', () => {
      const now = W.toLocalISO(new Date());
      const count = pendingImport.fresh.length;
      update((s) => {
        for (const r of pendingImport.fresh) {
          s.weightEntries.push({ id: uid(), ...r, source: 'import', created_at: now, updated_at: now });
        }
      });
      pendingImport = null;
      toast(`Zaimportowano ${count} ${plural(count, 'pomiar', 'pomiary', 'pomiarów')}`);
      render();
    });
    $('#exportCsv').addEventListener('click', () => {
      const entries = getState().weightEntries;
      if (!entries.length) return toast('Brak pomiarów do eksportu');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([toWeightCsv(entries)], { type: 'text/csv' }));
      a.download = `waga-${todayKey()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  const onResize = () => drawAll();
  window.addEventListener('resize', onResize);
  render();
  return () => window.removeEventListener('resize', onResize);
}
