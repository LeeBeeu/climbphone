// Testy importu i eksportu CSV wagi. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWeightCsv, toWeightCsv, splitDuplicates, parseCsvLine } from '../app/js/weight-csv.js';

// Układ eksportu z Libry (do potwierdzenia na prawdziwym pliku – MC-60).
const LIBRA = `#Version:6
#Units:kg

#date;weight;weight trend;body fat;body fat trend;comment
2026-11-01T06:30:00.000Z;80.4;80.4;;;
2026-11-02T06:31:00.000Z;80,1;80.37;18.5;18.5;po treningu
2026-11-03T06:29:00.000Z;;80.3;;;
`;

test('Libra: separator ;, linie #, przecinek dziesiętny, puste pola', () => {
  const { rows, errors, unit } = parseWeightCsv(LIBRA);
  assert.equal(unit, 'kg');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].weight_kg, 80.4);
  assert.equal(rows[1].weight_kg, 80.1);
  assert.equal(rows[1].body_fat_pct, 18.5);
  assert.equal(rows[1].note, 'po treningu');
  assert.equal(Date.parse(rows[0].measured_at), Date.parse('2026-11-01T06:30:00.000Z'));
  assert.equal(errors.length, 1, 'wiersz bez wagi trafia do błędów');
});

test('Libra: funty przeliczane na kg', () => {
  const { rows } = parseWeightCsv('#Units:lb\n#date;weight\n2026-11-01T06:30:00Z;176.4\n');
  assert.equal(rows[0].weight_kg, 80.01);
});

test('eksport → import bez utraty danych (kryterium odbioru)', () => {
  const entries = [
    { measured_at: '2026-11-01T07:12:00+01:00', weight_kg: 80.4, body_fat_pct: 18.2, note: 'rano, "na czczo", po spacerze' },
    { measured_at: '2026-11-02T07:05:00+01:00', weight_kg: 80.1, body_fat_pct: null, note: '' },
  ];
  const csv = toWeightCsv(entries);
  const { rows, errors, format } = parseWeightCsv(csv);
  assert.equal(format, 'climbphone');
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  rows.forEach((r, i) => {
    assert.equal(Date.parse(r.measured_at), Date.parse(entries[i].measured_at));
    assert.equal(r.weight_kg, entries[i].weight_kg);
    assert.equal(r.body_fat_pct, entries[i].body_fat_pct);
    assert.equal(r.note, entries[i].note);
  });
  assert.equal(splitDuplicates(entries, rows).duplicates, 2, 'ponowny import nie dubluje');
});

test('duplikaty: ta sama minuta i waga', () => {
  const existing = [{ measured_at: '2026-11-01T07:00:00+01:00', weight_kg: 80.4 }];
  const { fresh, duplicates } = splitDuplicates(existing, [
    { measured_at: '2026-11-01T06:00:00Z', weight_kg: 80.4 },   // ta sama chwila
    { measured_at: '2026-11-01T06:00:00Z', weight_kg: 80.9 },   // inna waga
    { measured_at: '2026-11-02T06:00:00Z', weight_kg: 80.2 },
    { measured_at: '2026-11-02T06:00:00Z', weight_kg: 80.2 },   // duplikat w samym pliku
  ]);
  assert.equal(duplicates, 2);
  assert.equal(fresh.length, 2);
});

test('CSV: cudzysłowy i przecinki w polu', () => {
  assert.deepEqual(parseCsvLine('a,"b, c","d ""e"""', ','), ['a', 'b, c', 'd "e"']);
});
