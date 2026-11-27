// Synchronizacja z Firebase (Firestore + logowanie Google). Dane zostają w telefonie (localStorage) –
// chmura to kopia i most między urządzeniami. Logika łączenia: sync-calc.js; instrukcja: docs/firebase.md.
//
// Firestore: users/{uid}/records/{kolekcja~id} = { col, id, deleted, json, updatedAt, device, server }
//   updatedAt – czas zmiany z urządzenia (rozstrzyga konflikty), server – czas zapisu w chmurze (kursor pobierania).
import { firebaseConfig } from './firebase-config.js';
import { getState, update, onChange, uid } from './store.js';
import {
  diff, markDirty, toRecords, toDoc, applyRemote, ensureIds, hashAll, hasUserData, clearData,
} from './sync-calc.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const META_KEY = 'climbphone.sync';      // { uid, email, hashes, dirty, cursor, lastSync }
const REDIRECT_KEY = 'climbphone.sync.redirect';
const BATCH = 400;                        // Firestore: do 500 operacji w paczce

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* brak miejsca */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* brak pamięci */ } },
};

function deviceId() {
  let id = ls.get('climbphone.device');
  if (!id) { id = uid(); ls.set('climbphone.device', id); }
  return id;
}

let meta = ls.get(META_KEY);
const saveMeta = () => (meta ? ls.set(META_KEY, meta) : ls.del(META_KEY));

// ---------- Stan dla ekranu Ustawień ----------

const status = { state: 'off', error: '', email: meta?.email || '' };
const statusListeners = new Set();
export function onSyncStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(patch) {
  Object.assign(status, patch);
  statusListeners.forEach((fn) => fn());
}
export function syncStatus() {
  return {
    configured: isConfigured(),
    signedIn: !!meta?.uid,
    email: meta?.email || status.email,
    state: status.state,        // off | connecting | synced | pending | offline | error | signedout
    error: status.error,
    pending: meta ? Object.keys(meta.dirty || {}).length : 0,
    lastSync: meta?.lastSync || null,
  };
}

// ---------- Wykrywanie lokalnych zmian (działa także bez internetu i bez załadowanego Firebase) ----------

onChange((source) => {
  if (!meta?.uid || source === 'remote') return;
  const d = diff(meta.hashes || {}, getState());
  if (!d.changed.length && !d.deleted.length) return;
  meta.dirty = markDirty(meta.dirty || {}, d, Date.now());
  meta.hashes = d.hashes;
  saveMeta();
  if (status.state === 'synced') setStatus({ state: 'pending' });
  schedulePush();
});

// ---------- Firebase ----------

let fb = null;
async function loadFirebase() {
  if (fb) return fb;
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  // Własna nazwa aplikacji – na tej samej domenie działa też inna aplikacja z Firebase (Rachunki).
  const app = initializeApp(firebaseConfig, 'climbphone');
  const a = auth.getAuth(app);
  a.languageCode = 'pl';
  const db = fs.getFirestore(app);
  fb = { auth, fs, a, db };
  return fb;
}

const recordsCol = () => fb.fs.collection(fb.db, 'users', meta.uid, 'records');

let unsubSnap = null;
let unsubAuth = null;

/** Start aplikacji: jeśli na tym urządzeniu włączono synchronizację, łączymy się w tle. */
export async function initSync() {
  if (!isConfigured()) return;
  if (!meta?.uid && !ls.get(REDIRECT_KEY)) { setStatus({ state: 'signedout' }); return; }
  setStatus({ state: 'connecting' });
  try {
    await loadFirebase();
  } catch {
    setStatus({ state: 'offline' }); // brak internetu przy starcie – zmiany czekają w kolejce
    window.addEventListener('online', () => initSync(), { once: true });
    return;
  }
  fb.auth.getRedirectResult(fb.a).catch((e) => setStatus({ state: 'error', error: authError(e) }));
  unsubAuth?.();
  unsubAuth = fb.auth.onAuthStateChanged(fb.a, (user) => handleUser(user));
}

async function handleUser(user) {
  ls.del(REDIRECT_KEY);
  if (!user) {
    stopListening();
    setStatus({ state: 'signedout', error: meta?.uid ? 'Sesja wygasła – zaloguj się ponownie.' : '' });
    return;
  }
  if (meta?.uid === user.uid) { meta.email = user.email; saveMeta(); startSync(); return; }
  await firstLogin(user);
}

