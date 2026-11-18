// Obliczenia rachunków: kiedy płatność wypada, termin, status, podsumowanie miesiąca.
// Czyste funkcje bez DOM – testowane w tests/rachunki-calc.test.mjs.

export const EVERY = [
  { value: 1, label: 'co miesiąc' },
  { value: 2, label: 'co 2 miesiące' },
  { value: 3, label: 'co kwartał' },
  { value: 6, label: 'co pół roku' },
  { value: 12, label: 'raz w roku' },
  { value: 0, label: 'jednorazowo' },
];

export const CATEGORIES = ['Media', 'Mieszkanie', 'Kredyt', 'Ubezpieczenie', 'Abonamenty', 'Dzieci', 'Samochód', 'Podatki', 'Inne'];

export const SOON_DAYS = 3;

/** 'RRRR-MM' dla roku i miesiąca 0–11. */
export function periodKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** 'RRRR-MM' → liczba miesięcy od roku 0. */
export function monthIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return y * 12 + m - 1;
}

export function shiftMonth({ y, m }, delta) {
  const i = y * 12 + m + delta;
  return { y: Math.floor(i / 12), m: ((i % 12) + 12) % 12 };
}

/** Czy płatność wypada w danym miesiącu. every = co ile miesięcy (0 = jednorazowo). */
export function occursIn(bill, period) {
  const diff = monthIndex(period) - monthIndex(bill.start);
  if (diff < 0) return false;
  if (bill.end && monthIndex(period) > monthIndex(bill.end)) return false;
  const every = Number(bill.every);
  return every === 0 ? diff === 0 : diff % every === 0;
}

/** Termin w danym miesiącu; dzień 31 w lutym przesuwa się na ostatni dzień miesiąca. */
export function dueDate(bill, period) {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(Number(bill.day) || 1, last));
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Liczba dni od dziś do terminu (ujemna = po terminie). */
export function daysUntil(due, today) {
  return Math.round((startOfDay(due) - startOfDay(today)) / 864e5);
}

/** 'paid' | 'late' | 'soon' | 'todo' */
export function statusOf(days, paid) {
  if (paid) return 'paid';
  if (days < 0) return 'late';
  if (days <= SOON_DAYS) return 'soon';
  return 'todo';
}

/** Pozycje do pokazania w miesiącu, posortowane po terminie. payments: { [billId]: płatność } */
export function monthItems(bills, payments, period, today) {
  return bills
    .filter((b) => occursIn(b, period))
    .map((bill) => {
      const due = dueDate(bill, period);
      const payment = payments[bill.id] || null;
      const days = daysUntil(due, today);
      return { bill, due, payment, days, status: statusOf(days, !!payment) };
    })
    .sort((a, b) => a.due - b.due || a.bill.name.localeCompare(b.bill.name, 'pl'));
}

export function summary(items) {
  let total = 0;
  let paid = 0;
  let paidCount = 0;
  for (const i of items) {
    total += Number(i.bill.amount) || 0;
    if (i.payment) {
      paid += Number(i.payment.amount ?? i.bill.amount) || 0;
      paidCount += 1;
    }
  }
  return {
    total: round2(total),
    paid: round2(paid),
    left: round2(Math.max(0, total - paid)),
    count: items.length,
    paidCount,
    lateCount: items.filter((i) => i.status === 'late').length,
  };
}

/** Bieżący miesiąc jako 'RRRR-MM'. */
export function currentPeriod(today = new Date()) {
  return periodKey(today.getFullYear(), today.getMonth());
}

/** Zaległe płatności z wcześniejszych miesięcy (do `monthsBack` wstecz), których nikt nie odhaczył. */
export function overdueBefore(bills, paidKeys, period, today, monthsBack = 6) {
  const out = [];
  const end = monthIndex(period);
  for (let i = end - monthsBack; i < end; i++) {
    const p = periodKey(Math.floor(i / 12), i % 12);
    for (const bill of bills) {
      // Miesiące sprzed dodania płatności do aplikacji nie są zaległościami.
      if (bill.trackFrom && p < bill.trackFrom) continue;
      if (occursIn(bill, p) && !paidKeys.has(paymentId(bill.id, p)) && daysUntil(dueDate(bill, p), today) < 0) {
        out.push({ bill, period: p, due: dueDate(bill, p) });
      }
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

export function paymentId(billId, period) {
  return `${billId}_${period}`;
}

/** '1 234,50 zł', '120.5', '99' → liczba; puste lub błędne → 0. */
export function parseAmount(text) {
  const clean = String(text ?? '').replace(/\s|zł|pln/gi, '').replace(',', '.');
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Walidacja formularza; zwraca { bill } albo { error }. */
export function validateBill(input) {
  const name = String(input.name ?? '').trim();
  if (!name) return { error: 'Wpisz nazwę płatności.' };
  if (!/^\d{4}-\d{2}$/.test(input.start ?? '')) return { error: 'Wybierz miesiąc, od którego płatność obowiązuje.' };
  const day = Math.trunc(Number(input.day));
  if (!(day >= 1 && day <= 31)) return { error: 'Dzień płatności musi być od 1 do 31.' };
  const every = Number(input.every);
  if (!EVERY.some((e) => e.value === every)) return { error: 'Wybierz, jak często płatność się powtarza.' };
  const end = input.end || '';
  if (end && (!/^\d{4}-\d{2}$/.test(end) || monthIndex(end) < monthIndex(input.start))) {
    return { error: 'Miesiąc zakończenia nie może być wcześniejszy niż początek.' };
  }
  return {
    bill: {
      name: name.slice(0, 60),
      amount: parseAmount(input.amount),
      day,
      every,
      start: input.start,
      end,
      category: CATEGORIES.includes(input.category) ? input.category : 'Inne',
      note: String(input.note ?? '').trim().slice(0, 200),
    },
  };
}

export function formatPLN(n) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n || 0);
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
