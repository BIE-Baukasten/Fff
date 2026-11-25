// Grounded word learning. Words heard from the human are associated with what
// is globally available at that time (cross-situational learning). Hearing a
// known word re-activates its meaning; when the organism calls, it says the word
// that best expresses its most active content, or babbles.
import { RNG } from './rng.js';

const SYL = ['mi', 'ka', 'nu', 'lo', 'pe', 'ta', 'ri', 'so', 'bu', 'ze', 'wa', 'jo'];

export class Lexicon {
  constructor(seed = 1) {
    this.words = {};       // word -> {n, assoc:{key:s}, first, last, said}
    this.keyTotal = {};
    this.recent = [];      // [{w, t}]
    const r = new RNG(seed * 31 + 7);
    this.syl = r.shuffle(SYL.slice()).slice(0, 6); // individual "voice"
    this.rng = r;
  }
  hear(words, t) {
    const fresh = [];
    for (const w of words) {
      if (!this.words[w]) { this.words[w] = { n: 0, assoc: {}, first: t, last: t, said: 0 }; fresh.push(w); }
      const e = this.words[w]; e.n++; e.last = t;
      this.recent.push({ w, t });
    }
    return fresh;
  }
  /** Associate recently heard words with the current reportable contents. */
  associate(contents, t) {
    this.recent = this.recent.filter(r => t - r.t <= 8);
    if (!this.recent.length) return;
    for (const { w, t: th } of this.recent) {
      const e = this.words[w]; const rec = 1 - (t - th) / 10;
      for (const { key, a } of contents) {
        if (key.startsWith('word:') || key.startsWith('mem:') || key === 'surprise') continue;
        const d = 0.05 * rec * Math.min(1.5, a);
        e.assoc[key] = (e.assoc[key] || 0) + d;
        this.keyTotal[key] = (this.keyTotal[key] || 0) + d;
      }
    }
  }
  /** Meaning of a word: contents it evokes, with strength (P(k|w)·P(w|k))^½ · familiarity. */
  meaning(w, top = 3) {
    const e = this.words[w]; if (!e) return [];
    let tot = 0; for (const k in e.assoc) tot += e.assoc[k];
    if (tot <= 0) return [];
    const out = [];
    for (const k in e.assoc) {
      const pkw = e.assoc[k] / tot, pwk = e.assoc[k] / (this.keyTotal[k] || 1);
      out.push([k, Math.sqrt(pkw * pwk) * Math.min(1, tot / 0.6)]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, top);
  }
  /** Choose an utterance expressing the given contents. */
  produce(contents) {
    let best = null, bs = 0;
    for (const w in this.words) {
      const m = this.meaning(w, 4);
      for (const [k, s] of m) {
        const c = contents.find(c => c.key === k);
        if (!c) continue;
        const sc = s * Math.min(1.5, c.a);
        if (sc > bs) { bs = sc; best = { word: w, key: k, score: sc }; }
      }
    }
    if (best && bs > 0.18) { this.words[best.word].said++; return best; }
    const n = 1 + this.rng.int(2);
    let b = ''; for (let i = 0; i < n; i++) b += this.rng.pick(this.syl);
    return { word: b, key: null, score: 0, babble: true };
  }
  known() {
    return Object.entries(this.words).map(([w, e]) => ({ w, n: e.n, said: e.said, meaning: this.meaning(w, 3) }))
      .filter(x => x.meaning.length).sort((a, b) => (b.meaning[0]?.[1] || 0) - (a.meaning[0]?.[1] || 0));
  }
  toJSON() { return { words: this.words, keyTotal: this.keyTotal, syl: this.syl, rng: this.rng.toJSON() }; }
  load(o) { this.words = o.words; this.keyTotal = o.keyTotal; this.syl = o.syl; this.rng = RNG.fromJSON(o.rng); }
}
