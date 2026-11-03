// Import przejść z 8a.nu (format API Vertical-Life: { ascents: [...] } albo sama tablica).
import { uid } from './store.js';

const STYLE = { os: 'OS', f: 'FL', rp: 'RP', tr: 'TR', go: 'GO' };

const TRAIT_KEYS = {
  isOverhang: 'overhang',
  isVertical: 'vertical',
  isSlab: 'slab',
  isRoof: 'roof',
  isAthletic: 'athletic',
  isEndurance: 'endurance',
  isTechnical: 'technical',
  isCruxy: 'cruxy',
  isCrimpy: 'crimpy',
  isSloper: 'sloper',
  pinches: 'pinches',
  pockets: 'pockets',
  crack: 'crack',
};

// 8a.nu wpisuje zaślepki typu "Unknown Sector" albo "Sokoli Grzbiet - Unknown".
function clean(value) {
  const text = String(value ?? '').trim().replace(/\s+-\s+Unknown$/i, '');
  return /^(unknown( crag| sector)?|more information needed)$/i.test(text) ? '' : text;
}

function fromEightA(a) {
  const kind = a.category === 1 ? 'boulder' : 'route';
  return {
    eightAId: a.ascentId,
    date: String(a.date).slice(0, 10),
    kind,
    name: String(a.zlaggableName ?? '').trim(),
    crag: clean(a.cragName),
    sector: clean(a.sectorName),
    area: clean(a.areaName),
    country: a.countryName || '',
    system: kind === 'boulder' ? 'font' : 'french',
    grade: a.difficulty,
    style: STYLE[a.type] ?? 'RP',
    tries: a.tries > 0 ? a.tries : null,
    rating: a.rating || 0,
    recommended: !!a.recommended,
    gradeFeel: a.isSoft ? 'soft' : a.isHard ? 'hard' : '',
    repeat: !!a.repeat,
    firstAscent: !!a.firstAscent,
    secondGo: !!a.secondGo,
    project: !!a.project,
    traditional: !!a.traditional,
    traits: Object.entries(TRAIT_KEYS).filter(([key]) => a[key]).map(([, trait]) => trait),
    notes: String(a.comment ?? '').trim(),
  };
}

export function parse8a(json) {
  const list = Array.isArray(json) ? json : json?.ascents;
  if (!Array.isArray(list) || !list.length || !list.every((a) => a && a.ascentId && a.difficulty && a.date)) {
    throw new Error('To nie jest eksport przejść z 8a.nu');
  }
  return list.map(fromEightA);
}

// Dodaje nowe przejścia, a już zaimportowane (po identyfikatorze 8a.nu) aktualizuje.
export function merge8a(state, imported) {
  const byId = new Map(state.ascents.filter((a) => a.eightAId).map((a) => [a.eightAId, a]));
  let added = 0;
  let updated = 0;
  for (const item of imported) {
    const existing = byId.get(item.eightAId);
    if (existing) {
      Object.assign(existing, item);
      updated++;
    } else {
      state.ascents.push({ id: uid(), created: Date.now(), ...item });
      added++;
    }
  }
  return { added, updated };
}
