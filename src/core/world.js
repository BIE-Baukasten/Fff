// The physical niche of the organism: a 2-D grid with day/night, temperature,
// regrowing berry bushes (nutritious and toxic look-alikes), a pond, a warm cave,
// thorn thickets, and whatever the human places there.
import { RNG } from './rng.js';
import { CHANNELS, LAMBDA, CUES, DIRS } from './config.js';

export const T = { GRASS: 0, ROCK: 1, POND: 2, CAVE: 3, THORN: 4 };

export class World {
  constructor({ seed = 1, width = 30, height = 20, layout = 'home', dayLength = 1440 } = {}) {
    this.rng = new RNG(seed * 7919 + 13);
    this.width = width; this.height = height;
    this.terrain = new Uint8Array(width * height);
    this.objects = [];
    this.nextId = 1;
    this.t = 0;
    this.dayLength = dayLength;
    this.timeOffset = Math.floor(dayLength * 0.3); // start in the morning
    this.cues = Object.fromEntries(CUES.map(c => [c, 0]));
    this.heard = [];          // words waiting to be perceived
    this.voice = 0;           // recent human voice (decays)
    this.hand = { x: -1, y: -1, active: false, stroking: false, poke: false };
    this.utterances = [];
    this.fixedAmbient = null; // experiments can clamp ambient temperature
    this.fixedLight = null;
    this.analgesicCells = new Set();
    this._src = null;
    if (layout === 'home') this._buildHome();
    else if (layout === 'box') this._buildBox();
  }

