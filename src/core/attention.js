// Attention schema (Graziano): a simplified, predictive model of the organism's
// own attention. It (1) tracks what is attended and how strongly, (2) predicts
// where attention goes next, (3) notices when attention drifts away from the
// current concern (mind wandering) and steers it back (top-down control), and
// (4) provides an estimate of attentional precision that metacognition can use.
export class AttentionSchema {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.focus = null; this.strength = 0;
    this.predicted = null; this.trans = new Map();
    this.drift = false; this.driftCount = 0;
    this.predHits = 0; this.predTotal = 0;
    this.reorient = 0;
  }
  /** Top-down biases for the next workspace competition. */
  biases(concern, controlGain) {
    const b = new Map();
    if (!this.enabled || !concern) return b;
    b.set(concern, 0.3 * controlGain + (this.reorient > 0 ? 0.35 : 0));
    if (this.drift && this.focus) b.set(this.focus, -0.6);
    this.reorient = Math.max(0, this.reorient - 1);
    return b;
  }
  /** Suppression of spontaneous thought when a concern is active. */
  spontaneousGate(concern) { return this.enabled && concern ? 0.35 : 1; }
  observe(ws, concern) {
    if (!this.enabled) { this.focus = ws.contents[0] ?? null; this.strength = 0; this.drift = false; return; }
    const prevFocus = this.focus;
    // the most active *non-interoceptive* content is the focus of attention
    const ext = ws.contents.filter(k => !k.startsWith('need:'));
    const f = ext[0] ?? ws.contents[0] ?? null;
    if (this.predicted !== null) { this.predTotal++; if (this.predicted === f) this.predHits++; }
    if (prevFocus && f) {
      let m = this.trans.get(prevFocus); if (!m) this.trans.set(prevFocus, m = new Map());
      m.set(f, (m.get(f) || 0) + 1);
      if (this.trans.size > 300) this.trans.delete(this.trans.keys().next().value);
    }
    this.focus = f;
    this.strength = f ? ws.share(f) : 0;
    const m = f && this.trans.get(f);
    this.predicted = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : f;
    // meta-awareness of mind wandering
    const wandering = !!(f && f.startsWith('mem:') && concern && concern !== f);
    if (wandering && !this.drift) { this.driftCount++; this.reorient = 3; }
    this.drift = wandering;
  }
  /** The schema's estimate of how well a content is attended (precision). */
  precision(ws, key) { return this.enabled ? Math.min(1, ws.share(key) * 1.6) : null; }
  report() { return { focus: this.focus, strength: this.strength, predicted: this.predicted, drift: this.drift, accuracy: this.predTotal ? this.predHits / this.predTotal : 0 }; }
  toJSON() { return { driftCount: this.driftCount, predHits: this.predHits, predTotal: this.predTotal }; }
  load(o) { Object.assign(this, o); }
}
