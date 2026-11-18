// Rachunki – ekrany i obsługa zdarzeń.
import {
  EVERY, CATEGORIES, periodKey, currentPeriod, shiftMonth, monthItems, summary, overdueBefore,
  validateBill, formatPLN, isEmail, normalizeEmail,
} from './calc.js';
import { createStore } from './store.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
};

const now = () => new Date();
const state = {
  store: null,
  user: null,
  household: null,
  cur: { y: now().getFullYear(), m: now().getMonth() },
  bills: [],
  payments: {},
  editing: null,
  confirmDelete: false,
  unsub: [],
  unsubPayments: null,
};

const period = () => periodKey(state.cur.y, state.cur.m);
const isCurrentMonth = () => state.cur.y === now().getFullYear() && state.cur.m === now().getMonth();

/* ---------- Start ---------- */

async function init() {
  registerServiceWorker();
  fillSelects();
  bindEvents();
  try {
    state.store = await createStore();
  } catch (e) {
    console.error(e);
    return showGate('offline');
  }
  state.store.onAuth(onAuth);
}

async function onAuth(user) {
  stopWatching();
  state.user = user;
  state.household = null;
  if (!user) return showGate('login');
  try {
    const household = await state.store.findHousehold();
    if (!household) return showGate('create');
    startBoard();
  } catch (e) {
    console.error(e);
    showGate('error', e);
  }
}

/* ---------- Ekran startowy ---------- */

function showGate(kind, error) {
  $('board').hidden = true;
  $('addBtn').hidden = true;
  $('menuBtn').hidden = kind === 'login' || kind === 'offline';
  $('hhName').textContent = 'Rachunki';
  const gate = $('gate');
  gate.hidden = false;
  gate.textContent = '';
  const logo = el('img', { src: 'icons/icon.svg', alt: '', className: 'logo' });

  if (kind === 'login') {
    const btn = el('button', { className: 'primary', textContent: 'Zaloguj się przez Google' });
    const err = el('p', { className: 'err', hidden: true });
    btn.onclick = async () => {
      btn.disabled = true;
      try { await state.store.signIn(); } catch (e) { err.textContent = loginError(e); err.hidden = false; }
      btn.disabled = false;
    };
    gate.append(logo, el('h2', { textContent: 'Wspólne rachunki' }),
      el('p', { textContent: 'Zaloguj się, aby zobaczyć listę płatności Twojej rodziny i odhaczać zapłacone rachunki.' }), btn, err);
  } else if (kind === 'create') {
    const input = el('input', { id: 'hhNameInput', value: 'Nasz dom', maxLength: 40, ariaLabel: 'Nazwa listy' });
    const btn = el('button', { className: 'primary', textContent: 'Utwórz wspólną listę' });
    const err = el('p', { className: 'err', hidden: true });
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await state.store.createHousehold(input.value.trim() || 'Nasz dom');
        startBoard();
      } catch (e) {
        console.error(e);
        err.textContent = 'Nie udało się utworzyć listy. Sprawdź połączenie z internetem i reguły Firestore.';
        err.hidden = false;
      }
      btn.disabled = false;
    };
    const out = el('button', { className: 'ghost', textContent: 'Zaloguj na inne konto' });
    out.onclick = () => state.store.signOut();
    gate.append(logo, el('h2', { textContent: 'Witaj!' }),
      el('p', { textContent: `Nie należysz jeszcze do żadnej listy. Jeśli żona lub ktoś z rodziny już ją założył, poproś o dopisanie adresu ${state.user.email} w Ustawieniach → Rodzina, a potem odśwież aplikację.` }),
      el('p', { textContent: 'Możesz też założyć nową listę i zaprosić domowników:' }),
      input, btn, err, out);
  } else if (kind === 'offline') {
    const btn = el('button', { className: 'primary', textContent: 'Spróbuj ponownie' });
    btn.onclick = () => location.reload();
    gate.append(logo, el('h2', { textContent: 'Brak połączenia' }),
      el('p', { textContent: 'Przy pierwszym uruchomieniu aplikacja potrzebuje internetu. Połącz się z siecią i spróbuj ponownie.' }), btn);
  } else {
    const btn = el('button', { className: 'primary', textContent: 'Spróbuj ponownie' });
    btn.onclick = () => onAuth(state.user);
    const out = el('button', { className: 'ghost', textContent: 'Wyloguj' });
    out.onclick = () => state.store.signOut();
    gate.append(logo, el('h2', { textContent: 'Nie udało się wczytać listy' }),
      el('p', { textContent: error?.code === 'permission-denied'
        ? 'Brak dostępu. Sprawdź, czy reguły z pliku firestore.rules są opublikowane w Firebase.'
        : 'Sprawdź połączenie z internetem i spróbuj ponownie.' }), btn, out);
  }
}

