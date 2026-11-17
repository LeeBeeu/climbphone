// Obliczenia modułu masy ciała: trend, tempo, prognoza, zastój.
// Czyste funkcje bez DOM i bez zapisu, żeby dało się je testować i przenieść 1:1 na inny stos.
// Wzory opisuje docs/specyfikacja.md (MC-10…MC-23).

export const DAY_MS = 86400000;
export const PACE_WINDOW_DAYS = 14;   // MC-12: tempo z trendu z ostatnich 14 dni
export const PLATEAU_DAYS = 14;       // MC-23: zastój = 14 dni…
export const PLATEAU_KG = 0.2;        // …ze zmianą trendu poniżej 0,2 kg
export const MIN_PACE = 0.05;         // poniżej tego tempa (kg/tydz.) uznajemy, że trend stoi
export const WEIGHT_MIN = 30;         // MC-05: dopuszczalny zakres pomiaru
export const WEIGHT_MAX = 200;
export const JUMP_WARN_KG = 2;        // MC-05: ostrzeżenie przy skoku wobec trendu

const pad = (n) => String(n).padStart(2, '0');

// Lokalna data dnia 'RRRR-MM-DD' dla chwili pomiaru (Date albo tekst ISO).
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Numer dnia (liczba dni od 1970-01-01) – do odejmowania dat i regresji.
export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export const keyFromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Chwila w ISO 8601 z lokalnym przesunięciem strefy, np. 2026-11-17T07:12:00+01:00.
export function toLocalISO(date) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// MC-04: jedna wartość na dzień – pierwszy pomiar dnia albo średnia dnia.
export function dailyValues(entries, mode = 'first') {
  const byDay = new Map();
  const sorted = [...entries].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  for (const e of sorted) {
    const key = dayKey(e.measured_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e.weight_kg);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value: mode === 'mean' ? values.reduce((s, v) => s + v, 0) / values.length : values[0],
      count: values.length,
    }));
}

// Metoda „ema” (The Hacker's Diet): T_n = T_(n-1) + α·(W_n − T_(n-1)), T_0 = W_0.
// Liczona tylko dla dni z pomiarem, więc dni bez pomiaru nie zmieniają trendu.
export function trendSeries(daily, alpha = 0.1) {
  let trend = null;
  return daily.map(({ date, value }) => {
    trend = trend === null ? value : trend + alpha * (value - trend);
    return { date, day: dayNumber(date), value, trend };
  });
}

export const TREND_TAU_DAYS = 7;

// Metoda „libra” (domyślna, zgodna z Librą – sprawdzone na jej eksporcie):
// każdy pomiar, wpływ poprzedniego trendu maleje z upływem czasu Δt:
// T_n = W_n + (T_(n-1) − W_n) · e^(−Δt / τ), τ = 7 dni. Po długiej przerwie trend zbliża się do nowego pomiaru.
// Punkt dnia ma wartość wg trybu dnia (do wykresu), a trend z ostatniego pomiaru tego dnia.
export function trendSeriesTime(entries, tauDays = TREND_TAU_DAYS, mode = 'first') {
  const sorted = [...entries].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  const dayTrend = new Map();
  let trend = null;
  let prevTime = null;
  for (const e of sorted) {
    const time = Date.parse(e.measured_at);
    trend = trend === null
      ? e.weight_kg
      : e.weight_kg + (trend - e.weight_kg) * Math.exp(-(time - prevTime) / DAY_MS / tauDays);
    prevTime = time;
    dayTrend.set(dayKey(e.measured_at), trend);
  }
  return dailyValues(entries, mode).map(({ date, value }) => ({ date, day: dayNumber(date), value, trend: dayTrend.get(date) }));
}

// Seria trendu według ustawień użytkownika.
export function buildSeries(entries, settings) {
  return settings.weight_trend_method === 'ema'
    ? trendSeries(dailyValues(entries, settings.weight_daily_mode), settings.weight_trend_alpha)
    : trendSeriesTime(entries, settings.weight_trend_tau_days, settings.weight_daily_mode);
}

// Trend obowiązujący w danym dniu: z ostatniego pomiaru w tym dniu albo wcześniej.
export function trendAt(series, key) {
  const day = dayNumber(key);
  let found = null;
  for (const p of series) {
    if (p.day > day) break;
    found = p;
  }
  return found;
}

