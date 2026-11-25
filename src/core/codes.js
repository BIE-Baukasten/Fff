// Distributed "symbol" codes for workspace contents. Each content key maps
// deterministically to a random unit vector; conjunctions (bindings) get their
// own code, as in configural / tensor-binding accounts.
import { RNG, hashString } from './rng.js';

export const CODE_DIM = 16;
const cache = new Map();

export function codeFor(key) {
  let c = cache.get(key);
  if (c) return c;
  const r = new RNG(hashString(key) ^ 0x9e3779b9);
  c = new Float64Array(CODE_DIM);
  let n = 0;
  for (let i = 0; i < CODE_DIM; i++) { c[i] = r.normal(); n += c[i] * c[i]; }
  n = Math.sqrt(n);
  for (let i = 0; i < CODE_DIM; i++) c[i] /= n;
  cache.set(key, c);
  return c;
}

export function conjKey(a, b) { return a < b ? `${a}&${b}` : `${b}&${a}`; }