export async function signIn() {
  if (!isConfigured()) return;
  setStatus({ state: 'connecting', error: '' });
  try {
    await loadFirebase();
  } catch {
    setStatus({ state: 'offline', error: 'Brak połączenia z internetem.' });
    return;
  }
  if (!unsubAuth) unsubAuth = fb.auth.onAuthStateChanged(fb.a, (user) => handleUser(user));
  const provider = new fb.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.auth.signInWithPopup(fb.a, provider);
  } catch (e) {
    // Zainstalowana aplikacja na niektórych telefonach blokuje okienka – wtedy przekierowanie.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      ls.set(REDIRECT_KEY, 1);
      await fb.auth.signInWithRedirect(fb.a, provider);
    } else if (e.code === 'auth/popup-closed-by-user') {
      setStatus({ state: 'signedout' });
    } else {
      setStatus({ state: 'error', error: authError(e) });
    }
  }
}

export async function signOut() {
  const pending = meta ? Object.keys(meta.dirty || {}).length : 0;
  if (pending && !confirm(`${pending} zmian nie zostało jeszcze wysłanych do chmury. Wylogować mimo to?\nDane na tym urządzeniu zostają.`)) return;
  stopListening();
  meta = null;
  saveMeta();
  if (fb) await fb.auth.signOut(fb.a).catch(() => {});
  setStatus({ state: 'signedout', error: '', email: '' });
}

export function syncNow() {
  if (!meta?.uid) return;
  if (!fb) { initSync(); return; }
  if (!unsubSnap) startSync(); else schedulePush(0);
}

// ---------- Pierwsze logowanie na tym urządzeniu ----------

async function firstLogin(user) {
  update((s) => { ensureIds(s, uid); }, { source: 'remote' });
  let remoteHas = false;
  try {
    const snap = await fb.fs.getDocs(fb.fs.query(fb.fs.collection(fb.db, 'users', user.uid, 'records'), fb.fs.limit(1)));
    remoteHas = !snap.empty;
  } catch (e) {
    setStatus({ state: 'error', error: fsError(e) });
    return;
  }
  const localHas = hasUserData(getState());
  let mode = 'upload';
  if (remoteHas && localHas) {
    mode = await askFirstLogin(user.email);
    if (mode === 'cancel') { await fb.auth.signOut(fb.a).catch(() => {}); setStatus({ state: 'signedout' }); return; }
  } else if (remoteHas) {
    mode = 'download';
  }
  if (mode === 'replace') update((s) => clearData(s), { source: 'remote' });
  const keys = Object.keys(toRecords(getState()));
  meta = {
    uid: user.uid,
    email: user.email,
    hashes: hashAll(getState()),
    // „Połącz”: lokalne wpisy idą do chmury, ale przy tym samym wpisie wygrywa wersja z chmury (czas 1).
    dirty: Object.fromEntries(mode === 'upload' ? keys.map((k) => [k, Date.now()]) : mode === 'merge' ? keys.map((k) => [k, 1]) : []),
    cursor: 0,
    lastSync: null,
  };
  saveMeta();
  window.dispatchEvent(new Event('climbphone:remote'));
  startSync();
}

// Okno wyboru: połączyć dane czy zastąpić danymi z chmury. Zwraca 'merge' | 'replace' | 'cancel'.
function askFirstLogin(email) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `
      <div class="card modal-card" role="dialog" aria-modal="true" aria-labelledby="syncAskTitle">
        <h2 id="syncAskTitle">W chmurze są już dane</h2>
        <p>Konto <strong>${String(email || '').replace(/[<>&"]/g, '')}</strong> ma już zapisane dane z innego urządzenia, a to urządzenie też ma swoje.</p>
        <button class="btn primary big" data-m="merge">🔀 Połącz</button>
        <p class="muted">Wpisy z obu urządzeń zostają. Gdy ten sam wpis jest w obu miejscach – wygrywa wersja z chmury.</p>
        <button class="btn big" data-m="replace">☁️ Zastąp danymi z chmury</button>
        <p class="muted">Dane na tym urządzeniu znikną i zostaną zastąpione danymi z chmury (np. gdy tu były tylko testy).</p>
        <button class="btn ghost" data-m="cancel">Anuluj logowanie</button>
      </div>`;
    box.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      if (m === 'replace' && !confirm('Na pewno usunąć dane z tego urządzenia i pobrać dane z chmury?')) return;
      box.remove();
      resolve(m);
    });
    document.body.append(box);
  });
}

// ---------- Pobieranie (na żywo) i wysyłanie ----------

