// Najbliższy trening: checklista na konkretny dzień, budowana z planu tygodnia i biblioteki.
// Czyste funkcje, bez DOM (testy: tests/session-calc.test.mjs).
//
// state.nextSession = {
//   id, date: "RRRR-MM-DD", place: 'gym' | 'home' | 'crag', title,
//   items: [{ id, text, done, skipped, exId?, src?: { planId, week, key } }],   // src – pozycja planu tygodnia
//   gear:  [{ id, text, done }],                                                   // co zabrać
//   startedAt?: ms, created: ms
// }
import { fold, journalExerciseFrom, planItemText, workoutExercises, journalType } from './library-calc.js';
import { effectiveDays, effectivePool, poolSlots, itemKey } from './plan-calc.js';

export const PLACES = [
  { id: 'gym', label: 'Ścianka', icon: '🏢' },
  { id: 'home', label: 'Dom', icon: '🏠' },
  { id: 'crag', label: 'Skały', icon: '⛰️' },
];
export const placeLabel = (id) => PLACES.find((p) => p.id === id)?.label || '';

export const DEFAULT_GEAR = {
  gym: ['Buty wspinaczkowe', 'Magnezja', 'Szczotka do chwytów', 'Woda', 'Ręcznik', 'Taśma / plastry'],
  home: ['Ciężarki / pas do obciążenia', 'Magnezja', 'Mata', 'Gumy'],
  crag: ['Buty wspinaczkowe', 'Uprząż', 'Lina', 'Ekspresy', 'Przyrząd + karabinek', 'Kask', 'Magnezja', 'Woda i jedzenie', 'Topo'],
};

// Lista „co zabrać”: ostatnio używana dla miejsca albo domyślna.
export function gearFor(place, lastLists = {}, idFn) {
  return (lastLists[place]?.length ? lastLists[place] : DEFAULT_GEAR[place] || []).map((text) => ({ id: idFn(), text, done: false }));
}

export function newSession({ id, date, place = 'gym', lastGear = {}, idFn, now = Date.now() }) {
  return { id, date, place, title: '', items: [], gear: gearFor(place, lastGear, idFn), created: now };
}

// Pozycja planu („Max zwisy – półzaciąg 10 s – 6 × 10 s, listwa 20 mm”) → ćwiczenie z biblioteki.
// Nazwy same bywają z myślnikiem, więc szukamy najdłuższej nazwy, którą zaczyna się tekst.
const stripTimer = (text) => String(text || '').replace(/^Timer:\s*/, '').trim();
function longestPrefix(text, list) {
  const t = fold(stripTimer(text));
  if (!t) return null;
  let best = null;
  for (const x of list) {
    const f = fold(x.name);
    if (f && t.startsWith(f) && /^($|[\s–(,:-])/.test(t.slice(f.length)) && (!best || f.length > fold(best.name).length)) best = x;
  }
  return best;
}
export const matchExercise = (text, all) => longestPrefix(text, all);

// Pozycja „Timer: Max hangs 10 s (listwa 20 mm)” → protokół timera (wbudowany albo własny).
export const matchPreset = (text, presets) => longestPrefix(text, presets);

const itemFrom = (text, idFn, extra = {}) => ({ id: idFn(), text, done: false, skipped: false, ...extra });
const withEx = (text, all) => { const e = matchExercise(text, all); return e ? { exId: e.id } : {}; };

// Źródła do dodania: dni planu i pula w tygodniu daty treningu.
export function planSources(plans, week) {
  return plans.flatMap((p) => [
    ...effectiveDays(p, week).map((d, i) => ({ value: `${p.id}|d${i}`, label: `${p.name} – ${d.name}`, count: d.items.length })),
    ...(effectivePool(p, week).length ? [{ value: `${p.id}|pool`, label: `${p.name} – pula tygodnia`, count: poolSlots(effectivePool(p, week)).length }] : []),
  ]).filter((s) => s.count > 0);
}

// Pozycje z dnia planu albo z puli (tylko jeszcze nieodhaczone miejsca w puli). Pomija te, które już są w treningu.
export function itemsFromPlan(plan, week, part, { checks = {}, all = [], existing = [], idFn }) {
  const have = new Set(existing.map((i) => i.src && `${i.src.planId}|${i.src.week}|${i.src.key}`).filter(Boolean));
  const src = (key) => ({ planId: plan.id, week, key });
  let list;
  if (part === 'pool') {
    list = poolSlots(effectivePool(plan, week)).filter((s) => !checks[s.key]).map((s) => ({ text: s.text, key: s.key }));
  } else {
    const idx = Number(String(part).replace('d', ''));
    list = (effectiveDays(plan, week)[idx]?.items || []).map((text) => ({ text, key: itemKey(idx, text) }));
  }
  return list
    .filter((x) => !have.has(`${plan.id}|${week}|${x.key}`))
    .map((x) => itemFrom(x.text, idFn, { ...withEx(x.text, all), src: src(x.key) }));
}

export const itemsFromWorkout = (w, all, idFn) => workoutExercises(w, all).map((e) => itemFrom(planItemText(e), idFn, { exId: e.id }));
export const itemFromExercise = (e, idFn) => itemFrom(planItemText(e), idFn, { exId: e.id });
export const itemFromText = (text, all, idFn) => itemFrom(String(text).trim(), idFn, withEx(text, all));

export function sessionProgress(s) {
  const total = s.items.filter((i) => !i.skipped).length;
  const done = s.items.filter((i) => i.done && !i.skipped).length;
  const skipped = s.items.filter((i) => i.skipped).length;
  return { done, total, skipped, pct: total ? Math.round((done / total) * 100) : 0 };
}

// Przesunięcie pozycji o jedno miejsce (dir: -1 w górę, 1 w dół); nowa tablica.
export function moveItem(items, idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= items.length) return items;
  const out = [...items];
  [out[idx], out[j]] = [out[j], out[idx]];
  return out;
}

