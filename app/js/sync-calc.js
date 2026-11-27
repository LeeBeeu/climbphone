// Synchronizacja: stan aplikacji jako zbiór rekordów, wykrywanie zmian i łączenie ze zmianami z chmury.
// Czyste funkcje, bez DOM i bez Firebase (testy: tests/sync-calc.test.mjs).
//
// Rekord = jeden wpis z listy (trening, przejście, ważenie…) albo jeden „pojedynczy” obiekt (ustawienia,
// najbliższy trening) albo odhaczenia jednego planu w jednym tygodniu. Klucz: „kolekcja~id”.
// Zmiany wykrywamy po skrócie (hash) treści rekordu; łączenie: wygrywa nowsza zmiana (czas z urządzenia).

export const COLLECTIONS = [
  'sessions', 'ascents', 'plans', 'timerPresets', 'customExercises', 'workouts', 'checkins',
  'strengthTests', 'weightEntries', 'weightGoals', 'weightPeriods',
];
export const MAPS = ['planChecks'];            // obiekt { klucz: wartość } – każdy klucz osobnym rekordem
export const SINGLES = ['settings', 'nextSession']; // cały obiekt jako jeden rekord

const SEP = '~';
export const recordKey = (col, id) => `${col}${SEP}${encodeURIComponent(String(id))}`;
export function parseKey(key) {
  const i = key.indexOf(SEP);
  return { col: key.slice(0, i), id: decodeURIComponent(key.slice(i + 1)) };
}

// FNV-1a (32 bity) – krótki skrót do wykrywania zmian; kolizje bez znaczenia przy tej skali.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Wpisy bez id (bardzo stare dane) dostają id – inaczej nie dałoby się ich synchronizować. Zwraca liczbę uzupełnionych.
export function ensureIds(state, idFn) {
  let n = 0;
  for (const col of COLLECTIONS) for (const r of state[col] || []) if (r && r.id == null) { r.id = idFn(); n++; }
  return n;
}

// Stan → { klucz: dane rekordu }.
export function toRecords(state) {
  const out = {};
  for (const col of COLLECTIONS) for (const r of state[col] || []) if (r && r.id != null) out[recordKey(col, r.id)] = r;
  for (const col of MAPS) for (const [k, v] of Object.entries(state[col] || {})) out[recordKey(col, k)] = v;
  for (const col of SINGLES) if (state[col] != null) out[recordKey(col, col)] = state[col];
  return out;
}

export const hashOf = (data) => hash(JSON.stringify(data));

// Skróty wszystkich rekordów stanu.
export function hashAll(state) {
  const out = {};
  for (const [k, v] of Object.entries(toRecords(state))) out[k] = hashOf(v);
  return out;
}

/**
 * Co się zmieniło od ostatniego zapamiętanego stanu: { changed: [klucz], deleted: [klucz], hashes } –
 * hashes to nowe skróty (do zapamiętania). Rekordy usunięte znikają z hashes.
 */
export function diff(prevHashes, state) {
  const now = hashAll(state);
  const changed = Object.keys(now).filter((k) => prevHashes[k] !== now[k]);
  const deleted = Object.keys(prevHashes).filter((k) => !(k in now));
  return { changed, deleted, hashes: now };
}

/** Oznacza zmiany jako oczekujące na wysłanie: dirty[klucz] = czas zmiany. */
export function markDirty(dirty, { changed, deleted }, ts) {
  const out = { ...dirty };
  for (const k of [...changed, ...deleted]) out[k] = ts;
  return out;
}

/** Dokument do zapisania w chmurze dla klucza (null = usunięty). Treść jako JSON (Firestore nie zna np. tablic w tablicach). */
export function toDoc(key, records, ts, device) {
  const { col, id } = parseKey(key);
  const data = records[key];
  return data === undefined
    ? { col, id, deleted: true, json: null, updatedAt: ts, device }
    : { col, id, deleted: false, json: JSON.stringify(data), updatedAt: ts, device };
}

// Wstawia / zastępuje / usuwa jeden rekord w stanie (mutuje state).
export function putRecord(state, col, id, data) {
  if (COLLECTIONS.includes(col)) {
    const list = (state[col] ||= []);
    const i = list.findIndex((r) => String(r.id) === String(id));
    if (data == null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = data; else list.push(data);
  } else if (MAPS.includes(col)) {
    const map = (state[col] ||= {});
    if (data == null) delete map[id]; else map[id] = data;
  } else if (SINGLES.includes(col)) {
    state[col] = data == null ? (col === 'settings' ? state[col] : null) : data;
  }
}

/**
 * Łączy dokumenty z chmury ze stanem (mutuje state). Dokument wygrywa, chyba że lokalnie jest nowsza,
 * jeszcze niewysłana zmiana tego rekordu. Zwraca { applied, hashes, dirty } – zaktualizowane skróty i kolejkę.
 */
export function applyRemote(state, docs, { hashes, dirty }) {
  const h = { ...hashes };
  const d = { ...dirty };
  let applied = 0;
  for (const doc of docs) {
    if (!doc || !doc.col) continue;
    const key = recordKey(doc.col, doc.id);
    if (d[key] != null && d[key] > (doc.updatedAt || 0)) continue; // lokalna zmiana jest nowsza – wyślemy ją
    const data = doc.deleted ? null : JSON.parse(doc.json);
    const newHash = data == null ? undefined : hashOf(data);
    delete d[key];
    if (h[key] === newHash) continue; // to samo (np. nasz własny zapis wrócił z chmury)
    putRecord(state, doc.col, doc.id, data);
    if (newHash === undefined) delete h[key]; else h[key] = newHash;
    applied++;
  }
  return { applied, hashes: h, dirty: d };
}

/** Czy stan ma jakiekolwiek dane użytkownika (do pytania przy pierwszym logowaniu). */
export const hasUserData = (state) => COLLECTIONS.some((c) => (state[c] || []).length) || Object.keys(state.planChecks || {}).length > 0;

/** Pusty stan danych (dla „Zastąp danymi z chmury”): czyści listy, odhaczenia i najbliższy trening; ustawienia zostają. */
export function clearData(state) {
  for (const c of COLLECTIONS) state[c] = [];
  for (const c of MAPS) state[c] = {};
  state.nextSession = null;
}
