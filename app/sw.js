// Service worker: aplikacja działa offline. Strategia "najpierw sieć",
// więc po zmianie kodu wystarczy odświeżyć stronę, a cache to tylko zapas.
const CACHE = 'climbphone-v2';
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
  'js/journal.js',
  'js/ascents.js',
  'js/import8a.js',
  'js/plans.js',
  'js/settings.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
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

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true }))
        || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
  );
});
