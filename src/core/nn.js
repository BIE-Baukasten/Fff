// Minimal dependency-free MLP with Adam, used for the instrumental (Q) system.
import { RNG } from './rng.js';

export class MLP {
  constructor(sizes, seed = 1, { lr = 1e-3, l2 = 1e-5 } = {}) {
    this.sizes = sizes;
    this.lr = lr; this.l2 = l2;
    this.W = []; this.b = []; this.mW = []; this.vW = []; this.mb = []; this.vb = [];
    this.t = 0;
    const rng = new RNG(seed);
    for (let l = 0; l < sizes.length - 1; l++) {
      const nin = sizes[l], nout = sizes[l + 1];
      const w = new Float64Array(nin * nout);
      const sc = Math.sqrt(1 / nin);
      for (let i = 0; i < w.length; i++) w[i] = rng.normal(0, sc);
      if (l === sizes.length - 2) for (let i = 0; i < w.length; i++) w[i] *= 0.1; // small output layer
      this.W.push(w); this.b.push(new Float64Array(nout));
      this.mW.push(new Float64Array(nin * nout)); this.vW.push(new Float64Array(nin * nout));
      this.mb.push(new Float64Array(nout)); this.vb.push(new Float64Array(nout));
    }
  }
  /** Forward pass; returns activations of every layer (tanh hidden, linear out). */
  forwardAll(x) {
    const acts = [Float64Array.from(x)];
    for (let l = 0; l < this.W.length; l++) {
      const nin = this.sizes[l], nout = this.sizes[l + 1];
      const a = acts[l], W = this.W[l], b = this.b[l];
      const z = new Float64Array(nout);
      for (let j = 0; j < nout; j++) {
        let s = b[j];
        const off = j * nin;
        for (let i = 0; i < nin; i++) s += W[off + i] * a[i];
        z[j] = l < this.W.length - 1 ? Math.tanh(s) : s;
      }
      acts.push(z);
    }
    return acts;
  }
  predict(x) { const a = this.forwardAll(x); return a[a.length - 1]; }
  /** One Adam step on squared error for selected outputs. batch: [{x, idx, target}] */
  trainBatch(batch) {
    const L = this.W.length;
    const gW = this.W.map(w => new Float64Array(w.length));
    const gb = this.b.map(b => new Float64Array(b.length));
    let loss = 0;
    for (const { x, idx, target } of batch) {
      const acts = this.forwardAll(x);
      let delta = new Float64Array(this.sizes[L]);
      let err = acts[L][idx] - target;
      // Huber-style clipping keeps TD updates stable
      if (err > 1) err = 1; else if (err < -1) err = -1;
      delta[idx] = err; loss += err * err;
      for (let l = L - 1; l >= 0; l--) {
        const nin = this.sizes[l], nout = this.sizes[l + 1];
        const a = acts[l], W = this.W[l];
        const prev = new Float64Array(nin);
        for (let j = 0; j < nout; j++) {
          const d = delta[j];
          if (d === 0) continue;
          gb[l][j] += d;
          const off = j * nin;
          for (let i = 0; i < nin; i++) { gW[l][off + i] += d * a[i]; prev[i] += d * W[off + i]; }
        }
        if (l > 0) for (let i = 0; i < nin; i++) prev[i] *= 1 - a[i] * a[i];
        delta = prev;
      }
    }
    this.t++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8, n = batch.length;
    const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (let l = 0; l < L; l++) {
      const W = this.W[l], m = this.mW[l], v = this.vW[l], g = gW[l];
      for (let i = 0; i < W.length; i++) {
        const gi = g[i] / n + this.l2 * W[i];
        m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        W[i] -= this.lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
      }
      const B = this.b[l], mb = this.mb[l], vb = this.vb[l], gbl = gb[l];
      for (let i = 0; i < B.length; i++) {
        const gi = gbl[i] / n;
        mb[i] = b1 * mb[i] + (1 - b1) * gi; vb[i] = b2 * vb[i] + (1 - b2) * gi * gi;
        B[i] -= this.lr * (mb[i] / c1) / (Math.sqrt(vb[i] / c2) + eps);
      }
    }
    return loss / n;
  }
  copyFrom(o) {
    for (let l = 0; l < this.W.length; l++) { this.W[l].set(o.W[l]); this.b[l].set(o.b[l]); }
  }
  clone() { const m = MLP.fromJSON(this.toJSON()); return m; }
  toJSON() {
    return { sizes: this.sizes, lr: this.lr, l2: this.l2, t: this.t,
      W: this.W.map(a => Array.from(a, v => +v.toFixed(6))), b: this.b.map(a => Array.from(a, v => +v.toFixed(6))) };
  }
  static fromJSON(o) {
    const m = new MLP(o.sizes, 1, { lr: o.lr, l2: o.l2 });
    o.W.forEach((w, l) => m.W[l].set(w)); o.b.forEach((b, l) => m.b[l].set(b));
    m.t = 0; // Adam moments are not persisted; restart bias correction
    return m;
  }
}

export const sigmoid = x => 1 / (1 + Math.exp(-x));
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
