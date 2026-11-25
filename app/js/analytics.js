// Ekran „Analityka” (Etap 3): porównanie okresów, przejścia, regularność, obciążenie, siła, check-iny.
// Obliczenia: analytics-calc.js (wzory opisane w nagłówku tamtego pliku i na ekranie).
import { getState } from './store.js';
import { esc, today, fmtMinutes, fmtDate } from './ui.js';
import {
  PERIODS, periods, sessionStats, ascentStats, weeklySeries, streak, acwr, ACWR_LABELS, pctChange,
  formStats, projectGrade, FORM_DAYS, FORM_MIN_SENDS,
} from './analytics-calc.js';
import { weekKeyOf, weekNumber, weekRange } from './plan-calc.js';
import { strengthProtocols, strengthSeries } from './load-calc.js';
import { testStrengthEntries } from './tests-calc.js';
import { buildSeries } from './weight-calc.js';
import { performedSessions } from './exercises.js';
import { ACTIONS, suggestion } from './checkin-calc.js';
import { plansPct } from './checkin.js';
import { styleLabel } from './grades.js';

let periodId = '28';

const num = (x) => String(x).replace('.', ',');

function delta(cur, prev, unit = '%') {
  const d = pctChange(cur, prev);
  if (d === null) return prev === 0 && cur > 0 ? '<span class="up">nowość</span>' : '<span class="muted">–</span>';
  if (d === 0) return '<span class="muted">bez zmian</span>';
  return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)}${unit}</span>`;
}

const tile = (value, label, cmp) => `<div class="stat"><b>${value}</b><span>${label}</span><small>${cmp}</small></div>`;

// Okresy z zakładki Waga, które zachodzą na tydzień (do tła słupków).
function weekPeriods(periods, week) {
  const { start, end } = weekRange(week);
  return periods.filter((p) => p.start <= end && (p.end || today()) >= start);
}

// Słupki tygodniowe (CSS): wartości, podpis co drugi tydzień, tło dla tygodni w okresie (MC-41).
function barsHtml(series, value, title, fmt = (v) => v, periods = []) {
  const max = Math.max(1, ...series.map(value));
  return `<div class="bars" role="img" aria-label="${esc(title)}">
    ${series.map((w, i) => {
      const ps = weekPeriods(periods, w.week);
      return `<div class="bar ${ps.length ? 'in-period' : ''}" title="T${weekNumber(w.week)}: ${fmt(value(w))}${ps.length ? ` · ${esc(ps.map((p) => p.name).join(', '))}` : ''}">
      <span style="height:${Math.round((value(w) / max) * 100)}%"></span>
      <small>${i % 2 === series.length % 2 ? `T${weekNumber(w.week)}` : ''}</small></div>`;
    }).join('')}
  </div>`;
}

// Legenda okresów widocznych w 12 tygodniach.
function periodsLegend(periods, weeks) {
  const names = [...new Set(weeks.flatMap((w) => weekPeriods(periods, w.week).map((p) => p.name)))];
  return names.length ? `<p class="muted legend"><span class="lg-period"></span>okres: ${esc(names.join(', '))}</p>` : '';
}

function ascentLine(cur, prev, label, kind) {
  if (!cur.count && !prev.count) return '';
  const best = cur.best ? `${esc(cur.best.grade)} ${esc(styleLabel(kind, cur.best.style))}` : '–';
  return `<li><strong>${label}:</strong> ${cur.count} ${delta(cur.count, prev.count)} · najtrudniejsze ${best}
    · top 10 średnio <strong>${cur.top10 ? esc(cur.top10) : '–'}</strong>${prev.top10 ? ` <small class="muted">(wcześniej ${esc(prev.top10)})</small>` : ''}</li>`;
}

function strengthRows(st) {
  const extra = testStrengthEntries(st.strengthTests);
  const ws = buildSeries(st.weightEntries, st.settings);
  return strengthProtocols(st.sessions, extra).map((p) => {
    const s = strengthSeries(st.sessions, p.id, ws, extra);
    if (!s.length) return '';
    const last = s.at(-1);
    const best = s.reduce((b, x) => (x.pct_bw > b.pct_bw ? x : b));
    // Zmiana wobec wyniku sprzed ok. 8 tygodni (ostatni punkt nie później niż 56 dni przed ostatnim).
    const ref = [...s].reverse().find((x) => x.day <= last.day - 56);
    const ch = ref ? Math.round(last.pct_bw - ref.pct_bw) : null;
    return `<tr><td>${esc(p.name)}</td><td>${Math.round(last.pct_bw)}%<br><small class="muted">${fmtDate(last.date)}</small></td>
      <td>${Math.round(best.pct_bw)}%</td>
      <td>${ch === null ? '<span class="muted">–</span>' : `<span class="${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch > 0 ? '+' : ch < 0 ? '−' : '±'}${Math.abs(ch)} pp.</span>`}</td></tr>`;
  }).join('');
}

// Forma (top 10 z 90 dni wobec 12 miesięcy wcześniej) i Project grade (1–2 stopnie nad najlepszym RP z 12 mies.).
function formHtml(st) {
  const kinds = [['route', 'Drogi'], ['boulder', 'Bouldery']].filter(([k]) => st.ascents.some((a) => a.kind === k));
  if (!kinds.length) return '';
  const TREND = { up: ['↑ rośnie', 'up'], down: ['↓ spada', 'down'], flat: ['→ stabilna', ''] };
  const rows = kinds.map(([k, label]) => {
    const f = formStats(st.ascents, k, today());
    const p = projectGrade(st.ascents, k, today());
    const form = f.enough
      ? `Forma: <strong>${esc(f.form)}</strong>${f.base ? ` <small class="muted">(wcześniej ${esc(f.base)})</small>` : ''}${
        f.trend ? ` <span class="${TREND[f.trend][1]}">${TREND[f.trend][0]}</span>` : ''}`
      : `Forma: <span class="muted">za mało przejść w 90 dniach (${f.count} z ${FORM_MIN_SENDS})</span>`;
    const proj = p.grade
      ? `Project grade: <strong>${esc(p.grade)}–${esc(p.upTo)}</strong> <small class="muted">(najlepsze RP z 12 mies.: ${esc(p.best)})</small>`
      : 'Project grade: <span class="muted">brak przejść RP w 12 mies.</span>';
    const open = p.projects.length
      ? `<br><small>Otwarte projekty: ${p.projects.slice(0, 5).map((x) => `${esc(x.name)} ${esc(x.grade)}`).join(', ')}${p.projects.length > 5 ? '…' : ''}</small>` : '';
    return `<li><strong>${label}</strong><br>${form}<br>${proj}${open}</li>`;
  }).join('');
  return `
    <section class="card">
      <h2>Forma i projekty</h2>
      <ul class="plain">${rows}</ul>
      <details class="how"><summary>Jak to liczymy?</summary>
        <p>Forma = średnia wycena 10 najtrudniejszych przejść (OS, flash, RP, wędka) z ostatnich ${FORM_DAYS} dni.
          „Wcześniej” = to samo z 12 miesięcy przed tym okresem. Różnica co najmniej pół stopnia to „rośnie” albo „spada”.</p>
        <p>Project grade = jeden–dwa stopnie powyżej najtrudniejszego przejścia RP z ostatnich 12 miesięcy – dobry zakres na projekt.
          Otwarte projekty = próby (styl „próba”) bez późniejszego przejścia tej samej drogi.</p>
      </details>
    </section>`;
}

export function renderAnalytics(view) {
  function render() {
    const st = getState();
    const period = PERIODS.find((p) => p.id === periodId);
    const { cur, prev } = periods(today(), period.days);
    const sc = sessionStats(performedSessions(st.sessions, today()), cur);
    const sp = sessionStats(performedSessions(st.sessions, today()), prev);
    const routes = [ascentStats(st.ascents, cur, 'route'), ascentStats(st.ascents, prev, 'route')];
    const boulders = [ascentStats(st.ascents, cur, 'boulder'), ascentStats(st.ascents, prev, 'boulder')];
    const weeks = weeklySeries(performedSessions(st.sessions, today()), weekKeyOf(today()), 12);
    const run = streak(weeks);
    const ratio = acwr(weeks);
    const full = weeks.slice(0, -1);
    const avgPerWeek = num(Math.round((full.reduce((t, w) => t + w.count, 0) / full.length) * 10) / 10);
    const rows = strengthRows(st);
    const checkins = [...st.checkins].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8);

    view.innerHTML = `
      <div class="seg" id="period">
        ${PERIODS.map((p) => `<button data-p="${p.id}" class="${p.id === periodId ? 'active' : ''}">${p.label}</button>`).join('')}
      </div>
      <p class="muted">Ostatnie ${period.label} (${fmtDate(cur.start)} – ${fmtDate(cur.end)}) w porównaniu z poprzednim okresem tej samej długości.</p>
      <div class="stats stats-cmp">
        ${tile(sc.count, 'treningi', delta(sc.count, sp.count))}
        ${tile(fmtMinutes(sc.minutes), 'czas', delta(sc.minutes, sp.minutes))}
        ${tile(sc.load || '–', 'obciążenie (sRPE)', delta(sc.load, sp.load))}
      </div>

      <section class="card">
        <h2>Przejścia</h2>
        ${routes[0].count || routes[1].count || boulders[0].count || boulders[1].count
          ? `<ul class="plain">${ascentLine(...routes, 'Drogi', 'route')}${ascentLine(...boulders, 'Bouldery', 'boulder')}</ul>
             <p class="muted">Liczą się przejścia OS, Flash, RP i wędka (bez prób). „Top 10” to średnia wycena 10 najtrudniejszych przejść w okresie.</p>`
          : '<p class="muted">Brak przejść w tym ani w poprzednim okresie.</p>'}
      </section>

      ${formHtml(st)}

      <section class="card">
        <div class="card-head"><h2>Regularność</h2><span class="muted">12 tygodni</span></div>
        ${barsHtml(weeks, (w) => w.count, 'Treningi w tygodniu', (v) => `${v} tr.`, st.weightPeriods)}
        ${periodsLegend(st.weightPeriods, weeks)}
        <p class="muted">Seria: <strong>${run}</strong> ${run === 1 ? 'tydzień' : 'tygodni'} z rzędu z treningiem · średnio ${avgPerWeek} treningu na tydzień.</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Obciążenie treningowe</h2><span class="muted">12 tygodni</span></div>
        ${barsHtml(weeks, (w) => w.load, 'Obciążenie sRPE w tygodniu', undefined, st.weightPeriods)}
        ${ratio ? `<p>Ostatni tydzień wobec średniej z 4: <strong>${num(ratio.ratio)}</strong>
          <span class="badge ${ratio.zone === 'ok' ? 'ok' : ratio.zone === 'high' ? 'bad' : 'warn'}">${ACWR_LABELS[ratio.zone]}</span></p>`
          : '<p class="muted">Za mało danych z RPE, żeby porównać tygodnie.</p>'}
        <details class="how"><summary>Jak to liczymy?</summary>
          <p>Obciążenie sesji = czas w minutach × intensywność RPE (1–10) z dziennika, np. 90 min × RPE 7 = 630.
            Sesje bez RPE pomijamy (w tym okresie RPE ma ${sc.rpeCount} z ${sc.count}).</p>
          <p>Porównanie = obciążenie ostatniego pełnego tygodnia / średnia z 4 pełnych tygodni.
            Poniżej 0,8 – spadek, 0,8–1,3 – bezpiecznie, powyżej 1,5 – duży skok i większe ryzyko przeciążenia.</p>
        </details>
      </section>

      <section class="card">
        <h2>Siła według ćwiczenia</h2>
        ${rows ? `<table class="tbl"><thead><tr><th>Protokół / ćwiczenie</th><th>Ostatnio</th><th>Rekord</th><th>8 tyg.</th></tr></thead>
          <tbody>${rows}</tbody></table>
          <p class="muted">% masy ciała z najcięższej serii dnia; „8 tyg.” to zmiana wobec wyniku sprzed ok. 8 tygodni.</p>`
          : '<p class="muted">Brak danych: zapisz trening z timera z obciążeniem, ćwiczenie z masą ciała albo test siły.</p>'}
      </section>

      <section class="card">
        <h2>Check-iny</h2>
        ${checkins.length ? `<ul class="plain">${checkins.map((c) => {
          const s = suggestion(c, plansPct(st, c.week));
          return `<li>T${weekNumber(c.week)}: ciężkość ${c.load} · samopoczucie ${c.wellbeing} · motywacja ${c.motivation}
            <span class="badge ${ACTIONS[s.action].css}">${ACTIONS[s.action].label}</span></li>`;
        }).join('')}</ul>` : '<p class="muted">Brak check-inów. Zrób pierwszy w zakładce Plany na koniec tygodnia.</p>'}
      </section>`;

    view.querySelectorAll('#period button').forEach((b) => b.addEventListener('click', () => { periodId = b.dataset.p; render(); }));
  }
  render();
}
