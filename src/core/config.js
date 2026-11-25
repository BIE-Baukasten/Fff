// Parameters and lesion presets. Every architectural component that a theory of
// consciousness singles out can be switched off independently.

export const COMPONENTS = {
  gw: 'Globaler Arbeitsraum (GWT: Zündung, Kapazitätsgrenze, Aufrechterhaltung, Bindung, Broadcast)',
  ast: 'Aufmerksamkeitsschema (AST: Modell der eigenen Aufmerksamkeit, Top-down-Kontrolle)',
  meta: 'Metakognition (HOT: Konfidenz zweiter Ordnung über eigene Wahrnehmungsurteile)',
  affect: 'Homöostatischer Affekt (Damasio/Seth: Bedürfnisse bestimmen Valenz und Antrieb)',
  memory: 'Episodisches Gedächtnis & kognitive Karte (Erinnern, Planen, Gedankenwandern)',
};

export const LESIONS = {
  full:     { label: 'Vollständig', off: [] },
  noGW:     { label: '− Arbeitsraum', off: ['gw'] },
  noAST:    { label: '− Aufmerksamkeitsschema', off: ['ast'] },
  noMeta:   { label: '− Metakognition', off: ['meta'] },
  noAffect: { label: '− Affekt', off: ['affect'] },
  noMemory: { label: '− Gedächtnis', off: ['memory'] },
  minimal:  { label: 'Minimal (alles aus)', off: ['gw', 'ast', 'meta', 'affect', 'memory'] },
};

export function componentsFor(lesion = 'full') {
  const L = LESIONS[lesion] || LESIONS.full;
  const c = { gw: true, ast: true, meta: true, affect: true, memory: true };
  for (const k of L.off) c[k] = false;
  return c;
}

export const NEEDS = ['energy', 'water', 'temp', 'integrity', 'rest', 'social', 'curiosity'];
export const NEED_LABEL = {
  energy: 'Energie', water: 'Wasser', temp: 'Wärme', integrity: 'Unversehrtheit',
  rest: 'Ausgeruhtheit', social: 'Nähe', curiosity: 'Neugier',
};
export const SETPOINT = { energy: 0.8, water: 0.8, temp: 0.5, integrity: 1.0, rest: 0.85, social: 0.7, curiosity: 0.7 };
export const NEED_WEIGHT = { energy: 1.0, water: 1.0, temp: 1.2, integrity: 1.5, rest: 0.7, social: 0.45, curiosity: 0.35 };

export const CHANNELS = ['food', 'water', 'shelter', 'thorn', 'toy', 'user'];
export const LAMBDA = { food: 2.2, water: 3.0, shelter: 2.6, thorn: 0.9, toy: 2.6, user: 3.5 };
export const CUES = ['ton', 'licht', 'summen', 'duft'];

export const ACTIONS = ['N', 'O', 'S', 'W', 'warten', 'nehmen', 'schlafen', 'rufen'];
export const A = { N: 0, E: 1, S: 2, W: 3, STAY: 4, CONSUME: 5, SLEEP: 6, CALL: 7 };
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const DEFAULTS = {
  // homeostasis (per tick)
  decay: { energy: 0.00035, water: 0.0005, rest: 0.00045, social: 0.00022, curiosity: 0.00045 },
  moveCost: 0.00025,
  // workspace
  wsCapacity: 4,
  ignite: 0.55,
  maintain: 0.22,
  ignitionBoost: 0.35,
  wsPersist: 0.955,
  preDecay: 0.5,
  // learning
  gammaQ: 0.95, lrQ: 1e-3, hidden: 48, batch: 16, trainEvery: 4, replaySize: 6000, targetEvery: 400,
  betaQ: 2.5,
  gammaPav: 0.96, lrPav: 0.06,
  // affect
  rewardScale: 12,
  painWeight: 1.6,
  // mind wandering
  spontRate: 0.012,
};
