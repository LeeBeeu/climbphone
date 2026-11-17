import { renderWeight } from './weight.js';
import { renderTimer } from './timer.js';
import { renderJournal } from './journal.js';
import { renderAscents } from './ascents.js';
import { renderPlans } from './plans.js';
import { renderTests } from './tests.js';
import { renderAnalytics } from './analytics.js';
import { renderSettings } from './settings.js';
import { pwa } from './ui.js';

const routes = {
  waga: { title: 'Masa ciała', render: renderWeight },
  timer: { title: 'Timer chwytotablicy', render: renderTimer },
  dziennik: { title: 'Dziennik treningów', render: renderJournal },
  testy: { title: 'Testy siły', render: renderTests },
  przejscia: { title: 'Przejścia', render: renderAscents, wide: true },
  plany: { title: 'Plany treningowe', render: renderPlans },
  analityka: { title: 'Analityka', render: renderAnalytics, tab: 'plany' },
  ustawienia: { title: 'Ustawienia', render: renderSettings },
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
}

window.addEventListener('hashchange', navigate);
navigate();

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
