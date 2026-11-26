// Pavlovian (stimulus-outcome) learner: temporal-difference prediction of
// upcoming hedonic outcomes from what is globally available (broadcast vector
// g and the conjunctive binding codes). Its prediction V drives conditioned
// responses (anticipatory licking/approach) and enters action selection.
import { CODE_DIM } from './codes.js';
import { TIME_DIM } from './workspace.js';
import { DEFAULTS } from './config.js';

export class Pavlov {
  constructor(p = DEFAULTS) {
    this.dim = TIME_DIM + CODE_DIM + 1;
    this.w = new Float64Array(this.dim);
    this.prev = null; this.V = 0; this.delta = 0;
    this.gamma = p.gammaPav; this.lr = p.lrPav;
  }
  phi(ws) { const x = new Float64Array(this.dim); x.set(ws.gTime, 0); for (let i = 0; i < CODE_DIM; i++) x[TIME_DIM + i] = 2.5 * ws.conj[i]; x[this.dim - 1] = 1; return x; }
  value(x) { let s = 0; for (let i = 0; i < this.dim; i++) s += this.w[i] * x[i]; return s; }
  /** One TD step. us = hedonic outcome that arrived this tick. */
  step(ws, us, learn = true) {
    const x = this.phi(ws), v = this.value(x);
    if (this.prev && learn) {
      const d = us + this.gamma * v - this.value(this.prev);
      let n = 1; for (let i = 0; i < this.dim; i++) n += this.prev[i] * this.prev[i];
      for (let i = 0; i < this.dim; i++) this.w[i] += (this.lr * d * this.prev[i]) / n;
      this.delta = d;
    }
    this.prev = x; this.V = v;
    return v;
  }
  /** Associative strength a single code would have on its own (for salience). */
  strengthOf(code) { let s = 0; for (let b = 0; b < 5; b++) for (let i = 0; i < CODE_DIM; i++) s += this.w[b * CODE_DIM + i] * code[i]; return s / 3; }
  reset() { this.prev = null; }
  toJSON() { return { w: Array.from(this.w, v => +v.toFixed(5)) }; }
  load(o) { this.w = Float64Array.from(o.w); }
}

// Cerebellum-like direct pathway (post-hoc model revision, off by default):
// learns from raw cue input with only a brief sensory (iconic) trace — it does
// not read the workspace, so it can bridge overlap (delay) but not gaps (trace).
const NB2 = 5, C2 = [1, 5, 10, 16, 25], W2 = [2, 3, 4, 5, 8];
export class DirectPavlov {
  constructor(nCue = 4, p = DEFAULTS) {
    this.nCue = nCue; this.dim = nCue * NB2 + 1; this.w = new Float64Array(this.dim);
    this.age = new Array(nCue).fill(null); this.off = new Array(nCue).fill(99); this.lv = new Array(nCue).fill(0);
    this.prev = null; this.V = 0; this.gamma = p.gammaPav; this.lr = p.lrPav;
  }
  step(levels, us, learn = true) {
    const x = new Float64Array(this.dim);
    for (let i = 0; i < this.nCue; i++) {
      if (levels[i] > 0) { this.age[i] = (this.age[i] ?? -1) + 1; this.off[i] = 0; this.lv[i] = levels[i]; }
      else { this.off[i]++; if (this.off[i] > 2) this.age[i] = null; else if (this.age[i] !== null) this.age[i]++; }
      if (this.age[i] === null) continue;
      const amp = this.lv[i] * (this.off[i] === 0 ? 1 : 0.5 ** this.off[i]);
      for (let b = 0; b < NB2; b++) x[i * NB2 + b] = amp * Math.exp(-(((this.age[i] - C2[b]) / W2[b]) ** 2));
    }
    x[this.dim - 1] = 1;
    let v = 0; for (let i = 0; i < this.dim; i++) v += this.w[i] * x[i];
    if (this.prev && learn) {
      let vp = 0, n = 1; for (let i = 0; i < this.dim; i++) { vp += this.w[i] * this.prev[i]; n += this.prev[i] ** 2; }
      const d = us + this.gamma * v - vp;
      for (let i = 0; i < this.dim; i++) this.w[i] += (this.lr * d * this.prev[i]) / n;
    }
    this.prev = x; this.V = v; return v;
  }
  reset() { this.prev = null; }
  toJSON() { return { w: Array.from(this.w) }; }
  load(o) { this.w = Float64Array.from(o.w); }
}