// Zmiana trendu w ostatnich `days` dniach (np. „od tygodnia”), licząc od ostatniego pomiaru.
export function trendChange(series, days) {
  const last = series.at(-1);
  if (!last) return null;
  const before = trendAt(series, keyFromDayNumber(last.day - days));
  return before ? last.trend - before.trend : null;
}

// MC-12: tempo [kg/tydz.] = 7 · nachylenie prostej (metoda najmniejszych kwadratów)
// dopasowanej do trendu z ostatnich 14 dni (licząc od ostatniego pomiaru).
export function pace(series, windowDays = PACE_WINDOW_DAYS) {
  const last = series.at(-1);
  if (!last) return null;
  const pts = series.filter((p) => p.day > last.day - windowDays);
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p.day, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.trend, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.day - mx) * (p.trend - my);
    den += (p.day - mx) ** 2;
  }
  return den ? (7 * num) / den : null;
}

// Kierunek potrzebny do celu: −1 (chudnąć), +1 (przybrać), 0 (trend już w przedziale).
export function goalDirection(trend, goal) {
  if (trend > goal.target_max_kg) return -1;
  if (trend < goal.target_min_kg) return 1;
  return 0;
}

// MC-13: ocena tempa wobec celu. Tempo celu podajemy jak w specyfikacji (np. −0,3…−0,5),
// porównujemy wartości bezwzględne w kierunku celu.
export function paceStatus(v, trend, goal) {
  if (v === null || v === undefined) return null;
  if (!goal) return Math.abs(v) < MIN_PACE ? 'flat' : null;
  const dir = goalDirection(trend, goal);
  if (dir === 0) return 'in_goal';
  if (Math.abs(v) < MIN_PACE) return 'flat';
  if (Math.sign(v) !== dir) return 'wrong_way';
  const lo = Math.min(Math.abs(goal.pace_min_kg_week), Math.abs(goal.pace_max_kg_week));
  const hi = Math.max(Math.abs(goal.pace_min_kg_week), Math.abs(goal.pace_max_kg_week));
  const speed = Math.abs(v);
  if (speed < lo) return 'too_slow';
  if (speed > hi) return 'too_fast';
  return 'on_pace';
}

// MC-21/MC-22: dni do celu = |trend − granica celu| / (|v| / 7),
// tylko gdy tempo prowadzi do celu i |v| ≥ 0,05 kg/tydz. Nigdy nie zwraca daty z przeszłości.
export function forecast(series, v, goal, todayKey) {
  const last = series.at(-1);
  if (!last || !goal) return null;
  const dir = goalDirection(last.trend, goal);
  if (dir === 0) return { status: 'in_goal' };
  if (v === null || Math.abs(v) < MIN_PACE || Math.sign(v) !== dir) return { status: 'unreachable' };
  const target = dir < 0 ? goal.target_max_kg : goal.target_min_kg;
  const days = Math.ceil(Math.abs(last.trend - target) / (Math.abs(v) / 7));
  const day = last.day + days;
  const today = dayNumber(todayKey);
  if (day < today) return { status: 'stale' };
  return {
    status: 'date',
    date: keyFromDayNumber(day),
    daysFromToday: day - today,
    days,
    target,
    from: { date: last.date, day: last.day, trend: last.trend },
  };
}

// MC-23: zastój – trend zmienił się o mniej niż 0,2 kg w ostatnich 14 dniach.
// Wymaga historii sięgającej co najmniej 14 dni wstecz.
export function isPlateau(series, days = PLATEAU_DAYS, kg = PLATEAU_KG) {
  const last = series.at(-1);
  if (!last) return false;
  const before = trendAt(series, keyFromDayNumber(last.day - days));
  return !!before && Math.abs(last.trend - before.trend) < kg;
}

// MC-05: błąd przy wartości spoza zakresu, ostrzeżenie przy skoku ponad 2 kg wobec trendu.
export function validateWeight(kg, trend) {
  if (!Number.isFinite(kg) || kg < WEIGHT_MIN || kg > WEIGHT_MAX) {
    return { error: `Waga musi mieścić się w zakresie ${WEIGHT_MIN}–${WEIGHT_MAX} kg` };
  }
  if (trend !== null && trend !== undefined && Math.abs(kg - trend) > JUMP_WARN_KG) {
    return { warning: Math.abs(kg - trend) };
  }
  return {};
}
