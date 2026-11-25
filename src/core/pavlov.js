// Pavlovian (stimulus-outcome) learner: temporal-difference prediction of
// upcoming hedonic outcomes from what is globally available (broadcast vector
// g and the conjunctive binding codes). Its prediction V drives conditioned
// responses (anticipatory licking/approach) and enters action selection.
import { CODE_DIM } from './codes.js';
import { DEFAULTS } from './config.js';

export class Pavlov {
  constructor(p = DEFAULTS) {
    this.dim = 2 * CODE_DIM + 1;
    this.w = new Float64Array(this.dim);
    this.prev = null; this.V = 0; this.delta = 0;
    this.gamma = p.gammaPav; this.lr = p.lrPav;
  }
  phi(ws) { const x = new Float64Array(this.dim); x.set(ws.g, 0); x.set(ws.conj, CODE_DIM); x[this.dim - 1] = 1; return x; }
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
  strengthOf(code) { let s = 0; for (let i = 0; i < CODE_DIM; i++) s += this.w[i] * code[i]; return s; }
  reset() { this.prev = null; }
  toJSON() { return { w: Array.from(this.w, v => +v.toFixed(5)) }; }
  load(o) { this.w = Float64Array.from(o.w); }
}
