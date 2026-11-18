// Tryb prób wspinaczkowych (Etap 2): stoper próby i przerwy. Czyste funkcje, bez DOM (testy: tests/attempts.test.mjs).
//
// Próba: { climb_s, rest_s, sent }  – rest_s to odpoczynek PO próbie (ostatnia próba: do końca sesji albo 0).
// Sesja w dzienniku: attempts: [...], attempt_mode: 'arc' | '4x4' | 'boulder' | 'routes'

export const MODES = [
  { id: 'boulder', label: 'Bouldering – próby', type: 'Bouldering', hint: 'Każda próba to jeden boulder; zaznacz, czy przeszedłeś.' },
  { id: 'routes', label: 'Drogi z liną', type: 'Wspinanie z liną', hint: 'Próba = droga od wstawienia do zjazdu.' },
  { id: '4x4', label: '4×4', type: 'Bouldering', hint: 'Próba = seria 4 boulderów pod rząd; przerwa między seriami 3–4 min.' },
  { id: 'arc', label: 'ARC / ciągłe wspinanie', type: 'Wytrzymałość / ARC', hint: 'Próba = jeden blok ciągłego wspinania (np. 20 min).' },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

// Czas w sekundach jako m:ss albo h:mm:ss.
export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function attemptsSummary(attempts) {
  const n = attempts.length;
  const climb = attempts.reduce((t, a) => t + a.climb_s, 0);
  const rest = attempts.reduce((t, a) => t + (a.rest_s || 0), 0);
  const sent = attempts.filter((a) => a.sent).length;
  return {
    count: n,
    sent,
    climb_s: climb,
    rest_s: rest,
    avg_climb_s: n ? Math.round(climb / n) : 0,
    // Stosunek pracy do odpoczynku, np. 1:2 – pomaga ocenić, czy przerwy są zgodne z celem treningu.
    ratio: climb && rest ? Math.round((rest / climb) * 10) / 10 : null,
  };
}

// Polska odmiana: 1 próba, 2–4 próby, 5+ prób (12–14 też „prób”).
export const pl = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export function summaryText(attempts, modeId) {
  const s = attemptsSummary(attempts);
  const parts = [`${modeById(modeId).label}: ${s.count} ${pl(s.count, 'próba', 'próby', 'prób')}`];
  if (modeId === 'boulder' || modeId === 'routes') parts.push(`${s.sent} ${pl(s.sent, 'przejście', 'przejścia', 'przejść')}`);
  parts.push(`wspinanie ${fmtClock(s.climb_s)}`, `odpoczynek ${fmtClock(s.rest_s)}`);
  if (s.count) parts.push(`śr. próba ${fmtClock(s.avg_climb_s)}`);
  if (s.ratio !== null) parts.push(`praca : odpoczynek 1 : ${String(s.ratio).replace('.', ',')}`);
  return parts.join(' · ');
}

// Czas sesji w minutach (zaokrąglony w górę, co najmniej 1).
export const sessionMinutes = (startedAt, endedAt) => Math.max(1, Math.ceil((endedAt - startedAt) / 60000));