  idx(x, y) { return y * this.width + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  terrainAt(x, y) { return this.inside(x, y) ? this.terrain[this.idx(x, y)] : T.ROCK; }
  walkable(x, y) { return this.inside(x, y) && this.terrain[this.idx(x, y)] !== T.ROCK; }
  setTerrain(x, y, v) { if (this.inside(x, y)) { this.terrain[this.idx(x, y)] = v; this._src = null; } }

  _buildBox() {
    for (let x = 0; x < this.width; x++) { this.setTerrain(x, 0, T.ROCK); this.setTerrain(x, this.height - 1, T.ROCK); }
    for (let y = 0; y < this.height; y++) { this.setTerrain(0, y, T.ROCK); this.setTerrain(this.width - 1, y, T.ROCK); }
  }

  _buildHome() {
    const r = this.rng, W = this.width, H = this.height;
    // pond
    const px = W - 8, py = 5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - px) / 3.4) ** 2 + ((y - py) / 2.3) ** 2;
      if (d <= 1) this.setTerrain(x, y, T.POND);
    }
    // cave (warm shelter) with rock walls, bottom-left
    const cx = 2, cy = H - 5;
    for (let x = cx - 1; x <= cx + 3; x++) { this.setTerrain(x, cy - 1, T.ROCK); this.setTerrain(x, cy + 2, T.ROCK); }
    for (let y = cy - 1; y <= cy + 2; y++) this.setTerrain(cx - 1, y, T.ROCK);
    this.setTerrain(cx + 3, cy, T.ROCK);
    for (let x = cx; x <= cx + 2; x++) for (let y = cy; y <= cy + 1; y++) this.setTerrain(x, y, T.CAVE);
    // scattered rocks
    for (let k = 0; k < 5; k++) {
      const x0 = 4 + r.int(W - 8), y0 = 2 + r.int(H - 4);
      for (let j = 0; j < 3; j++) { const x = x0 + r.int(2), y = y0 + r.int(2); if (this.terrainAt(x, y) === T.GRASS) this.setTerrain(x, y, T.ROCK); }
    }
    // thorn thickets
    for (let k = 0; k < 4; k++) {
      const x0 = 3 + r.int(W - 6), y0 = 2 + r.int(H - 4);
      for (let j = 0; j < 4; j++) { const x = x0 + r.int(3) - 1, y = y0 + r.int(3) - 1; if (this.terrainAt(x, y) === T.GRASS) this.setTerrain(x, y, T.THORN); }
    }
    // berry bushes: 7 nutritious, 3 toxic look-alikes
    const placed = [];
    const ok = (x, y) => this.terrainAt(x, y) === T.GRASS && placed.every(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) > 4);
    for (let k = 0; k < 10; k++) {
      let x, y, tries = 0;
      do { x = 1 + r.int(W - 2); y = 1 + r.int(H - 2); tries++; } while (!ok(x, y) && tries < 500);
      placed.push([x, y]);
      this.addBush(x, y, k >= 7);
    }
  }

  addBush(x, y, toxic, opts = {}) {
    const r = this.rng;
    const hueMean = opts.hueMean ?? (toxic ? 0.68 : 0.32) + r.normal(0, 0.03);
    return this.addObject({ type: 'bush', x, y, toxic, hueMean, hueSd: opts.hueSd ?? 0.08,
      berries: opts.berries ?? 3, maxBerries: opts.maxBerries ?? 3, regrow: opts.regrow ?? 280, timer: 0 });
  }

  addObject(o) { o.id = this.nextId++; o.born = this.t; this.objects.push(o); this._src = null; return o; }
  removeObject(o) { const i = this.objects.indexOf(o); if (i >= 0) this.objects.splice(i, 1); this._src = null; }
  objectsAt(x, y) { return this.objects.filter(o => o.x === x && o.y === y); }

  // --- time, light, temperature -------------------------------------------
  phase() { return ((this.t + this.timeOffset) % this.dayLength) / this.dayLength; }
  light() { return this.fixedLight ?? 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase()); }
  isNight() { return this.light() < 0.22; }
  ambientTemp(x, y) {
    if (this.fixedAmbient !== null) return this.fixedAmbient;
    const tr = this.terrainAt(x, y);
    if (tr === T.CAVE) return 0.52;
    return 0.24 + 0.42 * this.light() - (tr === T.POND ? 0.06 : 0);
  }

  // --- perception fields ----------------------------------------------------
  _sources() {
    if (this._src) return this._src;
    const s = Object.fromEntries(CHANNELS.map(c => [c, []]));
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const tr = this.terrain[this.idx(x, y)];
      if (tr === T.POND) s.water.push([x, y, 0.35]);
      else if (tr === T.CAVE) s.shelter.push([x, y, 0.5]);
      else if (tr === T.THORN) s.thorn.push([x, y, 1]);
    }
    for (const o of this.objects) {
      if (o.type === 'bush' && o.berries > 0 && !o.scentless) s.food.push([o.x, o.y, 0.45 + 0.15 * o.berries]);
      else if (o.type === 'pellet') s.food.push([o.x, o.y, 0.45 + 3.2 * (o.energy ?? 0.14)]);
      else if (o.type === 'bowl' && o.sips > 0) s.water.push([o.x, o.y, 0.9]);
      else if (o.type === 'toy') s.toy.push([o.x, o.y, 1]);
    }
    this._src = s;
    return s;
  }
  field(ch, x, y) {
    if (ch !== 'user' && ch !== 'toy') {
      const src = this._sources();
      this._fc ||= {};
      if (src._sig === undefined) src._sig = {};
      const sig = src._sig[ch] ??= src[ch].map(a => a.join(',')).join(';');
      let g = this._fc[ch];
      if (!g || g.sig !== sig) {
        g = this._fc[ch] = new Float64Array(this.width * this.height); g.sig = sig;
        for (let yy = 0; yy < this.height; yy++) for (let xx = 0; xx < this.width; xx++) g[yy * this.width + xx] = this._fieldRaw(ch, xx, yy);
      }
      return this.inside(x, y) ? g[y * this.width + x] : this._fieldRaw(ch, x, y);
    }
    return this._fieldRaw(ch, x, y);
  }
  _fieldRaw(ch, x, y) {
    let v = 0;
    const lam = LAMBDA[ch];
    for (const [sx, sy, I] of this._sources()[ch]) {
      const d = Math.hypot(sx - x, sy - y);
      if (d < 6 * lam) v += I * Math.exp(-d / lam);
    }
    if (ch === 'user') {
      if (this.hand.active) v += Math.exp(-Math.hypot(this.hand.x - x, this.hand.y - y) / lam);
      v += 0.6 * this.voice;
    }
    return 1 - Math.exp(-v);
  }
  /** Egocentric chemical/visual gradients: per channel [here, N-here, E-here, S-here, W-here]. */
  sense(x, y) {
    const out = new Float64Array(CHANNELS.length * 5);
    CHANNELS.forEach((ch, c) => {
      const h = this.field(ch, x, y);
      out[c * 5] = h;
      DIRS.forEach(([dx, dy], d) => {
        const nx = x + dx, ny = y + dy;
        out[c * 5 + 1 + d] = this.walkable(nx, ny) || ch === 'thorn' ? this.field(ch, nx, ny) - h : -h;
      });
    });
    return out;
  }

  // --- the human --------------------------------------------------------------
  say(text) {
    const words = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 0 && w.length < 24);
    if (words.length) { this.heard.push(...words.slice(0, 6)); this.voice = 1; }
    return words;
  }
  ring(cue, duration = 12, intensity = 1) {
    if (!(cue in this.cues)) return;
    this.cues[cue] = Math.max(this.cues[cue], duration);
    this._cueI = { ...(this._cueI || {}), [cue]: intensity };
  }
  cueLevel(cue) { return this.cues[cue] > 0 ? (this._cueI?.[cue] ?? 1) : 0; }
  setHand(x, y, active, stroking = false) { this.hand.x = x; this.hand.y = y; this.hand.active = active; this.hand.stroking = stroking; }
  poke() { this.hand.poke = true; }
  place(type, x, y) {
    if (!this.walkable(x, y)) return null;
    if (type === 'pellet') return this.addObject({ type, x, y });
    if (type === 'bowl') return this.addObject({ type, x, y, sips: 8 });
    if (type === 'toy') return this.addObject({ type, x, y, hue: this.rng.next() });
    if (type === 'bushN') return this.addBush(x, y, false);
    if (type === 'bushT') return this.addBush(x, y, true);
    return null;
  }

  // --- the organism acting on the world --------------------------------------
  applyAction(body, a) {
    const ev = [];
    if (a <= 3) {
      const [dx, dy] = DIRS[a];
      const nx = body.x + dx, ny = body.y + dy;
      if (this.walkable(nx, ny)) {
        body.x = nx; body.y = ny; ev.push({ type: 'move' });
        if (this.terrainAt(nx, ny) === T.THORN) ev.push({ type: 'thorn', dmg: this.thornDamage ?? 0.035 });
      } else ev.push({ type: 'bump' });
    } else if (a === 5) {
      const here = this.objectsAt(body.x, body.y);
      const pellet = here.find(o => o.type === 'pellet');
      const bush = here.find(o => o.type === 'bush' && o.berries > 0);
      const bowl = here.find(o => o.type === 'bowl' && o.sips > 0);
      const toy = here.find(o => o.type === 'toy');
      if (pellet) { this.removeObject(pellet); ev.push({ type: 'eat', item: 'pellet', toxic: false, energy: pellet.energy ?? 0.14, taste: 1 }); }
      else if (bush) {
        const b = this.berryFeatures(bush);
        bush.berries--; this._src = null;
        ev.push({ type: 'eat', item: 'berry', toxic: bush.toxic, energy: bush.toxic ? 0.03 : 0.11 * b.size, taste: 0.8, features: b, bushId: bush.id, harm: bush.harm });
      } else if (bowl) { bowl.sips--; this._src = null; ev.push({ type: 'drink', amount: 0.09 }); if (bowl.sips <= 0) this.removeObject(bowl); }
      else if (this.terrainAt(body.x, body.y) === T.POND) ev.push({ type: 'drink', amount: 0.07 });
      else if (toy) {
        ev.push({ type: 'play', toyId: toy.id });
        const opts = DIRS.map(([dx, dy]) => [toy.x + dx, toy.y + dy]).filter(([x, y]) => this.walkable(x, y));
        if (opts.length) { const [x, y] = this.rng.pick(opts); toy.x = x; toy.y = y; this._src = null; }
      } else ev.push({ type: 'nothing' });
    } else if (a === 6) ev.push({ type: 'sleep' });
    else if (a === 7) ev.push({ type: 'call' });
    else ev.push({ type: 'stay' });
    return ev;
  }

  /** Features of the berry currently on offer at a bush (what the eye sees). */
  berryFeatures(bush) {
    if (!bush._offer || bush._offerT !== bush.berries) {
      const r = this.rng;
      bush._offer = { hue: Math.min(1, Math.max(0, r.normal(bush.hueMean, bush.hueSd))), spots: r.next(), size: 0.7 + 0.6 * r.next() };
      bush._offerT = bush.berries;
    }
    return bush._offer;
  }

  step() {
    this.t++;
    for (const c of CUES) if (this.cues[c] > 0) this.cues[c]--;
    this.voice *= 0.93;
    for (const o of this.objects) {
      if (o.type === 'bush' && o.berries < o.maxBerries && o.regrow > 0) {
        if (++o.timer >= o.regrow) { o.timer = 0; o.berries++; o._offer = null; this._src = null; }
      }
    }
    // moths: small wandering creatures — a natural source of novelty
    if (this.moths !== false) {
      const moths = this.objects.filter(o => o.type === 'toy' && o.moth);
      if (moths.length < 2 && this.rng.chance(0.002)) {
        const x = 1 + this.rng.int(this.width - 2), y = 1 + this.rng.int(this.height - 2);
        if (this.walkable(x, y)) this.addObject({ type: 'toy', moth: true, x, y, life: 400 + this.rng.int(800), hue: this.rng.next() });
      }
      for (const m of moths) {
        if (--m.life <= 0) { this.removeObject(m); continue; }
        if (this.rng.chance(0.08)) { const [dx, dy] = DIRS[this.rng.int(4)]; if (this.walkable(m.x + dx, m.y + dy)) { m.x += dx; m.y += dy; this._src = null; } }
      }
    }
    if (this.utterances.length > 60) this.utterances.splice(0, this.utterances.length - 60);
  }

  toJSON() {
    return { width: this.width, height: this.height, terrain: Array.from(this.terrain), objects: this.objects.map(o => { const c = { ...o }; delete c._offer; delete c._offerT; return c; }),
      nextId: this.nextId, t: this.t, dayLength: this.dayLength, timeOffset: this.timeOffset, rng: this.rng.toJSON() };
  }
  static fromJSON(o) {
    const w = new World({ width: o.width, height: o.height, layout: 'none', dayLength: o.dayLength });
    w.terrain = Uint8Array.from(o.terrain); w.objects = o.objects; w.nextId = o.nextId; w.t = o.t; w.timeOffset = o.timeOffset;
    w.rng = RNG.fromJSON(o.rng);
    return w;
  }
}
