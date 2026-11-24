// Plan z tekstu (np. przygotowany w czacie z Claude) → plan w aplikacji. Czyste funkcje, bez DOM
// (testy: tests/plan-import.test.mjs).
//
// Format (wielkość liter bez znaczenia, puste linie pomijane):
//   PLAN: Nazwa planu
//   OPIS:                      ← kolejne linie aż do następnego słowa kluczowego trafiają do opisu
//   START: 2026-11-23          ← dzień w tygodniu 1 (opcjonalnie; inaczej wybierasz przy wklejaniu)
//   SZABLON                    ← tydzień wzorcowy, obowiązuje we wszystkie tygodnie bez własnego planu
//   ## Pon – A: palce          ← dzień (sesja); „#”, „##” albo „###”
//   - pozycja                  ← pozycja do odhaczenia („-”, „*”, „•” albo „1.”)
//   PULA                       ← pula tygodnia (w dowolny dzień), pozycje jak wyżej, np. „- 2× Bouldering”
//   TYDZIEŃ 5 | Deload | Święta – ~50% objętości     ← tydzień albo zakres „2-4”; dalej faza i notatka (opcjonalne)
//   ## …  /  - …  /  PULA      ← własny plan tego tygodnia (bez dni – tylko faza i notatka, plan z szablonu)
import { PHASES, weekKeyOf, shiftWeek } from './plan-calc.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();

// Faza po nazwie polskiej albo id („Siła”, „sila”, „strength”); nieznana → null.
export function phaseFrom(text) {
  const f = fold(text);
  if (!f) return null;
  const p = PHASES.find((x) => x.id === f || fold(x.label) === f || fold(x.label).split(' / ')[0] === f);
  return p ? p.id : null;
}

const RE = {
  plan: /^plan\s*:\s*(.*)$/i,
  desc: /^opis\s*:?\s*(.*)$/i,
  start: /^start\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/i,
  template: /^(szablon|tydzie[nń]\s+wzorcowy)\s*:?\s*$/i,
  pool: /^pula(\s+tygodnia)?\s*:?\s*$/i,
  week: /^tydz(?:ie[nń]|\.)?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:[|:]\s*(.*))?$/i,
  day: /^#{1,4}\s*(.+)$/,
  item: /^(?:[-*•]|\d{1,2}[.)])\s+(.+)$/,
};

/**
 * Zwraca { name, desc, start, template: { days, pool }, weeks: [{ from, to, phase, note, days, pool }], errors: [] }.
 * Numery tygodni liczone od 1.
 */
export function parsePlanText(text) {
  const out = { name: '', desc: '', start: null, template: { days: [], pool: [] }, weeks: [], errors: [] };
  let section = null;   // 'desc' | 'template' | week
  let list = null;      // aktualna lista pozycji (dzień albo pula)
  const target = () => (section && section !== 'desc' ? section : null);

  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/\*\*/g, '');
    if (!line) return;
    let m;
    if ((m = line.match(RE.plan))) { out.name = m[1].trim(); section = null; list = null; return; }
    if ((m = line.match(RE.start))) { out.start = m[1]; return; }
    if ((m = line.match(RE.desc))) { section = 'desc'; list = null; if (m[1]) out.desc += `${m[1].trim()}\n`; return; }
    if (RE.template.test(line)) { section = out.template; list = null; return; }
    if ((m = line.match(RE.week))) {
      const from = Number(m[1]);
      const to = Number(m[2] || m[1]);
      const [phaseText = '', ...noteParts] = (m[3] || '').split('|').map((x) => x.trim());
      let phase = phaseFrom(phaseText);
      let note = noteParts.join(' | ');
      if (!phase && phaseText) note = [phaseText, note].filter(Boolean).join(' | '); // brak fazy – całość to notatka
      if (!(from >= 1 && to >= from && to <= 52)) { out.errors.push(`Linia ${i + 1}: zły numer tygodnia`); return; }
      section = { from, to, phase, note, days: [], pool: [] };
      out.weeks.push(section);
      list = null;
      return;
    }
    if (section === 'desc') { out.desc += `${line}\n`; return; }
    const t = target();
    if (RE.pool.test(line)) {
      if (!t) { out.errors.push(`Linia ${i + 1}: „PULA” musi być w SZABLONIE albo w TYGODNIU`); return; }
      list = t.pool;
      return;
    }
    if ((m = line.match(RE.day))) {
      if (!t) { out.errors.push(`Linia ${i + 1}: dzień „${m[1]}” poza SZABLONEM i TYGODNIEM`); return; }
      const day = { name: m[1].trim(), items: [] };
      t.days.push(day);
      list = day.items;
      return;
    }
    if ((m = line.match(RE.item)) || list) {
      const item = (m ? m[1] : line).trim();
      if (!list) { out.errors.push(`Linia ${i + 1}: pozycja „${item}” bez dnia (dodaj nad nią „## Nazwa dnia”)`); return; }
      list.push(item);
      return;
    }
    // Tekst przed pierwszym dniem tygodnia: dopisujemy do notatki tygodnia.
    if (t && t !== out.template) { t.note = [t.note, line].filter(Boolean).join(' '); return; }
    out.errors.push(`Linia ${i + 1}: nie wiem, gdzie wstawić „${line.slice(0, 40)}”`);
  });
  out.desc = out.desc.trim();
  if (!out.template.days.length && !out.weeks.some((w) => w.days.length)) out.errors.push('Brak dni treningowych (linie „## Nazwa dnia” z pozycjami „- …”)');
  return out;
}

/** Plan aplikacji z wyniku parsePlanText; startWeek – klucz tygodnia 1 („2026-W48”). */
export function buildPlan(parsed, { id, startWeek }) {
  const firstWithDays = parsed.weeks.find((w) => w.days.length);
  const days = parsed.template.days.length ? parsed.template.days : firstWithDays?.days || [];
  const weeks = {};
  for (const w of parsed.weeks) {
    for (let n = w.from; n <= w.to; n++) {
      const key = shiftWeek(startWeek, n - 1);
      const entry = { phase: w.phase || '' };
      if (w.note) entry.note = w.note;
      if (w.days.length) entry.days = structuredClone(w.days);
      if (w.pool.length) entry.pool = [...w.pool];
      weeks[key] = entry;
    }
  }
  return {
    id,
    name: parsed.name || 'Plan z tekstu',
    desc: parsed.desc,
    days: structuredClone(days),
    pool: [...parsed.template.pool],
    weeks,
    ...(parsed.weeks.length ? { startWeek, length: Math.max(...parsed.weeks.map((w) => w.to)) } : {}),
  };
}

/** Krótkie podsumowanie do podglądu przed zapisem. */
export function planSummary(parsed) {
  const lastWeek = Math.max(0, ...parsed.weeks.map((w) => w.to));
  return {
    templateDays: parsed.template.days.length,
    templateItems: parsed.template.days.reduce((n, d) => n + d.items.length, 0),
    weeks: lastWeek,
    ownWeeks: parsed.weeks.filter((w) => w.days.length).reduce((n, w) => n + (w.to - w.from + 1), 0),
    phases: parsed.weeks.filter((w) => w.phase).length,
  };
}

export const startWeekOf = (dateKey) => weekKeyOf(dateKey);
