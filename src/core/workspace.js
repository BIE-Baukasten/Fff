// Global (neuronal) workspace: specialist processors propose contents with a
// salience; contents compete for a small number of slots; winners "ignite"
// (non-linear amplification), are maintained by reverberation after their input
// ends, are bound together (conjunction codes) and broadcast to every consumer.
// With enabled=false the organism processes everything in parallel: no
// competition, no ignition threshold, no maintenance, no binding.
import { codeFor, conjKey, CODE_DIM } from './codes.js';
import { DEFAULTS } from './config.js';

export class Workspace {
  constructor(enabled = true, p = DEFAULTS) {
    this.enabled = enabled;
    this.p = p;
    this.a = new Map();       // activation per content key
    this.info = new Map();    // last descriptor per key
    this.contents = [];       // keys currently in the workspace (sorted)
    this.g = new Float64Array(CODE_DIM);
    this.conj = new Float64Array(CODE_DIM);
    this.ignitions = [];
    this.total = 0;
    this.lastInput = new Map();
  }

  step(cands, bias = new Map()) {
    const p = this.p;
    const input = new Map();
    for (const c of cands) {
      input.set(c.key, Math.max(input.get(c.key) || 0, c.sal));
      this.info.set(c.key, c);
    }
    this.lastInput = input;
    this.g.fill(0); this.conj.fill(0);
    this.ignitions = [];
    if (!this.enabled) {
      // parallel, unselected, unmaintained processing
      this.a.clear();
      for (const [k, u] of input) { const v = Math.max(0, u + (bias.get(k) || 0)); if (v > 0.02) this.a.set(k, v); }
      this.contents = [...this.a.keys()].sort((x, y) => this.a.get(y) - this.a.get(x));
      let s = 0;
      for (const k of this.contents) s += this.a.get(k);
      const norm = Math.max(1, s / 2);
      for (const k of this.contents) { const c = codeFor(k), v = this.a.get(k) / norm; for (let i = 0; i < CODE_DIM; i++) this.g[i] += v * c[i]; }
      this.total = s;
      return this;
    }
    const inWS = new Set(this.contents);
    const keys = new Set([...this.a.keys(), ...input.keys(), ...bias.keys()]);
    for (const k of keys) {
      const u = (input.get(k) || 0) + (bias.get(k) || 0);
      const prev = this.a.get(k) || 0;
      let v;
      if (inWS.has(k)) v = Math.max(u > 0 ? u + p.ignitionBoost : 0, p.wsPersist * prev);
      else v = p.preDecay * prev + (1 - p.preDecay) * Math.max(0, u);
      v = Math.min(2, Math.max(0, v));
      if (v < 0.01 && !inWS.has(k)) this.a.delete(k); else this.a.set(k, v);
    }
    const eligible = [];
    for (const [k, v] of this.a) {
      if (inWS.has(k) ? v >= p.maintain : v >= p.ignite) eligible.push(k);
    }
    eligible.sort((x, y) => this.a.get(y) - this.a.get(x));
    const next = eligible.slice(0, p.wsCapacity);
    for (const k of next) if (!inWS.has(k)) {
      this.ignitions.push(k);
      this.a.set(k, Math.min(2, this.a.get(k) + p.ignitionBoost)); // ignition: all-or-none amplification
    }
    this.contents = next;
    let s = 0;
    for (const k of next) { const c = codeFor(k), v = this.a.get(k); s += v; for (let i = 0; i < CODE_DIM; i++) this.g[i] += v * c[i]; }
    // binding: every pair of co-active contents gets a conjunctive code
    for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) {
      const c = codeFor(conjKey(next[i], next[j])), v = Math.min(this.a.get(next[i]), this.a.get(next[j]));
      for (let d = 0; d < CODE_DIM; d++) this.conj[d] += v * c[d];
    }
    this.total = s;
    for (const [k] of this.info) if (!this.a.has(k)) this.info.delete(k);
    return this;
  }

  has(k) { return this.contents.includes(k); }
  activation(k) { return this.a.get(k) || 0; }
  /** Share of processing resources devoted to a content (what "attention" amounts to here). */
  share(k) {
    if (!this.enabled) { const v = this.a.get(k) || 0; return v / (this.total + 0.5); }
    if (!this.has(k)) return 0.1 * Math.min(1, this.activation(k));
    return this.a.get(k) / (this.total + 0.25);
  }
  /** Contents available for report and for every other consumer. */
  reportable() { return this.contents.map(k => ({ key: k, a: this.a.get(k), info: this.info.get(k) })); }

  toJSON() { return { a: [...this.a], contents: this.contents }; }
  load(o) { this.a = new Map(o.a); this.contents = o.contents; }
}
