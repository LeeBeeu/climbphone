// Biblioteka ćwiczeń: wyszukiwanie i przeliczenia na plan, timer i dziennik. Czyste funkcje, bez DOM
// (testy: tests/library.test.mjs).
import { LIBRARY, CATEGORIES, EQUIPMENT } from './library-data.js';

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

export { LIBRARY, CATEGORIES, EQUIPMENT };
