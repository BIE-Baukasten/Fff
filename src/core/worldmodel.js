// Forward model: predicts the next egocentric sensory state from the current one
// and the efference copy of the chosen action. Its prediction error is surprise
// (salience, curiosity) and distinguishes self-caused from external change.
export class WorldModel {
  constructor(nIn, nAct) {
    this.nIn = nIn; this.nAct = nAct;
    this.dimX = nIn + nAct + 1;
    this.W = new Float64Array(nIn * this.dimX);
    this.pred = null; this.err = 0; this.avgErr = 0.01; this.surprise = 0;
  }
  _x(s, a) { const x = new Float64Array(this.dimX); x.set(s, 0); if (a >= 0) x[this.nIn + a] = 1; x[this.dimX - 1] = 1; return x; }
  /** Compare the last prediction with the new observation, learn, then predict ahead. */
  step(s, a, learn = true) {
    if (this.pred) {
      let e = 0; const x = this.lastX, n = this.dimX;
      let xx = 1; for (let i = 0; i < n; i++) xx += x[i] * x[i];
      for (let o = 0; o < this.nIn; o++) {
        const d = s[o] - this.pred[o]; e += d * d;
        if (learn) { const off = o * n, g = 0.3 * d / xx; for (let i = 0; i < n; i++) this.W[off + i] += g * x[i]; }
      }
      this.err = e / this.nIn;
      this.avgErr = 0.995 * this.avgErr + 0.005 * this.err;
      this.surprise = this.err / (this.avgErr + 1e-4);
    }
    const x = this._x(s, a); this.lastX = x;
    const p = new Float64Array(this.nIn);
    for (let o = 0; o < this.nIn; o++) { let v = 0; const off = o * this.dimX; for (let i = 0; i < this.dimX; i++) v += this.W[off + i] * x[i]; p[o] = v; }
    this.pred = p;
    return this.surprise;
  }
  toJSON() { return { W: Array.from(this.W, v => +v.toFixed(5)), avgErr: this.avgErr }; }
  load(o) { this.W = Float64Array.from(o.W); this.avgErr = o.avgErr; }
}