// Czas treningu w minutach od „Zaczynam” do teraz (1–600) albo null.
export function elapsedMinutes(s, now = Date.now()) {
  if (s.startedAt == null) return null;
  return Math.min(600, Math.max(1, Math.round((now - s.startedAt) / 60000)));
}

// Rodzaj pozycji: z ćwiczenia biblioteki albo ze słów w tekście.
const KEYWORDS = [
  [/boulder/i, 'Bouldering'],
  [/kampus|campus/i, 'Kampus'],
  [/\bdrog|\blin[ąaęy]|wędk|prowadz/i, 'Wspinanie z liną'],
  [/timer|zwis|chwytotab|hang|repeater/i, 'Chwytotablica'],
  [/\barc\b|obwod|wytrzymał/i, 'Wytrzymałość / ARC'],
  [/rozciąg|mobiln|joga/i, 'Mobilność / rozciąganie'],
];
const itemType = (item, ex) => journalType(ex) || KEYWORDS.find(([re]) => re.test(item.text))?.[1] || null;

// Najczęstszy rodzaj wśród zrobionych pozycji (bez rozgrzewki); skały – zawsze „Skały”.
function dominantType(s, exOf) {
  if (s.place === 'crag') return 'Skały';
  const pick = (list) => {
    const counts = {};
    for (const i of list) {
      if (/rozgrzew/i.test(i.text) || exOf(i)?.cat === 'warmup') continue;
      const t = itemType(i, exOf(i));
      if (t) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  };
  const done = s.items.filter((i) => i.done && !i.skipped);
  return pick(done) || (done.length ? null : pick(s.items)) || (s.place === 'home' ? 'Siła / ogólnorozwojówka' : null);
}

// Wpis do dziennika: ćwiczenia z seriami jako ćwiczenia, reszta w notatce.
export function finishSummary(s, all, now = Date.now()) {
  const exOf = (i) => (i.exId ? all.find((e) => e.id === i.exId) : null);
  const done = s.items.filter((i) => i.done && !i.skipped);
  const doneEx = done.map(exOf).filter(Boolean);
  const exercises = doneEx.filter((e) => e.kind === 'sets').map(journalExerciseFrom);
  const skipped = s.items.filter((i) => i.skipped);
  const notDone = s.items.filter((i) => !i.done && !i.skipped);
  // Zrobione pozycje bez serii → odhaczone pozycje w dzienniku; pominięte i niezrobione – w notatce.
  const doneItems = done.filter((i) => exOf(i)?.kind !== 'sets').map((i) => ({ text: i.text, done: true }));
  const lines = [
    s.title ? `Trening: ${s.title}` : `Trening (${placeLabel(s.place).toLowerCase()})`,
    ...skipped.map((i) => `✗ pominięte: ${i.text}`),
    ...notDone.map((i) => `○ niezrobione: ${i.text}`),
  ];
  const duration = elapsedMinutes(s, now);
  return {
    exercises,
    items: doneItems,
    type: dominantType(s, exOf),
    notes: lines.join('\n'),
    fields: { date: s.date, ...(duration ? { duration } : {}) },
  };
}