function loginError(e) {
  if (e?.code === 'auth/unauthorized-domain') return 'Ten adres strony nie jest dodany w Firebase (Authentication → Settings → Authorized domains).';
  if (e?.code === 'auth/network-request-failed') return 'Brak połączenia z internetem.';
  return 'Nie udało się zalogować. Spróbuj ponownie.';
}

/* ---------- Lista ---------- */

function startBoard() {
  $('gate').hidden = true;
  $('board').hidden = false;
  $('addBtn').hidden = false;
  $('menuBtn').hidden = false;
  const s = state.store;
  const onError = (e) => {
    console.error(e);
    if (e?.code === 'permission-denied') { stopWatching(); showGate('error', e); }
  };
  state.unsub.push(s.watchHousehold((h) => {
    if (!h || (s.mode === 'cloud' && !h.members?.includes(state.user.email))) {
      // Ktoś usunął nas z listy.
      stopWatching();
      return showGate('create');
    }
    state.household = h;
    $('hhName').textContent = s.mode === 'local' ? 'Rachunki' : h.name;
    renderMenu();
  }, onError));
  state.unsub.push(s.watchBills((bills) => {
    state.bills = bills;
    render();
    renderMenu();
  }, onError));
  watchPayments();
  render();
}

function watchPayments() {
  state.unsubPayments?.();
  const from = shiftMonth(state.cur, -6);
  state.unsubPayments = state.store.watchPayments(periodKey(from.y, from.m), period(), (p) => {
    state.payments = p;
    render();
  }, (e) => console.error(e));
}

function stopWatching() {
  state.unsub.forEach((fn) => fn());
  state.unsub = [];
  state.unsubPayments?.();
  state.unsubPayments = null;
  state.bills = [];
  state.payments = {};
}

function render() {
  if ($('board').hidden) return;
  const p = period();
  $('monthLabel').textContent = new Date(state.cur.y, state.cur.m, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

  const forMonth = {};
  for (const pay of Object.values(state.payments)) if (pay.period === p) forMonth[pay.billId] = pay;
  const items = monthItems(state.bills, forMonth, p, now());
  const sum = summary(items);
  $('sTotal').textContent = formatPLN(sum.total);
  $('sPaid').textContent = formatPLN(sum.paid);
  $('sLeft').textContent = formatPLN(sum.left);
  $('progress').style.width = `${sum.count ? (sum.paidCount / sum.count) * 100 : 0}%`;
  $('bar').setAttribute('aria-valuenow', String(sum.paidCount));
  $('bar').setAttribute('aria-valuemax', String(sum.count));

  renderOverdue();

  const groups = $('groups');
  groups.textContent = '';
  if (state.store.mode === 'local') {
    groups.append(el('p', { className: 'notice', textContent: 'Tryb lokalny: dane są tylko na tym urządzeniu. Aby dzielić listę z rodziną, podłącz Firebase (instrukcja w README).' }));
  }
  if (!items.length) {
    groups.append(el('div', { className: 'empty', textContent: state.bills.length
      ? 'W tym miesiącu nie ma zaplanowanych płatności.'
      : 'Lista jest pusta. Dodaj pierwszą płatność, np. wodę, prąd albo czynsz. Pojawi się w każdym miesiącu, w którym trzeba ją zapłacić.' }));
    return;
  }
  const sections = [['late', 'Po terminie'], ['soon', 'Termin w ciągu 3 dni'], ['todo', 'Do zapłaty'], ['paid', 'Zapłacone']];
  for (const [status, title] of sections) {
    const list = items.filter((i) => i.status === status);
    if (!list.length) continue;
    groups.append(el('section', { className: 'group' },
      el('h2', { textContent: `${title} · ${list.length}` }),
      el('div', { className: 'list' }, ...list.map((i) => billRow(i, p)))));
  }
}

function billRow(item, p) {
  const { bill, payment, due, days, status } = item;
  const check = el('button', {
    className: 'check', textContent: '✓',
    ariaLabel: `${payment ? 'Cofnij zapłatę' : 'Oznacz jako zapłacone'}: ${bill.name}`,
  });
  check.setAttribute('aria-pressed', String(!!payment));
  check.onclick = () => togglePaid(bill, p, !!payment);

  const dd = due.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  let pill;
  if (payment) {
    const when = new Date(payment.paidAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    pill = el('span', { className: 'pill paid', textContent: `Zapłacone ${when}${payment.paidByName ? ` · ${firstName(payment.paidByName)}` : ''}` });
  } else if (status === 'late') {
    pill = el('span', { className: 'pill late', textContent: `Termin minął ${dd} (${-days} dn.)` });
  } else if (status === 'soon') {
    pill = el('span', { className: 'pill soon', textContent: days === 0 ? 'Termin dziś!' : days === 1 ? `Termin jutro, ${dd}` : `Termin ${dd}` });
  } else {
    pill = el('span', { textContent: `Termin ${dd}` });
  }
  const info = el('div', { className: 'info', role: 'button', tabIndex: 0, ariaLabel: `Edytuj: ${bill.name}` },
    el('div', { className: 'name', textContent: bill.name }),
    el('div', { className: 'meta' }, pill, el('span', { textContent: bill.category }),
      bill.note ? el('span', { className: 'note', textContent: bill.note }) : null));
  info.onclick = () => openBillForm(bill);
  info.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBillForm(bill); } };
  const amount = payment && payment.amount !== bill.amount ? payment.amount : bill.amount;
  return el('div', { className: `bill ${status}` }, check, info, el('div', { className: 'amt', textContent: amount ? formatPLN(amount) : '—' }));
}

