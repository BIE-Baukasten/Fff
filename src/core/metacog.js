// First-order perceptual judgement (is this berry nutritious?) and a separate
// second-order system that estimates the probability that the first-order
// judgement is correct (Fleming & Daw 2017 style "second-order" confidence).
import { sigmoid } from './nn.js';

const feat = f => [(f.hue - 0.5) * 6, f.spots - 0.5, f.size - 1, 1];
const PRIOR = [0, 0, 0, 0.4];

export class Discriminator {
  constructor() { this.w = [0, 0, 0, 0.4]; this.n = 0; }
  p(f) { const x = feat(f); let s = 0; for (let i = 0; i < 4; i++) s += this.w[i] * x[i]; return sigmoid(s); }
  learn(f, toxic) {
    const x = feat(f), y = toxic ? 0 : 1, e = y - this.p(f);
    const lr = Math.max(0.06, 0.6 / Math.sqrt(1 + this.n / 4)); // plastic when young, stable when experienced
    const g = lr * (toxic ? 1.5 : 1); // taste aversion is learned fast (Garcia)
    for (let i = 0; i < 4; i++) this.w[i] += g * e * x[i] - 0.003 * (this.w[i] - PRIOR[i]);
    this.n++;
  }
  toJSON() { return { w: this.w, n: this.n }; }
  load(o) { this.w = o.w; this.n = o.n; }
}

export class Metacognition {
  constructor(enabled = true) { this.enabled = enabled; this.w = [0, 0, 0, 0.5]; this.n = 0; }
  _x(p, pi) { return [Math.abs(p - 0.5) * 2, pi ?? 0.5, (pi ?? 0.5) * Math.abs(p - 0.5) * 2, 1]; }
  confidence(p, pi) {
    if (!this.enabled) return null;
    const x = this._x(p, pi); let s = 0; for (let i = 0; i < 4; i++) s += this.w[i] * x[i];
    return sigmoid(s);
  }
  learn(p, pi, correct, lr = 0.3) {
    if (!this.enabled) return;
    const x = this._x(p, pi), c = this.confidence(p, pi), e = (correct ? 1 : 0) - c;
    for (let i = 0; i < 4; i++) this.w[i] += lr * e * x[i];
    this.n++;
  }
  toJSON() { return { w: this.w, n: this.n }; }
  load(o) { this.w = o.w; this.n = o.n; }
}
