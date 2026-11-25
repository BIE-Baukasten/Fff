// Binäre Nomenklatur für Arten, die es nie gab: Gattung + Epitheton.
// Die Gattung wird vererbt, das Epitheton beschreibt, was an der Art auffällt.

const ONSETS = ['b', 'c', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'th', 'ph', 'ch', 'pl', 'tr', 'gl', 'cr', 'st', 'sc', 'x', 'z'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'y', 'ae', 'io', 'eu'];
const ENDINGS = ['ella', 'ina', 'opsis', 'aria', 'ulus', 'ites', 'ora', 'ix', 'ium', 'ea', 'onia', 'ax', 'odes', 'ura'];

const COLOR_EPITHETS = [
  [15, 'rubra'],
  [40, 'aurantia'],
  [65, 'flava'],
  [100, 'chlorina'],
  [150, 'viridis'],
  [190, 'glauca'],
  [235, 'caerulea'],
  [275, 'violacea'],
  [320, 'purpurea'],
  [360, 'rosea'],
];

const TRAIT_EPITHETS = {
  predator: ['vorax', 'rapax', 'ferox', 'mordax'],
  big: ['magna', 'grandis', 'robusta', 'gigantea'],
  small: ['minima', 'parvula', 'pusilla', 'nana'],
  keen: ['vigilans', 'oculata', 'sagax'],
  myopic: ['caeca', 'obscura'],
  fast: ['velox', 'celeris', 'agilis'],
  slow: ['lenta', 'placida', 'tranquilla', 'pigra'],
  restless: ['errans', 'vaga', 'inquieta'],
};

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function makeGenus(rng, taken) {
  for (let tries = 0; tries < 50; tries++) {
    let name = rng.pick(ONSETS) + rng.pick(VOWELS);
    if (rng.next() < 0.6) name += rng.pick(ONSETS) + rng.pick(VOWELS).slice(0, 1);
    name = name.replace(/([aeiouy])\1+/g, '$1');
    name = capitalize(name.replace(/[aeiouy]+$/, '') + rng.pick(ENDINGS));
    if (!taken.has(name)) return name;
  }
  return 'Incerta';
}

function colorEpithet(hue) {
  for (const [limit, name] of COLOR_EPITHETS) if (hue < limit) return name;
  return 'rosea';
}

// traits: { hue, size, sense, kills, speed (0..1 mittlerer Schub) }
export function makeEpithet(rng, traits, genus, taken) {
  const candidates = [];
  if (traits.kills > 0) candidates.push(...TRAIT_EPITHETS.predator);
  if (traits.size > 9.5) candidates.push(...TRAIT_EPITHETS.big);
  if (traits.size < 4.5) candidates.push(...TRAIT_EPITHETS.small);
  if (traits.sense > 105) candidates.push(...TRAIT_EPITHETS.keen);
  if (traits.sense < 35) candidates.push(...TRAIT_EPITHETS.myopic);
  if (traits.speed > 0.7) candidates.push(...TRAIT_EPITHETS.fast);
  if (traits.speed < 0.25) candidates.push(...TRAIT_EPITHETS.slow);
  if (traits.turn > 0.5) candidates.push(...TRAIT_EPITHETS.restless);
  candidates.push(colorEpithet(traits.hue));

  const order = candidates.slice();
  // Mischen, aber die Merkmals-Namen vor der Farbe bevorzugen.
  for (let i = order.length - 2; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const e of order) if (!taken.has(`${genus} ${e}`)) return e;
  const base = order[0];
  for (const suffix of ['minor', 'major', 'nova', 'altera', 'tertia', 'secunda']) {
    if (!taken.has(`${genus} ${base} ${suffix}`)) return `${base} ${suffix}`;
  }
  return `${base} ${Math.floor(rng.next() * 900 + 100)}`;
}
