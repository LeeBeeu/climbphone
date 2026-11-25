// Testy ćwiczeń poza timerem. Uruchom: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciseCatalog, lastExercise, cleanExercises, exPct, fmtExSets, bestExSet, EXERCISES,
} from '../app/js/exercises.js';
import { strengthProtocols, strengthSeries } from '../app/js/load-calc.js';

const pull = (sets) => ({ name: 'Podciąganie', bodyweight: true, sets: sets.map(([reps, added_kg]) => ({ reps, added_kg })) });

test('katalog: wbudowane + własne z dziennika, bez duplikatów', () => {
  const cat = exerciseCatalog([
    { date: '2026-11-01', exercises: [{ name: 'podciąganie', bodyweight: true, sets: [] }, { name: 'Wiszące unoszenie nóg', bodyweight: true, sets: [] }] },
  ]);
  assert.equal(cat.length, exerciseCatalog([]).length + 1);
  assert.equal(cat.at(-1).name, 'Wiszące unoszenie nóg');
});

test('ostatnie wykonanie ćwiczenia, z pominięciem edytowanej sesji', () => {
  const sessions = [
    { id: 'a', date: '2026-11-01', exercises: [pull([[5, 15]])] },
    { id: 'b', date: '2026-11-08', exercises: [pull([[5, 20]])] },
    { id: 'c', date: '2026-11-05', exercises: [{ name: 'Dipy', bodyweight: true, sets: [{ reps: 8, added_kg: 0 }] }] },
  ];
  assert.equal(lastExercise(sessions, 'PODCIĄGANIE').date, '2026-11-08');
  assert.equal(lastExercise(sessions, 'Podciąganie', 'b').date, '2026-11-01');
  assert.equal(lastExercise(sessions, 'Martwy ciąg'), null);
});

test('czyszczenie formularza: liczby, puste serie i ćwiczenia odpadają', () => {
  const out = cleanExercises([
    { name: ' Podciąganie ', bodyweight: true, sets: [{ reps: '5', added_kg: '20' }, { reps: '', added_kg: '20' }, { reps: '0', added_kg: 5 }] },
    { name: 'Dipy', bodyweight: true, sets: [{ reps: '', added_kg: 0 }] },
  ]);
  assert.deepEqual(out, [{ name: 'Podciąganie', bodyweight: true, sets: [{ reps: 5, added_kg: 20, effort: null }] }]);
  assert.equal(cleanExercises([{ name: 'Dipy', sets: [{ reps: 8, added_kg: 0, effort: 4 }] }])[0].sets[0].effort, 4);
  assert.equal(fmtExSets({ bodyweight: true, sets: [{ reps: 5, added_kg: 20, effort: 3 }, { reps: 5, added_kg: 20, effort: 5 }] }), '2×5 +20 kg · wysiłek 4/5');
});

test('najcięższa seria, % MC i tekst serii', () => {
  const ex = pull([[5, 20], [5, 20], [4, 20], [1, 30], [0, 35]]);
  assert.deepEqual(bestExSet(ex.sets), { reps: 1, added_kg: 30 });
  assert.equal(exPct(80, 20), 125);
  assert.equal(exPct(80, -20), 75);
  assert.equal(exPct(null, 5), null);
  assert.equal(fmtExSets(ex), '2×5 +20 kg, 1×4 +20 kg, 1×1 +30 kg, 1×0 +35 kg');
  assert.equal(fmtExSets(pull([[8, 0], [8, 0]])), '2×8');
  assert.equal(fmtExSets({ bodyweight: false, sets: [{ reps: 5, added_kg: 100 }, { reps: 5, added_kg: 100 }] }), '2×5 100 kg');
});

test('ćwiczenia z masą ciała trafiają na wykres siły względnej', () => {
  const sessions = [
    { date: '2026-11-01', body_weight_kg: 80, exercises: [pull([[5, 20], [3, 24]])] },
    { date: '2026-11-08', body_weight_kg: 80, exercises: [pull([[5, 22]]), { name: 'Martwy ciąg', bodyweight: false, sets: [{ reps: 5, added_kg: 120 }] }] },
    { date: '2026-11-09', preset_id: 'b-max', preset_name: 'Max hangs', hang_load: { body_weight_kg: 80, added_kg: 10 } },
  ];
  const protos = strengthProtocols(sessions);
  assert.deepEqual(protos.map((p) => [p.id, p.name, p.count]), [['b-max', 'Max hangs', 1], ['ex:podciąganie', 'Podciąganie', 2]]);
  const s = strengthSeries(sessions, 'ex:podciąganie');
  assert.deepEqual(s.map((p) => [p.date, p.pct_bw, p.reps]), [['2026-11-01', 130, 3], ['2026-11-08', 127.5, 5]]);
});

test('lista ćwiczeń w dzienniku: biblioteka w kategoriach, bez serii – do notatki', async () => {
  const { journalPickerGroups } = await import('../app/js/exercises.js');
  const sessions = [{ date: '2026-11-01', exercises: [{ name: 'Moje ćwiczenie', sets: [] }, { name: 'Pompki', sets: [] }] }];
  const g = journalPickerGroups(sessions, [{ id: 'own-1', name: 'Własne core', cat: 'core', kind: 'sets', sets: { sets: 3, reps: 10, bodyweight: true } }]);
  assert.equal(g[0].label, 'Z dziennika i inne');
  assert.ok(g[0].options.some((o) => o.value === 'name:Moje ćwiczenie'));
  assert.ok(!g[0].options.some((o) => o.label === 'Pompki'), 'Pompki są w bibliotece, nie w „innych”');
  const all = g.flatMap((x) => x.options);
  assert.ok(all.some((o) => o.value === 'lib:moon_limit' && o.label.endsWith('· do notatki')));
  assert.ok(all.some((o) => o.value === 'lib:own-1'));
  assert.ok(all.some((o) => o.value === 'lib:deadlift' && o.label.endsWith('(ciężar)')));
});
