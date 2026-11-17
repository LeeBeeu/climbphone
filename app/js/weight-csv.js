// Import i eksport pomiarów wagi w CSV (MC-60, MC-61). Czyste funkcje, testowane w tests/.
// Import przyjmuje eksport z Libry (separator ';', linie z '#', daty ISO w UTC)
// oraz własny eksport ClimbPhone (measured_at,weight_kg,body_fat_pct,note).
import { toLocalISO } from './weight-calc.js';

const LB_TO_KG = 0.45359237;

const COLUMNS = {
  date: /^(date|measured_at|data|datetime|time)$/,
  weight: /^(weight|weight_kg|waga|masa)$/,
  fat: /^(body ?fat|body_fat|body_fat_pct|fat|fat_pct|tłuszcz|tkanka tłuszczowa)$/,
  note: /^(comment|note|notatka|log|komentarz)$/,
};

// Jedna linia CSV z obsługą cudzysłowów (RFC 4180).
export function parseCsvLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Dzieli tekst na rekordy; nowa linia wewnątrz cudzysłowu należy do pola.
function splitRecords(text) {
  const records = [];
  let cur = '';
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if ((c === '\n') && !quoted) {
      records.push(cur.replace(/\r$/, ''));
      cur = '';
    } else cur += c;
  }
  if (cur) records.push(cur.replace(/\r$/, ''));
  return records;
}

const toNumber = (s) => (s === '' || s === undefined ? null : Number(String(s).replace(',', '.')));

// Daty: ISO z 'Z' lub przesunięciem, 'RRRR-MM-DD HH:MM[:SS]', 'RRRR-MM-DD'.
function parseDate(s) {
  const text = String(s ?? '').trim();
  if (!text) return null;
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const d = local
    ? new Date(+local[1], +local[2] - 1, +local[3], +(local[4] ?? 12), +(local[5] ?? 0), +(local[6] ?? 0))
    : new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseWeightCsv(text) {
  const lines = splitRecords(String(text).replace(/^﻿/, ''));
  let unit = 'kg';
  let header = null;
  let sep = null;
  const rows = [];
  const errors = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      const units = line.match(/^#\s*units?\s*:\s*(\w+)/i);
      if (units) unit = /^lb/i.test(units[1]) ? 'lb' : 'kg';
      const body = line.replace(/^#\s*/, '');
      if (!header && /date|measured_at/i.test(body) && /weight/i.test(body)) {
        sep = body.includes(';') ? ';' : ',';
        header = parseCsvLine(body, sep).map((h) => h.toLowerCase());
      }
      return;
    }
    if (!sep) sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const cells = parseCsvLine(line, sep);
    if (!header && cells.some((c) => COLUMNS.date.test(c.toLowerCase())) && cells.some((c) => COLUMNS.weight.test(c.toLowerCase()))) {
      header = cells.map((h) => h.toLowerCase());
      return;
    }

    // Bez nagłówka przyjmujemy układ Libry: data;waga;trend;tłuszcz;trend tłuszczu;komentarz.
    const col = (name, fallback) => {
      const idx = header ? header.findIndex((h) => COLUMNS[name].test(h)) : fallback;
      return idx >= 0 ? cells[idx] : undefined;
    };
    const date = parseDate(col('date', 0));
    let weight = toNumber(col('weight', 1));
    const fat = toNumber(col('fat', 3));
    const note = col('note', 5) ?? '';

    if (!date) return errors.push({ line: i + 1, message: 'nieczytelna data' });
    if (weight === null || Number.isNaN(weight)) return errors.push({ line: i + 1, message: 'brak wagi' });
    if (unit === 'lb') weight *= LB_TO_KG;
    weight = Math.round(weight * 100) / 100;
    if (weight < 30 || weight > 200) return errors.push({ line: i + 1, message: `waga ${weight} poza zakresem 30–200 kg` });

    rows.push({
      measured_at: toLocalISO(date),
      weight_kg: weight,
      body_fat_pct: fat !== null && !Number.isNaN(fat) && fat > 0 ? fat : null,
      note: note.trim(),
    });
  });

  return { rows, errors, unit, format: header?.includes('measured_at') ? 'climbphone' : 'libra' };
}

// Ten sam pomiar = ta sama minuta i ta sama waga z dokładnością do 0,05 kg.
const dupKey = (e) => `${Math.floor(Date.parse(e.measured_at) / 60000)}|${Math.round(e.weight_kg * 10)}`;

export function splitDuplicates(existing, rows) {
  const seen = new Set(existing.map(dupKey));
  const fresh = [];
  let duplicates = 0;
  for (const r of rows) {
    const key = dupKey(r);
    if (seen.has(key)) duplicates++;
    else {
      seen.add(key);
      fresh.push(r);
    }
  }
  return { fresh, duplicates };
}

const quote = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// MC-61: data ISO 8601, kg, % tłuszczu, notatka.
export function toWeightCsv(entries) {
  const sorted = [...entries].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  return ['measured_at,weight_kg,body_fat_pct,note',
    ...sorted.map((e) => [e.measured_at, e.weight_kg, e.body_fat_pct ?? '', quote(e.note || '')].join(','))]
    .join('\n') + '\n';
}
