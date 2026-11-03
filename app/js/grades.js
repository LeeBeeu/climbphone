// Skale wycen. Kolejność w tablicy = rosnąca trudność.
export const SYSTEMS = {
  french: {
    label: 'Francuska',
    kind: 'route',
    grades: ['3a', '3b', '3c', '4a', '4b', '4c', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a',
      '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c'],
  },
  kurtyka: {
    label: 'Kurtyka (PL)',
    kind: 'route',
    grades: ['III', 'IV', 'IV+', 'V-', 'V', 'V+', 'VI-', 'VI', 'VI+', 'VI.1', 'VI.1+', 'VI.2', 'VI.2+',
      'VI.3', 'VI.3+', 'VI.4', 'VI.4+', 'VI.5', 'VI.5+', 'VI.6', 'VI.6+', 'VI.7', 'VI.7+', 'VI.8', 'VI.8+', 'VI.9'],
  },
  uiaa: {
    label: 'UIAA',
    kind: 'route',
    grades: ['III', 'IV', 'IV+', 'V-', 'V', 'V+', 'VI-', 'VI', 'VI+', 'VII-', 'VII', 'VII+', 'VIII-', 'VIII',
      'VIII+', 'IX-', 'IX', 'IX+', 'X-', 'X', 'X+', 'XI-', 'XI', 'XI+', 'XII-', 'XII'],
  },
  font: {
    label: 'Fontainebleau',
    kind: 'boulder',
    grades: ['3', '4A', '4B', '4C', '5A', '5B', '5C', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B',
      '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'],
  },
  vscale: {
    label: 'V-scale',
    kind: 'boulder',
    grades: ['VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13',
      'V14', 'V15', 'V16', 'V17'],
  },
};

export const systemsFor = (kind) => Object.entries(SYSTEMS).filter(([, s]) => s.kind === kind);

export const gradeIndex = (system, grade) => SYSTEMS[system]?.grades.indexOf(grade) ?? -1;

// Style przejścia jak w 8a.nu. 'GO' (próba, nieukończona droga) nie liczy się do statystyk.
export const STYLES = {
  route: [['OS', 'On-sight'], ['FL', 'Flash'], ['RP', 'Red-point'], ['TR', 'Na wędkę'], ['GO', 'Próba (go)']],
  boulder: [['OS', 'On-sight'], ['FL', 'Flash'], ['RP', 'Przejście (top)'], ['GO', 'Próba (go)']],
};

export const DEFAULT_STYLE = { route: 'RP', boulder: 'RP' };

// Kolumny statystyk (jak scorecard w 8a.nu), od najcenniejszego stylu.
export const SEND_STYLES = ['OS', 'FL', 'RP', 'TR'];

export const styleLabel = (kind, code) => STYLES[kind]?.find(([c]) => c === code)?.[1] ?? code;

// Charakter drogi (tagi z 8a.nu).
export const TRAITS = [
  ['overhang', 'Przewieszenie'],
  ['vertical', 'Pion'],
  ['slab', 'Płyta'],
  ['roof', 'Okap'],
  ['athletic', 'Siłowa'],
  ['endurance', 'Wytrzymałościowa'],
  ['technical', 'Techniczna'],
  ['cruxy', 'Z cruxem'],
  ['crimpy', 'Krawądki'],
  ['sloper', 'Oble'],
  ['pinches', 'Szczypy'],
  ['pockets', 'Dziurki'],
  ['crack', 'Rysa'],
];
