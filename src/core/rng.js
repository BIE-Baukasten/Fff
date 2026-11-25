// Seeded, serialisable PRNG (mulberry32) with helpers.
export class RNG {
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 1;
    this._spare = null;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
  normal(mu = 0, sd = 1) {
    if (this._spare !== null) { const z = this._spare; this._spare = null; return mu + sd * z; }
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(2 * Math.PI * v);
    return mu + sd * r * Math.cos(2 * Math.PI * v);
  }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  /** Sample index from unnormalised probabilities. */
  categorical(p) {
    let s = 0; for (const x of p) s += x;
    let r = this.next() * s;
    for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return i; }
    return p.length - 1;
  }
  toJSON() { return { s: this.s }; }
  static fromJSON(o) { const r = new RNG(1); r.s = o.s >>> 0; return r; }
}

/** Stable 32-bit string hash (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
