// Wszystkie dane aplikacji w jednym obiekcie zapisywanym w localStorage urządzenia.
import { toast } from './ui.js';

const KEY = 'climbphone.v1';

const VERSION = 2;

const defaults = () => ({
  version: VERSION,
  sessions: [],      // dziennik treningów
  ascents: [],       // przejścia dróg i boulderów (model zgodny z 8a.nu)
  plans: [],         // plany treningowe
  planChecks: {},    // odhaczone ćwiczenia: { "planId|2026-W45": { "0:Ćwiczenie": true } }
  timerPresets: [],  // własne protokoły timera
  // Moduł masy ciała – nazwy pól jak w docs/specyfikacja.md, żeby dało się je przenieść 1:1 do bazy.
  weightEntries: [], // weight_entries: pomiary
  weightGoals: [],   // weight_goal: aktywny cel = ostatni bez ended_at, wcześniejsze to historia
  settings: {
    routeSystem: 'french',
    boulderSystem: 'font',
    weight_trend_method: 'libra', // 'libra' (czas, τ dni) albo 'ema' (Hacker's Diet, α na dzień pomiaru)
    weight_trend_tau_days: 7,
    weight_trend_alpha: 0.1,
    weight_daily_mode: 'first',
  },
});

// v1 -> v2: "Miejsce" staje się rejonem, style SEND/PR zamieniają się na RP/GO jak w 8a.nu.
function migrateAscent(a) {
  const { place, ...rest } = a;
  const out = { crag: place || '', sector: '', ...rest };
  if (out.style === 'SEND') out.style = 'RP';
  if (out.style === 'PR') {
    out.style = 'GO';
    out.project = true;
  }
  return out;
}

function normalize(data) {
  const base = defaults();
  const out = { ...base, ...data, settings: { ...base.settings, ...(data?.settings || {}) } };
  if ((data?.version ?? 1) < 2) out.ascents = out.ascents.map(migrateAscent);
  out.version = VERSION;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error('Nie udało się odczytać danych', err);
  }
  return defaults();
}

let state = load();

export const getState = () => state;

export function update(mutator) {
  mutator(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error(err);
    toast('Nie udało się zapisać danych!');
  }
}

export function replaceState(data) {
  state = normalize(data);
  update(() => {});
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
