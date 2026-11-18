// Biblioteka ćwiczeń: wyszukiwanie i przeliczenia na plan, timer i dziennik. Czyste funkcje, bez DOM
// (testy: tests/library.test.mjs).
import { LIBRARY, CATEGORIES, EQUIPMENT, WORKOUTS } from './library-data.js';
import { TYPES, GOALS, exType, exGoals, typeLabel, goalLabel } from './library-tags.js';

export { TYPES, GOALS, exType, exGoals, typeLabel, goalLabel };

// Bez polskich znaków i wielkości liter: „palcow” znajdzie „palców”.
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export const byId = (id) => LIBRARY.find((e) => e.id === id) || null;
export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

// Filtr: { q, cat, equip, level, type, goal } – puste pola nie filtrują; level = maksymalny poziom.
export function filterLibrary(list, { q = '', cat = '', equip = '', level = 0, type = '', goal = '' } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (cat && e.cat !== cat) return false;
    if (type && exType(e) !== type) return false;
    if (goal && !exGoals(e).includes(goal)) return false;
    if (equip && !e.equip.includes(equip)) return false;
    if (level && e.level > level) return false;
    if (!words.length) return true;
    const hay = fold(`${e.name} ${e.how} ${e.tips || ''} ${catLabel(e.cat)} ${e.equip.map((k) => EQUIPMENT[k]).join(' ')} `
      + `${typeLabel(exType(e))} ${exGoals(e).map(goalLabel).join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}

// Wpis do planu (dzień albo pula): „Nazwa – dawka”; protokoły timera z prefiksem „Timer:”.
// Ćwiczenie jednostronne: dopisujemy „na stronę”, jeśli dawka tego nie mówi.
const sideNote = (e) => (e.unilateral && !/stron|rękę|ręk|nogę/i.test(e.dose) ? ' (na stronę)' : '');
export const planItemText = (e) => `${e.kind === 'timer' ? 'Timer: ' : ''}${e.name} – ${e.dose}${sideNote(e)}${e.edge_mm ? `, listwa ${e.edge_mm} mm` : ''}`;

// Protokół timera z ćwiczenia (zapisywany jako własny protokół o id „lib-…”).
export function timerPresetFrom(e) {
  if (e.kind !== 'timer') return null;
  return { id: `lib-${e.id}`, name: e.name, ...e.timer, load_mode: 'kg', added_kg: 0, load_pct: 100, ...(e.edge_mm ? { edge_mm: e.edge_mm } : {}) };
}

// Ćwiczenie do dziennika z domyślnymi seriami.
export function journalExerciseFrom(e) {
  if (e.kind !== 'sets') return null;
  return {
    name: e.name,
    bodyweight: !!e.sets.bodyweight,
    // Serie o różnej liczbie powtórzeń (np. piramida) albo jednakowe.
    sets: (e.sets.scheme || Array.from({ length: e.sets.sets }, () => e.sets.reps)).map((reps) => ({ reps, added_kg: 0, effort: null })),
  };
}

// „5, 4, 3” → [5, 4, 3]; pusty tekst → null.
export function parseScheme(text) {
  const parts = String(text || '').split(/[,;\s-]+/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts.map(Number) : null;
}

export const countByCat = (list) => Object.fromEntries(CATEGORIES.map((c) => [c.id, list.filter((e) => e.cat === c.id).length]));

// ---------- Własne ćwiczenia (state.customExercises) ----------
// Ten sam kształt co w library-data.js, plus custom: true i id „own-…”.

export const KINDS = { timer: 'protokół timera', sets: 'serie × powtórzenia', time: 'na czas', climb: 'na ścianie' };

export const allExercises = (custom = []) => [...LIBRARY, ...custom];
export const findExercise = (id, custom = []) => allExercises(custom).find((e) => e.id === id) || null;

// Błąd walidacji (tekst) albo null. `all` – wszystkie ćwiczenia, do sprawdzenia unikalności nazwy.
export function validateExercise(e, all = LIBRARY) {
  const name = String(e.name || '').trim();
  if (!name) return 'Podaj nazwę ćwiczenia';
  if (name.length > 80) return 'Nazwa może mieć najwyżej 80 znaków';
  if (all.some((x) => x.id !== e.id && fold(x.name) === fold(name))) return 'Ćwiczenie o tej nazwie już jest w bibliotece';
  if (!CATEGORIES.some((c) => c.id === e.cat)) return 'Wybierz kategorię';
  if (!(e.level >= 1 && e.level <= 3)) return 'Wybierz poziom';
  if (!(e.kind in KINDS)) return 'Wybierz rodzaj ćwiczenia';
  if (!e.equip?.length || !e.equip.every((k) => k in EQUIPMENT)) return 'Wybierz co najmniej jeden sprzęt (albo „bez sprzętu”)';
  if (e.type && !TYPES.some((t) => t.id === e.type)) return 'Wybierz typ treningu';
  if (e.goals && !e.goals.every((g) => GOALS.some((x) => x.id === g))) return 'Nieznany cel ćwiczenia';
  if (!String(e.dose || '').trim()) return 'Podaj dawkę, np. „4 × 6” albo „20 min”';
  if (!String(e.how || '').trim()) return 'Opisz krótko, jak wykonać ćwiczenie';
  if (e.kind === 'timer') {
    const t = e.timer || {};
    const ok = ['prep', 'hang', 'rest', 'reps', 'sets', 'setRest'].every((k) => Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= 3600);
    if (!ok || t.hang < 1 || t.reps < 1 || t.sets < 1) return 'Uzupełnij czasy timera (zwis, powtórzenia i serie większe od zera)';
  }
  if (e.edge_mm !== undefined && e.edge_mm !== null && !(Number.isInteger(e.edge_mm) && e.edge_mm >= 4 && e.edge_mm <= 60)) {
    return 'Szerokość listwy: 4–60 mm';
  }
  if (e.kind === 'sets' && e.sets?.scheme) {
    const sc = e.sets.scheme;
    if (!(Array.isArray(sc) && sc.length >= 1 && sc.length <= 20 && sc.every((r) => Number.isInteger(r) && r >= 1 && r <= 200))) {
      return 'Powtórzenia w seriach: liczby 1–200 po przecinku, np. 5, 4, 3';
    }
  }
  if (e.kind === 'sets') {
    const s = e.sets || {};
    if (!(Number.isInteger(s.sets) && s.sets >= 1 && s.sets <= 20 && Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= 200)) {
      return 'Podaj liczbę serii (1–20) i powtórzeń (1–200)';
    }
  }
  return null;
}

// „Kopiuj jako własne”: kopia ćwiczenia z biblioteki do zmiany dawki albo opisu.
export function copyAsCustom(e, id) {
  const { custom: _c, ...rest } = structuredClone(e);
  // Typ i cele zapisujemy wprost – kopia ma nowe id, więc nie trafiłaby już na listę wyjątków.
  return { ...rest, id, name: `${e.name} (moje)`, custom: true, type: exType(e), goals: [...exGoals(e)] };
}

// ---------- Treningi (zestawy ćwiczeń) ----------
// Trening: { id, name, desc, items: [id ćwiczenia, …] }; gotowe w library-data.js (WORKOUTS), własne w state.workouts.

export const allWorkouts = (own = []) => [...WORKOUTS.map((w) => ({ ...w, builtin: true })), ...own];

// Ćwiczenia treningu w kolejności; brakujące (np. usunięte własne) są pomijane.
export const workoutExercises = (w, all) => w.items.map((id) => all.find((e) => e.id === id)).filter(Boolean);

// Do planu: każde ćwiczenie osobną pozycją (dzień) albo jedna pozycja (pula tygodnia).
export const workoutPlanItems = (w, all) => workoutExercises(w, all).map(planItemText);
export const workoutPoolItem = (w) => `Trening: ${w.name}`;

// Do dziennika: ćwiczenia z seriami jako ćwiczenia, pozostałe jako lista w notatce.
export function workoutJournal(w, all) {
  const list = workoutExercises(w, all);
  return {
    exercises: list.filter((e) => e.kind === 'sets').map(journalExerciseFrom),
    notes: [`Trening: ${w.name}`, ...list.filter((e) => e.kind !== 'sets').map((e) => `• ${e.name} – ${e.dose}`)].join('\n'),
  };
}

// Usunięcie własnego ćwiczenia: znika też ze wszystkich własnych treningów.
export const removeFromWorkouts = (workouts, exId) => workouts.map((w) => ({ ...w, items: w.items.filter((i) => i !== exId) }));

export { LIBRARY, CATEGORIES, EQUIPMENT, WORKOUTS };
