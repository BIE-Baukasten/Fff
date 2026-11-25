// Das Erbgut eines Wesens: Körpermerkmale plus die Gewichte seines kleinen Gehirns.

import { dexp } from './detmath.js';

export const INPUT_LABELS = [
  'Algen hier',
  'Algen vorn',
  'Algen links',
  'Algen rechts',
  'Nachbar: Richtung',
  'Nachbar: Nähe',
  'Nachbar: Größe',
  'Nachbar: verwandt',
  'Energie',
  'Licht',
  'Gedächtnis A',
  'Gedächtnis B',
  'Puls',
  'Konstante',
];
export const OUTPUT_LABELS = ['Drehen', 'Schub', 'Angriff', 'Gedächtnis A', 'Gedächtnis B'];

export const N_IN = INPUT_LABELS.length;
export const N_HID = 8;
export const N_OUT = OUTPUT_LABELS.length;
export const N_WEIGHTS = N_IN * N_HID + N_HID * N_OUT;

export const LIMITS = {
  size: [3, 14],
  sense: [20, 150],
  mut: [0.01, 0.3],
  freq: [0.005, 0.25],
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapHue(h) {
  h %= 360;
  return h < 0 ? h + 360 : h;
}

export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function randomGenome(rng) {
  const w = new Float32Array(N_WEIGHTS);
  for (let i = 0; i < N_WEIGHTS; i++) w[i] = rng.gauss() * 0.7;
  return {
    hue: rng.range(0, 360),
    size: rng.range(4, 8),
    sense: rng.range(35, 90),
    mut: rng.range(0.04, 0.12),
    freq: rng.range(0.01, 0.12),
    w,
  };
}

export function cloneGenome(g) {
  return { hue: g.hue, size: g.size, sense: g.sense, mut: g.mut, freq: g.freq, w: Float32Array.from(g.w) };
}

export function mutateGenome(g, rng) {
  const c = cloneGenome(g);
  const p = c.mut;
  for (let i = 0; i < N_WEIGHTS; i++) {
    if (rng.next() < p) {
      // Meist kleine Schritte, selten ein großer Sprung.
      c.w[i] += rng.next() < 0.08 ? rng.gauss() * 1.2 : rng.gauss() * 0.25;
      c.w[i] = clamp(c.w[i], -4, 4);
    }
  }
  c.hue = wrapHue(c.hue + rng.gauss() * 2.5);
  if (rng.next() < 0.6) c.size = clamp(c.size + rng.gauss() * 0.35, ...LIMITS.size);
  if (rng.next() < 0.6) c.sense = clamp(c.sense + rng.gauss() * 4, ...LIMITS.sense);
  if (rng.next() < 0.4) c.freq = clamp(c.freq * dexp(rng.gauss() * 0.15), ...LIMITS.freq);
  c.mut = clamp(c.mut * dexp(rng.gauss() * 0.08), ...LIMITS.mut);
  return c;
}

// Wie weit sind zwei Erbgute voneinander entfernt? Einheitenlos, ~1 pro "spürbarem" Unterschied.
export function genomeDistance(a, b) {
  let sq = 0;
  for (let i = 0; i < N_WEIGHTS; i++) {
    const d = a.w[i] - b.w[i];
    sq += d * d;
  }
  const brain = Math.sqrt(sq / N_WEIGHTS) / 0.3;
  return (
    brain +
    Math.abs(a.size - b.size) / 1.5 +
    Math.abs(a.sense - b.sense) / 25 +
    hueDistance(a.hue, b.hue) / 40
  );
}
