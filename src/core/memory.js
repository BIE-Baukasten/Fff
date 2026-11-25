// Episodic memory (what happened, where, how it felt) and a cognitive map
// (where things are), plus spontaneous reactivation: mind wandering when awake,
// dreaming during sleep.
import { T } from './world.js';
import { DIRS } from './config.js';

export class EpisodicMemory {
  constructor(enabled = true, capacity = 400) {
    this.enabled = enabled; this.capacity = capacity;
    this.episodes = []; this.nextId = 1;
  }
  encode(t, x, y, keys, labels, valence, arousal, event) {
    if (!this.enabled) return null;
    const strength = 0.2 + Math.abs(valence) + 0.5 * arousal;
    const ep = { id: this.nextId++, t, x, y, keys: keys.slice(0, 6), labels: labels.slice(0, 6), valence: +valence.toFixed(3), arousal: +arousal.toFixed(3), event, strength, recalls: 0 };
    this.episodes.push(ep);
    if (this.episodes.length > this.capacity) {
      let wi = 0, ws = Infinity;
      for (let i = 0; i < this.episodes.length - 20; i++) { const s = this.episodes[i].strength; if (s < ws) { ws = s; wi = i; } }
      this.episodes.splice(wi, 1);
    }
    return ep;
  }
  decay() { for (const e of this.episodes) e.strength *= 0.99995; }
  /** Cue-driven recall: pattern completion from current contents. */
  recall(cueKeys, t) {
    if (!this.enabled || !cueKeys.length || !this.episodes.length) return null;
    const cue = new Set(cueKeys.filter(k => !k.startsWith('mem:') && !k.startsWith('need:') && !k.startsWith('act:')));
    if (!cue.size) return null;
    let best = null, bs = 0;
    for (let i = this.episodes.length - 1; i >= Math.max(0, this.episodes.length - 250); i--) {
      const e = this.episodes[i];
      if (t - e.t < 40 || t - (e.lastRecall ?? -1e9) < 300) continue; // not the present episode; refractory
      let ov = 0; for (const k of e.keys) if (cue.has(k)) ov++;
      if (!ov) continue;
      const s = (ov / (cue.size + e.keys.length - ov)) * (0.3 + Math.abs(e.valence)) * Math.min(1.5, e.strength);
      if (s > bs) { bs = s; best = e; }
    }
    if (!best || bs < 0.2) return null;
    best.recalls++; best.lastRecall = t; best.strength = Math.min(3, best.strength + 0.02);
    return { ep: best, score: bs };
  }
  spontaneous(rng, rate) {
    if (!this.enabled || this.episodes.length < 3 || !rng.chance(rate)) return null;
    // emotionally strong memories come back more often
    const idx = rng.categorical(this.episodes.map(e => e.strength * (0.2 + Math.abs(e.valence))));
    const ep = this.episodes[idx]; ep.recalls++;
    return ep;
  }
  get(id) { return this.episodes.find(e => e.id === id); }
  toJSON() { return { episodes: this.episodes, nextId: this.nextId }; }
  load(o) { this.episodes = o.episodes; this.nextId = o.nextId; }
}

export class CognitiveMap {
  constructor(enabled, w, h) {
    this.enabled = enabled; this.w = w; this.h = h;
    this.visits = new Uint16Array(w * h);
    this.known = new Int8Array(w * h).fill(-1); // terrain or -1 unknown
    this.food = new Map();   // cell -> {t, bushId, berries}
    this.bushValue = {};     // bushId -> learned outcome value
    this.userSeen = null;
  }
  idx(x, y) { return y * this.w + x; }
  observe(world, x, y, t, radius = 3) {
    if (!this.enabled) return 0;
    const i0 = this.idx(x, y);
    const novel = this.visits[i0] === 0 ? 1 : 0;
    if (this.visits[i0] < 65000) this.visits[i0]++;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!world.inside(nx, ny) || dx * dx + dy * dy > radius * radius + 1) continue;
      const i = this.idx(nx, ny);
      this.known[i] = world.terrainAt(nx, ny);
      this.food.delete(i);
    }
    for (const o of world.objects) {
      if (Math.abs(o.x - x) > radius || Math.abs(o.y - y) > radius) continue;
      if ((o.type === 'bush' && o.berries > 0) || o.type === 'pellet') this.food.set(this.idx(o.x, o.y), { t, bushId: o.type === 'bush' ? o.id : null, berries: o.berries ?? 1 });
    }
    if (world.hand.active) this.userSeen = { x: world.hand.x, y: world.hand.y, t };
    return novel;
  }
  learnBush(id, value) { if (!this.enabled || id == null) return; const v = this.bushValue[id] ?? 0; this.bushValue[id] = v + 0.5 * (value - v); }
  targets(kind, t) {
    const out = [];
    if (kind === 'food') for (const [i, f] of this.food) {
      const v = f.bushId != null ? (this.bushValue[f.bushId] ?? 0.3) : 1;
      if (v > 0) out.push([i, v * Math.exp(-(t - f.t) / 3000)]);
    } else if (kind === 'water') { for (let i = 0; i < this.known.length; i++) if (this.known[i] === T.POND) out.push([i, 1]); }
    else if (kind === 'shelter') { for (let i = 0; i < this.known.length; i++) if (this.known[i] === T.CAVE) out.push([i, 1]); }
    else if (kind === 'explore') {
      for (let i = 0; i < this.known.length; i++) if (this.visits[i] === 0 && this.known[i] !== T.ROCK) out.push([i, this.known[i] === -1 ? 0.6 : 1]);
    }
    return out;
  }
  /** Breadth-first (Dijkstra-light) planning on the remembered map. */
  plan(x, y, kind, t) {
    if (!this.enabled) return null;
    const tg = this.targets(kind, t);
    if (!tg.length) return null;
    const goal = new Map(tg);
    const W = this.w, H = this.h, N = W * H;
    const dist = new Float32Array(N).fill(Infinity), first = new Int8Array(N).fill(-1);
    const start = this.idx(x, y);
    if (goal.has(start)) return { dir: -1, dist: 0, target: start, value: goal.get(start) };
    dist[start] = 0;
    // bucketed queue with small integer costs
    const buckets = [[start]]; let best = null;
    for (let c = 0; c < buckets.length && c < 200; c++) {
      const b = buckets[c]; if (!b) continue;
      for (const i of b) {
        if (dist[i] < c) continue;
        if (goal.has(i)) { const s = goal.get(i) / (1 + c * 0.05); if (!best || s > best.score) best = { i, c, score: s }; }
        if (best && c > best.c + 8) break;
        const cx = i % W, cy = (i / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx, k = this.known[j];
          if (k === T.ROCK) continue;
          const cost = k === T.THORN ? 8 : k === -1 ? 2 : 1;
          const nc = c + cost;
          if (nc < dist[j]) { dist[j] = nc; first[j] = i === start ? d : first[i]; (buckets[nc] ||= []).push(j); }
        }
      }
      if (best && c > best.c + 8) break;
    }
    if (!best) return null;
    return { dir: first[best.i], dist: best.c, target: best.i, value: goal.get(best.i) };
  }
  toJSON() { return { visits: Array.from(this.visits), known: Array.from(this.known), food: [...this.food], bushValue: this.bushValue }; }
  load(o) { this.visits = Uint16Array.from(o.visits); this.known = Int8Array.from(o.known); this.food = new Map(o.food); this.bushValue = o.bushValue; }
}
