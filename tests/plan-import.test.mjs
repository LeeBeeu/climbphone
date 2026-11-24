// Plan z tekstu → plan w aplikacji. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanText, buildPlan, planSummary, phaseFrom } from '../app/js/plan-import.js';
import { effectiveDays, effectivePool } from '../app/js/plan-calc.js';

const TEXT = `
PLAN: Zima
START: 2026-11-23
OPIS:
Linia pierwsza
**Linia druga**
SZABLON
## Pon – A
- Max zwisy – półzaciąg 10 s – 6 × 10 s
* Boulderowanie blisko limitu
## Czw – C
1. Pompki – 3 × 10
PULA
- 2× Bouldering
TYDZIEŃ 1 | Odpoczynek | testy
## Pon – testy
- Test: max hang
TYDZIEŃ 2-4 | Siła | blok 1
Tydz. 5 | Deload
## Śr – lekko
- ARC 2 × 10 min
PULA
- Ważenie
TYDZIEŃ 6 | Testy końcowe
`;

test('faza po nazwie polskiej albo id', () => {
  assert.equal(phaseFrom('Siła'), 'strength');
  assert.equal(phaseFrom('sila'), 'strength');
  assert.equal(phaseFrom('deload'), 'deload');
  assert.equal(phaseFrom('Szczyt'), 'peak');
  assert.equal(phaseFrom('testy'), null);
});

test('parsowanie: nazwa, opis, szablon, pula i tygodnie', () => {
  const p = parsePlanText(TEXT);
  assert.deepEqual(p.errors, []);
  assert.equal(p.name, 'Zima');
  assert.equal(p.start, '2026-11-23');
  assert.equal(p.desc, 'Linia pierwsza\nLinia druga');
  assert.deepEqual(p.template.days.map((d) => d.items.length), [2, 1]);
  assert.deepEqual(p.template.pool, ['2× Bouldering']);
  assert.deepEqual(p.weeks.map((w) => [w.from, w.to, w.phase, w.days.length]), [[1, 1, 'rest', 1], [2, 4, 'strength', 0], [5, 5, 'deload', 1], [6, 6, null, 0]]);
  assert.equal(p.weeks[3].note, 'Testy końcowe');
  assert.deepEqual(planSummary(p), { templateDays: 2, templateItems: 3, weeks: 6, ownWeeks: 2, phases: 3 });
});

test('budowa planu: tygodnie od startu, własne dni i pula, reszta z szablonu', () => {
  const plan = buildPlan(parsePlanText(TEXT), { id: 'x', startWeek: '2026-W52' });
  assert.deepEqual(Object.keys(plan.weeks), ['2026-W52', '2026-W53', '2027-W01', '2027-W02', '2027-W03', '2027-W04']);
  assert.equal(plan.startWeek, '2026-W52');
  assert.equal(plan.length, 6);
  assert.equal(effectiveDays(plan, '2026-W52')[0].name, 'Pon – testy');
  assert.equal(effectiveDays(plan, '2026-W53')[0].name, 'Pon – A');
  assert.equal(plan.weeks['2026-W53'].phase, 'strength');
  assert.deepEqual(effectivePool(plan, '2027-W03'), ['Ważenie']);
  assert.deepEqual(effectivePool(plan, '2026-W53'), ['2× Bouldering']);
});

test('błędy: pozycja bez dnia, brak dni', () => {
  const p = parsePlanText('PLAN: X\n- coś');
  assert.equal(p.errors.length, 2);
  assert.match(p.errors[0], /bez dnia|poza/);
});
