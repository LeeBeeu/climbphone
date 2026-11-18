// Typ treningu (podział jak w aplikacjach treningowych) i cel – obszar, który ćwiczenie rozwija.
// Domyślnie wynikają z kategorii; TYPE_OVERRIDES / GOAL_OVERRIDES poprawiają wyjątki w bibliotece.
// Własne ćwiczenia mają pola `type` i `goals` (mają pierwszeństwo).

export const TYPES = [
  { id: 'endurance', label: 'Wytrzymałość' },
  { id: 'power_endurance', label: 'Wytrzymałość siłowa' },
  { id: 'strength_power', label: 'Siła i moc' },
  { id: 'conditioning', label: 'Przygotowanie ogólne' },
  { id: 'technique', label: 'Technika' },
  { id: 'recovery', label: 'Rozgrzewka i regeneracja' },
];

export const GOALS = [
  { id: 'fingers', label: 'Palce' },
  { id: 'pull', label: 'Ciągnięcie' },
  { id: 'push', label: 'Pchanie i barki' },
  { id: 'core', label: 'Core' },
  { id: 'legs', label: 'Nogi i biodra' },
  { id: 'aerobic', label: 'Wydolność' },
  { id: 'movement', label: 'Ruch i technika' },
  { id: 'mobility', label: 'Mobilność' },
  { id: 'prevention', label: 'Prewencja urazów' },
];

export const TYPE_BY_CAT = {
  warmup: 'recovery', fingers: 'strength_power', power: 'strength_power', power_endurance: 'power_endurance',
  endurance: 'endurance', strength: 'strength_power', core: 'conditioning', antagonist: 'conditioning',
  mobility: 'recovery', technique: 'technique',
};

export const GOALS_BY_CAT = {
  warmup: ['prevention'], fingers: ['fingers'], power: ['fingers', 'pull'], power_endurance: ['fingers', 'aerobic'],
  endurance: ['aerobic'], strength: ['pull'], core: ['core'], antagonist: ['push', 'prevention'],
  mobility: ['mobility'], technique: ['movement'],
};

export const TYPE_OVERRIDES = {
  cardio_easy: 'conditioning', density_hangs: 'endurance', repeaters_10_5: 'power_endurance', deadlift: 'conditioning',
  squat: 'conditioning', pistol: 'conditioning',
};

export const GOAL_OVERRIDES = {
  warm_board: ['fingers', 'prevention'], warm_easy_climb: ['movement', 'prevention'], warm_progressive: ['movement', 'prevention'],
  warm_shoulders_band: ['push', 'prevention'], board_pullups: ['fingers', 'pull'],
  limit_bouldering: ['fingers', 'movement'], systemboard_limit: ['fingers', 'pull', 'movement'], dyno_practice: ['movement', 'legs'],
  deadpoints: ['movement', 'pull'], explosive_pullups: ['pull'], campus_feet: ['fingers', 'movement'],
  arc: ['aerobic', 'movement'], shakeouts: ['aerobic', 'movement'], cardio_easy: ['aerobic', 'legs'],
  deadlift: ['legs', 'core'], squat: ['legs'], pistol: ['legs', 'mobility'], front_lever: ['core', 'pull'],
  hanging_leg_raises: ['core', 'pull'], pushups: ['push'], dips: ['push'], ohp: ['push'], scap_pulls: ['pull', 'prevention'],
  reverse_wrist_curls: ['fingers', 'prevention'], wrist_curls: ['fingers', 'prevention'], finger_extensors: ['fingers', 'prevention'],
  hip_mobility: ['mobility', 'legs'], hamstrings: ['mobility', 'legs'], forearm_stretch: ['mobility', 'prevention'],
  cooldown: ['mobility', 'prevention'], heel_toe_hooks: ['movement', 'legs'], slab_balance: ['movement', 'legs'],
};

// Typ i cele ćwiczenia: własne pole, wyjątek z listy albo domyślnie z kategorii.
export const exType = (e) => e.type || TYPE_OVERRIDES[e.id] || TYPE_BY_CAT[e.cat];
export const exGoals = (e) => (e.goals?.length ? e.goals : GOAL_OVERRIDES[e.id] || GOALS_BY_CAT[e.cat] || []);
export const typeLabel = (id) => TYPES.find((t) => t.id === id)?.label || '';
export const goalLabel = (id) => GOALS.find((g) => g.id === id)?.label || '';
