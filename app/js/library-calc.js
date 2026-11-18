// Biblioteka ćwiczeń: wyszukiwanie i przeliczenia na plan, timer i dziennik. Czyste funkcje, bez DOM
// (testy: tests/library.test.mjs).
import { LIBRARY, CATEGORIES, EQUIPMENT, WORKOUTS } from './library-data.js';

// Bez polskich znaków i wielkości liter: „palcow” znajdzie „palców”.
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export const byId = (id) => LIBRARY.find((e) => e.id === id) || null;
export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

// Filtr: { q, cat, equip, level } – puste pola nie filtrują; level = maksymalny poziom.
export function filterLibrary(list, { q = '', cat = '', equip = '', level = 0 } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (cat && e.cat !== cat) return false;
    if (equip && !e.equip.includes(equip)) return false;
    if (level && e.level > level) return false;
    if (!words.length) return true;
    const hay = fold(`${e.name} ${e.how} ${e.tips || ''} ${catLabel(e.cat)} ${e.equip.map((k) => EQUIPMENT[k]).join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}

// Wpis do planu (dzień albo pula): „Nazwa – dawka”; protokoły timera z prefiksem „Timer:”.
export const planItemText = (e) => `${e.kind === 'timer' ? 'Timer: ' : ''}${e.name} – ${e.dose}`;

// Protokół timera z ćwiczenia (zapisywany jako własny protokół o id „lib-…”).
export function timerPresetFrom(e) {
  if (e.kind !== 'timer') return null;
  return { id: `lib-${e.id}`, name: e.name, ...e.timer, load_mode: 'kg', added_kg: 0, load_pct: 100 };
}

// Ćwiczenie do dziennika z domyślnymi seriami.
export function journalExerciseFrom(e) {
  if (e.kind !== 'sets') return null;
  return {
    name: e.name,
    bodyweight: !!e.sets.bodyweight,
    sets: Array.from({ length: e.sets.sets }, () => ({ reps: e.sets.reps, added_kg: 0, effort: null })),
  };
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
  if (!String(e.dose || '').trim()) return 'Podaj dawkę, np. „4 × 6” albo „20 min”';
  if (!String(e.how || '').trim()) return 'Opisz krótko, jak wykonać ćwiczenie';
  if (e.kind === 'timer') {
    const t = e.timer || {};
    const ok = ['prep', 'hang', 'rest', 'reps', 'sets', 'setRest'].every((k) => Number.isInteger(t[k]) && t[k] >= 0 && t[k] <= 3600);
    if (!ok || t.hang < 1 || t.reps < 1 || t.sets < 1) return 'Uzupełnij czasy timera (zwis, powtórzenia i serie większe od zera)';
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
  return { ...rest, id, name: `${e.name} (moje)`, custom: true };
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
