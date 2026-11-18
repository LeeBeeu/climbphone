// Service worker: aplikacja działa offline. Strategia "najpierw sieć",
// więc po zmianie kodu wystarczy odświeżyć stronę, a cache to tylko zapas.
// Przy każdej publikacji podbij VERSION – telefon pobierze nowe pliki i pokaże pasek „Jest nowa wersja”.
const VERSION = 'v20';
const CACHE = `climbphone-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/ui.js',
  'js/grades.js',
  'js/timer.js',
  'js/weight.js',
  'js/weight-calc.js',
  'js/weight-csv.js',
  'js/load-calc.js',
  'js/exercises.js',
  'js/tests.js',
  'js/tests-calc.js',
  'js/plan-calc.js',
  'js/backup.js',
  'js/backup-calc.js',
  'js/checkin.js',
  'js/checkin-calc.js',
  'js/analytics.js',
  'js/analytics-calc.js',
  'js/library.js',
  'js/library-calc.js',
  'js/library-data.js',
  'js/library-tags.js',
  'js/attempts.js',
  'js/attempts-calc.js',
  'js/calendar-calc.js',
  'js/profile-calc.js',
  'js/weight-stats.js',
  'js/journal.js',
  'js/ascents.js',
  'js/import8a.js',
  'js/plans.js',
  'js/settings.js',
  'js/help.js',
  'js/session.js',
  'js/session-calc.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});

self.addEventListener('install', (event) => {
  // cache: 'reload' – świeże pliki z serwera, nie z pamięci podręcznej przeglądarki.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // GitHub Pages wysyła Cache-Control: max-age=600, więc zwykły fetch przez 10 minut zwracałby starą wersję
  // z pamięci przeglądarki. 'no-cache' zawsze pyta serwer (gdy plik się nie zmienił, odpowiedź 304 jest mała).
  const fresh = request.mode === 'navigate'
    ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(request, { cache: 'no-cache' });
  event.respondWith(
    fetch(fresh)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true }))
        || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
  );
});