function renderOverdue() {
  const box = $('overdue');
  box.textContent = '';
  if (!isCurrentMonth()) return;
  const paidKeys = new Set(Object.keys(state.payments));
  const list = overdueBefore(state.bills, paidKeys, period(), now());
  if (!list.length) return;
  box.append(el('div', { className: 'overdue' },
    el('h2', { textContent: `Niezapłacone z poprzednich miesięcy · ${list.length}` }),
    ...list.map(({ bill, period: p, due }) => {
      const btn = el('button', { textContent: 'Zapłacone' });
      btn.onclick = () => togglePaid(bill, p, false);
      return el('div', { className: 'item' },
        el('span', { textContent: `${bill.name} – ${due.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}${bill.amount ? `, ${formatPLN(bill.amount)}` : ''}` }), btn);
    })));
}

async function togglePaid(bill, p, isPaid) {
  try {
    if (isPaid) {
      await state.store.unmarkPaid(bill.id, p);
      toast(`Cofnięto: ${bill.name}`);
    } else {
      await state.store.markPaid(bill, p);
      toast(`Zapłacone: ${bill.name}`, 'Cofnij', () => state.store.unmarkPaid(bill.id, p));
    }
  } catch (e) {
    console.error(e);
    toast('Nie udało się zapisać. Spróbuj ponownie.');
  }
}

const firstName = (name) => String(name).split(/[\s@]/)[0];

/* ---------- Formularz płatności ---------- */

function fillSelects() {
  $('fEvery').append(...EVERY.map((e) => el('option', { value: String(e.value), textContent: e.label })));
  $('fCat').append(...CATEGORIES.map((c) => el('option', { value: c, textContent: c })));
}

function openBillForm(bill) {
  state.editing = bill || null;
  state.confirmDelete = false;
  $('formTitle').textContent = bill ? 'Edytuj płatność' : 'Nowa płatność';
  $('fName').value = bill?.name ?? '';
  $('fAmount').value = bill?.amount ? String(bill.amount).replace('.', ',') : '';
  $('fDay').value = bill?.day ?? 10;
  $('fEvery').value = String(bill?.every ?? 1);
  $('fCat').value = bill?.category ?? 'Media';
  $('fStart').value = bill?.start ?? period();
  $('fEnd').value = bill?.end ?? '';
  $('fNote').value = bill?.note ?? '';
  $('delBtn').hidden = !bill;
  $('delBtn').textContent = 'Usuń';
  $('fErr').hidden = true;
  $('menuSheet').hidden = true;
  $('billSheet').hidden = false;
  if (!bill) $('fName').focus();
}

async function saveBill(e) {
  e.preventDefault();
  const { bill, error } = validateBill({
    name: $('fName').value, amount: $('fAmount').value, day: $('fDay').value, every: $('fEvery').value,
    category: $('fCat').value, start: $('fStart').value, end: $('fEnd').value, note: $('fNote').value,
  });
  if (error) return formError(error);
  $('saveBtn').disabled = true;
  try {
    if (state.editing) await state.store.updateBill(state.editing.id, bill);
    else await state.store.addBill({ ...bill, trackFrom: currentPeriod() });
    $('billSheet').hidden = true;
    toast(state.editing ? 'Zapisano zmiany' : `Dodano: ${bill.name}`);
  } catch (err) {
    console.error(err);
    formError('Nie udało się zapisać. Sprawdź połączenie i spróbuj ponownie.');
  }
  $('saveBtn').disabled = false;
}