function stopListening() {
  unsubSnap?.();
  unsubSnap = null;
}

// Wysyłamy dopiero po pierwszym pełnym pobraniu z chmury – inaczej przy „Połącz” lokalna wersja
// wpisu mogłaby nadpisać nowszą wersję z chmury, zanim zdążymy ją pobrać.
let pulled = false;

function startSync() {
  stopListening();
  pulled = false;
  setStatus({ state: 'connecting', error: '', email: meta.email });
  const { fs } = fb;
  const q = meta.cursor
    ? fs.query(recordsCol(), fs.where('server', '>', fs.Timestamp.fromMillis(meta.cursor)), fs.orderBy('server'))
    : fs.query(recordsCol(), fs.orderBy('server'));
  unsubSnap = fs.onSnapshot(q, (snap) => {
    const docs = snap.docChanges()
      .filter((ch) => ch.type !== 'removed' && !ch.doc.metadata.hasPendingWrites)
      .map((ch) => ch.doc.data());
    if (docs.length) {
      let res;
      update((s) => { res = applyRemote(s, docs, meta); }, { source: 'remote' });
      meta.hashes = res.hashes;
      meta.dirty = res.dirty;
      for (const d of docs) if (d.server) meta.cursor = Math.max(meta.cursor || 0, d.server.toMillis());
      saveMeta();
      if (res.applied) window.dispatchEvent(new Event('climbphone:remote'));
    }
    if (!snap.metadata.fromCache) {
      meta.lastSync = Date.now();
      saveMeta();
      setStatus({ state: Object.keys(meta.dirty).length ? 'pending' : 'synced', error: '' });
      if (!pulled) { pulled = true; schedulePush(0); }
    }
  }, (e) => setStatus({ state: 'error', error: fsError(e) }));
}

let pushTimer = null;
let pushing = false;
function schedulePush(ms = 1500) {
  if (!fb || !meta?.uid) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, ms);
}
window.addEventListener('online', () => schedulePush(0));

async function push() {
  if (pushing || !meta?.uid || !fb || !pulled) return;
  const keys = Object.keys(meta.dirty || {});
  if (!keys.length) return;
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  pushing = true;
  setStatus({ state: 'pending' });
  const { fs, db } = fb;
  const records = toRecords(getState());
  const device = deviceId();
  try {
    for (let i = 0; i < keys.length; i += BATCH) {
      const part = keys.slice(i, i + BATCH);
      const sent = Object.fromEntries(part.map((k) => [k, meta.dirty[k]]));
      const batch = fs.writeBatch(db);
      for (const k of part) {
        batch.set(fs.doc(recordsCol(), k), { ...toDoc(k, records, sent[k], device), server: fs.serverTimestamp() });
      }
      await batch.commit();
      // Zdejmujemy z kolejki tylko to, co nie zmieniło się w trakcie wysyłania.
      for (const k of part) if (meta.dirty[k] === sent[k]) delete meta.dirty[k];
      saveMeta();
    }
    meta.lastSync = Date.now();
    saveMeta();
    setStatus({ state: Object.keys(meta.dirty).length ? 'pending' : 'synced', error: '' });
  } catch (e) {
    setStatus({ state: 'error', error: fsError(e) });
    if (e?.code === 'unavailable' || e?.code === 'deadline-exceeded') setTimeout(() => schedulePush(0), 15000); // ponów później
  } finally {
    pushing = false;
    if (meta && Object.keys(meta.dirty || {}).length && status.state !== 'error') schedulePush(3000);
  }
}

// ---------- Komunikaty błędów ----------

function authError(e) {
  const map = {
    'auth/unauthorized-domain': 'Ta domena nie jest dozwolona w Firebase (Authentication → Settings → Authorized domains).',
    'auth/network-request-failed': 'Brak połączenia z internetem.',
    'auth/operation-not-allowed': 'Logowanie Google nie jest włączone w Firebase (Authentication → Sign-in method).',
  };
  return map[e?.code] || `Logowanie nie powiodło się (${e?.code || e?.message || 'nieznany błąd'}).`;
}
function fsError(e) {
  if (e?.code === 'permission-denied') return 'Brak dostępu do bazy – sprawdź reguły Firestore (plik firestore.rules).';
  if (e?.code === 'unavailable') return 'Chmura chwilowo niedostępna – spróbuję ponownie.';
  return `Błąd synchronizacji (${e?.code || e?.message || 'nieznany'}).`;
}
