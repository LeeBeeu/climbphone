import { renderWeight } from './weight.js';
import { renderTimer } from './timer.js';
import { renderJournal } from './journal.js';
import { renderAscents } from './ascents.js';
import { renderPlans } from './plans.js';
import { renderTests } from './tests.js';
import { renderAnalytics } from './analytics.js';
import { renderLibrary } from './library.js';
import { renderAttempts } from './attempts.js';
import { renderSettings } from './settings.js';
import { renderHelp } from './help.js';
import { pwa } from './ui.js';
import { RESUME_MAX_MS } from './timer.js';

const routes = {
  waga: { title: 'Masa ciała', render: renderWeight },
  timer: { title: 'Timer chwytotablicy', render: renderTimer },
  dziennik: { title: 'Dziennik treningów', render: renderJournal },
  testy: { title: 'Testy siły', render: renderTests },
  przejscia: { title: 'Przejścia', render: renderAscents, wide: true },
  plany: { title: 'Plany treningowe', render: renderPlans },
  analityka: { title: 'Analityka', render: renderAnalytics, tab: 'plany' },
  biblioteka: { title: 'Biblioteka ćwiczeń', render: renderLibrary, tab: 'plany' },
  proby: { title: 'Próby na ścianie', render: renderAttempts, tab: 'timer' },
  ustawienia: { title: 'Ustawienia', render: renderSettings },
  pomoc: { title: 'Pomoc', render: renderHelp, tab: 'pomoc' },
};

const view = document.getElementById('view');
let cleanup = null;

function navigate() {
  const name = location.hash.replace(/^#\/?/, '');
  const key = routes[name] ? name : 'waga';
  const route = routes[key];

  cleanup?.();
  view.innerHTML = '';
  view.classList.toggle('wide', !!route.wide);
  document.getElementById('title').textContent = route.title;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (route.tab || key)));
  cleanup = route.render(view) || null;
  window.scrollTo(0, 0);
  try { localStorage.setItem(UI_KEY, JSON.stringify({ route: key, at: Date.now() })); } catch { /* brak pamięci */ }
}

// NF-05: po ponownym otwarciu wracamy do ostatniego ekranu, jeśli od wyjścia minęło mniej niż 30 min,
// a do timera – gdy jest przerwany trening do wznowienia. Inaczej start na ekranie Waga (poranne ważenie).
const UI_KEY = 'climbphone.ui';
const RESTORE_MS = 30 * 60 * 1000;
function restoreRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash && hash !== 'waga') return; // ktoś otworzył konkretny adres
  try {
    const run = JSON.parse(localStorage.getItem('climbphone.run') || 'null');
    if (run && Date.now() - run.savedAt < RESUME_MAX_MS) return location.replace('#/timer');
    const att = JSON.parse(localStorage.getItem('climbphone.attempts') || 'null');
    if (att && !att.endedAt && Date.now() - att.savedAt < 6 * 60 * 60 * 1000) return location.replace('#/proby');
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (ui && routes[ui.route] && ui.route !== 'waga' && Date.now() - ui.at < RESTORE_MS) location.replace(`#/${ui.route}`);
  } catch { /* brak pamięci – zostajemy na starcie */ }
}

restoreRoute();
window.addEventListener('hashchange', navigate);
navigate();

// Czas ostatniej aktywności odświeżamy przy wyjściu z aplikacji (liczy się od zamknięcia, nie od wejścia na ekran).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (ui) localStorage.setItem(UI_KEY, JSON.stringify({ ...ui, at: Date.now() }));
  } catch { /* brak pamięci */ }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwa.installPrompt = e;
});

// Aktualizacje: nowy service worker przejmuje stronę od razu (skipWaiting), ale otwarta strona dalej
// działa na starym kodzie. Zamiast przeładowywać bez pytania (np. w trakcie timera) pokazujemy pasek.
function showUpdateBar() {
  if (document.getElementById('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.innerHTML = '<span>Jest nowa wersja aplikacji.</span><button class="btn small primary">Odśwież</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.append(bar);
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller; // przy pierwszej instalacji paska nie pokazujemy
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBar(); });
  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      pwa.registration = reg;
      // Zainstalowana aplikacja bywa tygodniami „otwarta” w tle – sprawdzamy aktualizację przy każdym powrocie.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker:', err));
}
// Prośba, by przeglądarka nie czyściła danych przy braku miejsca.
navigator.storage?.persist?.();
