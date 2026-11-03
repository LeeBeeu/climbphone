import { renderTimer } from './timer.js';
import { renderJournal } from './journal.js';
import { renderAscents } from './ascents.js';
import { renderPlans } from './plans.js';
import { renderSettings } from './settings.js';
import { pwa } from './ui.js';

const routes = {
  timer: { title: 'Timer chwytotablicy', render: renderTimer },
  dziennik: { title: 'Dziennik treningów', render: renderJournal },
  przejscia: { title: 'Przejścia', render: renderAscents, wide: true },
  plany: { title: 'Plany treningowe', render: renderPlans },
  ustawienia: { title: 'Ustawienia', render: renderSettings },
};

const view = document.getElementById('view');
let cleanup = null;

function navigate() {
  const name = location.hash.replace(/^#\/?/, '');
  const key = routes[name] ? name : 'timer';
  const route = routes[key];

  cleanup?.();
  view.innerHTML = '';
  view.classList.toggle('wide', !!route.wide);
  document.getElementById('title').textContent = route.title;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === key));
  cleanup = route.render(view) || null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navigate);
navigate();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwa.installPrompt = e;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}
// Prośba, by przeglądarka nie czyściła danych przy braku miejsca.
navigator.storage?.persist?.();
