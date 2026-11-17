// Tygodniowy check-in (Etap 3, wzorem Lattice). Czyste funkcje, bez DOM (testy: tests/checkin-calc.test.mjs).
//
// Check-in: { id, week: "2026-W47", load, wellbeing, motivation (1–5), readiness, note, created }
// Sugestia na następny tydzień według spisanych reguł (pokazywanych w aplikacji), pierwsza pasująca wygrywa.

export const QUESTIONS = [
  { id: 'load', label: 'Jak ciężki był tydzień?', low: 'bardzo lekki', high: 'bardzo ciężki' },
  { id: 'wellbeing', label: 'Samopoczucie (sen, zmęczenie, bóle)', low: 'bardzo złe', high: 'świetne' },
  { id: 'motivation', label: 'Motywacja do treningu', low: 'brak', high: 'ogromna' },
];

export const READINESS = [
  { id: 'normal', label: 'Normalnie' },
  { id: 'deload', label: 'Deload (lżejszy tydzień)' },
  { id: 'rest', label: 'Odpoczynek' },
  { id: 'injury', label: 'Kontuzja / ból' },
];

export const ACTIONS = {
  increase: { label: 'Zwiększ', css: 'ok' },
  keep: { label: 'Utrzymaj', css: 'warn' },
  decrease: { label: 'Zmniejsz', css: 'bad' },
};

export const PLAN_DONE_MIN = 80; // % odhaczonego planu, przy którym można zwiększać

// Reguły w kolejności sprawdzania – ten sam tekst pokazujemy w aplikacji („Jak to działa?”).
export const RULES = [
  { id: 'injury', action: 'decrease', text: 'Kontuzja albo ból: odpuść obciążanie bolącej partii i wracaj stopniowo.' },
  { id: 'rest', action: 'decrease', text: 'Zaplanowany odpoczynek: tydzień bez mocnych treningów.' },
  { id: 'deload', action: 'decrease', text: 'Deload: ok. 50–60% zwykłej objętości przy tej samej intensywności.' },
  { id: 'low', action: 'decrease', text: 'Samopoczucie albo motywacja 1–2: zmęczenie się kumuluje – lżejszy tydzień.' },
  { id: 'heavy', action: 'decrease', text: 'Tydzień był bardzo ciężki (5): daj ciału nadrobić.' },
  { id: 'ready', action: 'increase', text: `Lekko lub średnio (1–3), samopoczucie i motywacja 4–5, plan zrobiony w co najmniej ${PLAN_DONE_MIN}%: dodaj ok. 10% objętości albo krok obciążenia.` },
  { id: 'keep', action: 'keep', text: 'W pozostałych przypadkach: obciążenie w sam raz – kontynuuj.' },
];

// planPct – średnie wykonanie planów w tym tygodniu (null, gdy brak planów: nie blokuje „Zwiększ”).
export function suggestion(c, planPct = null) {
  const match = (id) => RULES.find((r) => r.id === id);
  if (c.readiness === 'injury') return match('injury');
  if (c.readiness === 'rest') return match('rest');
  if (c.readiness === 'deload') return match('deload');
  if (c.wellbeing <= 2 || c.motivation <= 2) return match('low');
  if (c.load >= 5) return match('heavy');
  if (c.load <= 3 && c.wellbeing >= 4 && c.motivation >= 4 && (planPct === null || planPct >= PLAN_DONE_MIN)) return match('ready');
  return match('keep');
}

export const isComplete = (c) => QUESTIONS.every((q) => c[q.id] >= 1 && c[q.id] <= 5) && READINESS.some((r) => r.id === c.readiness);