async function deleteBill() {
  if (!state.confirmDelete) {
    state.confirmDelete = true;
    $('delBtn').textContent = 'Na pewno usunąć?';
    return;
  }
  try {
    await state.store.deleteBill(state.editing.id);
    $('billSheet').hidden = true;
    toast(`Usunięto: ${state.editing.name}`);
  } catch (err) {
    console.error(err);
    formError('Nie udało się usunąć. Spróbuj ponownie.');
  }
}

function formError(text) {
  $('fErr').textContent = text;
  $('fErr').hidden = false;
}

/* ---------- Menu ---------- */

function renderMenu() {
  const s = state.store;
  const h = state.household;
  const local = s?.mode === 'local';
  $('familyBlock').hidden = local;
  if (h && !local) {
    $('members').textContent = '';
    for (const email of h.members || []) {
      const li = el('li', {}, el('span', { textContent: email + (email === h.ownerEmail ? ' (założyciel)' : email === state.user?.email ? ' (Ty)' : '') }));
      if (email !== h.ownerEmail && email !== state.user?.email) {
        const rm = el('button', { className: 'danger', textContent: 'Usuń' });
        rm.onclick = async () => {
          if (rm.dataset.confirm) {
            try { await s.removeMember(email); } catch (e) { console.error(e); memberError('Nie udało się usunąć osoby.'); }
          } else { rm.dataset.confirm = '1'; rm.textContent = 'Na pewno?'; }
        };
        li.append(rm);
      }
      $('members').append(li);
    }
  }
  const all = [...state.bills].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  $('allBills').textContent = '';
  if (!all.length) $('allBills').append(el('li', { className: 'hint', textContent: 'Brak płatności.' }));
  for (const b of all) {
    const every = EVERY.find((e) => e.value === Number(b.every))?.label ?? '';
    const edit = el('button', { textContent: 'Edytuj' });
    edit.onclick = () => openBillForm(b);
    $('allBills').append(el('li', {}, el('span', {},
      b.name, el('small', { textContent: `${b.amount ? formatPLN(b.amount) : 'bez kwoty'} · ${b.day}. dnia · ${every}${b.end ? ` · do ${b.end}` : ''}` })), edit));
  }
  $('accountInfo').textContent = local
    ? 'Tryb lokalny: dane są zapisane tylko w tej przeglądarce.'
    : `Zalogowano jako ${state.user?.name ?? ''} (${state.user?.email ?? ''}).`;
  $('signOutBtn').hidden = local;
}

async function addMember(e) {
  e.preventDefault();
  const email = normalizeEmail($('memberEmail').value);
  if (!isEmail(email)) return memberError('Wpisz poprawny adres e-mail.');
  if (state.household?.members?.includes(email)) return memberError('Ta osoba już jest na liście.');
  try {
    await state.store.addMember(email);
    $('memberEmail').value = '';
    $('memberErr').hidden = true;
    toast(`Dodano ${email}. Niech zainstaluje aplikację i zaloguje się tym kontem Google.`);
  } catch (err) {
    console.error(err);
    memberError('Nie udało się dodać osoby. Sprawdź połączenie.');
  }
}

function memberError(text) {
  $('memberErr').textContent = text;
  $('memberErr').hidden = false;
}

/* ---------- Zdarzenia ---------- */

function bindEvents() {
  $('prev').onclick = () => changeMonth(-1);
  $('next').onclick = () => changeMonth(1);
  $('monthLabel').onclick = () => { state.cur = { y: now().getFullYear(), m: now().getMonth() }; watchPayments(); render(); };
  $('addBtn').onclick = () => openBillForm(null);
  $('menuBtn').onclick = () => { renderMenu(); $('memberErr').hidden = true; $('menuSheet').hidden = false; };
  $('billForm').addEventListener('submit', saveBill);
  $('delBtn').onclick = deleteBill;
  $('memberForm').addEventListener('submit', addMember);
  $('signOutBtn').onclick = async () => { $('menuSheet').hidden = true; await state.store.signOut(); };
  for (const sheet of document.querySelectorAll('.sheet')) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.hidden = true; });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.sheet').forEach((s) => { s.hidden = true; });
  });
  // Po powrocie do aplikacji (np. następnego dnia) przelicz terminy.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

function changeMonth(delta) {
  state.cur = shiftMonth(state.cur, delta);
  watchPayments();
  render();
}

let toastTimer;
function toast(text, actionLabel, action) {
  $('toastText').textContent = text;
  const btn = $('toastAction');
  btn.hidden = !actionLabel;
  if (actionLabel) {
    btn.textContent = actionLabel;
    btn.onclick = () => { $('toast').hidden = true; action(); };
  }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, actionLabel ? 6000 : 3500);
}

/* ---------- Instalacja i aktualizacje ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) $('updateBar').hidden = false;
      });
    });
  }).catch(() => {});
  $('reloadBtn').onclick = () => location.reload();
}

init();
