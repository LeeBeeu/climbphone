// Profil wspinacza: najlepsze wyceny i historia rekordów z logbooka, BMI. Czyste funkcje, bez DOM
// (testy: tests/profile.test.mjs). Wyceny liczone w skali najczęstszej w logbooku dla danego rodzaju.
import { gradeIndex, SYSTEMS } from './grades.js';

// Grupy stylów: „Max” = najlepsze przejście (OS, Flash, RP), „OS” = on-sight, „Flash” = flash lub OS.
export const STYLE_GROUPS = {
  max: { label: 'Najlepsze (RP)', styles: ['OS', 'FL', 'RP'] },
  flash: { label: 'Flash', styles: ['OS', 'FL'] },
  os: { label: 'On-sight', styles: ['OS'] },
};

function mainSystem(ascents, kind) {
  const counts = {};
  for (const a of ascents) if (a.kind === kind) counts[a.system] = (counts[a.system] || 0) + 1;
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
}

// Najlepsza wycena w grupie stylów (opcjonalnie od daty): { grade, date, name } albo null.
export function bestGrade(ascents, kind, group, since = '') {
  const system = mainSystem(ascents, kind);
  if (!system) return null;
  const styles = STYLE_GROUPS[group].styles;
  let best = null;
  for (const a of ascents) {
    if (a.kind !== kind || a.system !== system || !styles.includes(a.style) || a.date < since) continue;
    const gi = gradeIndex(system, a.grade);
    if (gi < 0) continue;
    if (!best || gi > best.gi || (gi === best.gi && a.date < best.date)) best = { gi, grade: a.grade, date: a.date, name: a.name || '' };
  }
  return best && { grade: best.grade, date: best.date, name: best.name };
}

// Historia rekordów: kolejne przejścia, które podniosły najlepszą wycenę w grupie (od najstarszego).
export function gradeMilestones(ascents, kind, group = 'max') {
  const system = mainSystem(ascents, kind);
  if (!system) return [];
  const styles = STYLE_GROUPS[group].styles;
  const list = ascents
    .filter((a) => a.kind === kind && a.system === system && styles.includes(a.style) && gradeIndex(system, a.grade) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  let top = -1;
  for (const a of list) {
    const gi = gradeIndex(system, a.grade);
    if (gi > top) {
      top = gi;
      out.push({ date: a.date, grade: a.grade, style: a.style, name: a.name || '' });
    }
  }
  return out;
}

export const systemLabel = (ascents, kind) => SYSTEMS[mainSystem(ascents, kind)]?.label || '';

// BMI = masa / wzrost² (m). Zakresy WHO tylko informacyjnie – u wspinaczy mało miarodajne przy dużej masie mięśni.
export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm >= 100 && heightCm <= 250)) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}
