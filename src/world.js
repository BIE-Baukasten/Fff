// Die Welt: ein toroidales Becken, Algen, wanderndes Licht, und die Wesen darin.
// Alles hier ist ohne DOM lauffähig, damit es sich in Node testen lässt.

import { dexp, dlog, dsin, dcos, datan2 } from './detmath.js';
import { createRng } from './rng.js';
import { N_IN, N_HID, N_OUT, randomGenome, mutateGenome, cloneGenome, genomeDistance, hueDistance, wrapHue } from './genome.js';
import { think } from './brain.js';
import { makeGenus, makeEpithet } from './names.js';

export const DAY = 600; // Ticks pro Tag
export const WORLD_W = 1600;
export const WORLD_H = 1000;
export const CELL = 20;
export const COLS = WORLD_W / CELL;
export const ROWS = WORLD_H / CELL;
const HASH = 80;
const HCOLS = Math.ceil(WORLD_W / HASH);
const HROWS = Math.ceil(WORLD_H / HASH);
const TAU = Math.PI * 2;
const COS7 = dcos(0.7);
const SIN7 = dsin(0.7);

export const PARAMS = {
  algaeGrowth: 0.0065,
  algaeEnergy: 60,
  basal: 0.0042,
  moveCost: 0.006,
  senseCost: 0.0015,
  attackCost: 0.004,
  eatRate: 0.0028,
  maxSpeed: 2.2,
  biteRate: 0.09,
  biteEfficiency: 0.75,
  reproduceAt: 0.7,
  maturity: 160,
  speciation: 2.5,
  establishAt: 10,
  minPopulation: 14,
};

function wrapCoord(v, size) {
  if (v < 0) return v + size;
  if (v >= size) return v - size;
  return v;
}

function torusDelta(d, size) {
  if (d > size / 2) return d - size;
  if (d < -size / 2) return d + size;
  return d;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.t = 0;
    this.algae = new Float32Array(COLS * ROWS);
    this.light = new Float32Array(COLS * ROWS);
    this.creatures = [];
    this.byId = new Map();
    this.nextId = 1;
    this.clades = new Map();
    this.nextCladeId = 1;
    this.genusNames = new Set();
    this.speciesNames = new Set();
    this.events = [];
    this.history = [];
    this.sampleEvery = 30;
    this.records = { oldestDays: 5, maxPop: 0, loggedPop: 0, lastPopLog: -Infinity, maxGen: 0, nextGen: 10, firstKill: false, lastCrash: -Infinity };
    this.births = 0;
    this.deaths = { hunger: 0, age: 0, eaten: 0 };
    this.lastImmigration = -Infinity;
    this.buckets = Array.from({ length: HCOLS * HROWS }, () => []);
    this._newborn = [];

    const rng = this.rng;
    this.blobs = [];
    for (let i = 0; i < 3; i++) {
      this.blobs.push({
        cx: rng.range(0, WORLD_W),
        cy: rng.range(0, WORLD_H),
        ax: rng.range(250, 700),
        ay: rng.range(150, 450),
        px: rng.range(0, TAU),
        py: rng.range(0, TAU),
        periodX: rng.range(3, 9) * DAY,
        periodY: rng.range(3, 9) * DAY,
        r: rng.range(130, 230),
        x: 0,
        y: 0,
      });
    }
    this.updateLight();
    for (let i = 0; i < this.algae.length; i++) this.algae[i] = this.light[i] * rng.range(0.3, 0.9);

    const founders = [];
    for (let i = 0; i < 4; i++) founders.push(this.immigrate(10, false));
    this.flushNewborn();
    this.log('Die ersten Siedler treiben ins Becken: ', ...joinClades(founders), '.');
    this.sample();
  }

  // ---------- Umwelt ----------

  // Die Welt beginnt um 8 Uhr morgens; Mittag ist am hellsten.
  dayFactor(t = this.t) {
    return 0.6 + 0.4 * dsin((TAU * t) / DAY - Math.PI / 2 + 2.094);
  }

  clock(t = this.t) {
    const frac = (t % DAY) / DAY;
    const minutes = Math.floor(((frac * 24 + 8) % 24) * 60);
    return { day: Math.floor(t / DAY) + 1, hour: Math.floor(minutes / 60), minute: minutes % 60 };
  }

  isNight(t = this.t) {
    return this.dayFactor(t) < 0.4;
  }

  updateLight() {
    for (const b of this.blobs) {
      b.x = wrapCoord(((b.cx + b.ax * dsin((TAU * this.t) / b.periodX + b.px)) % WORLD_W + WORLD_W) % WORLD_W, WORLD_W);
      b.y = wrapCoord(((b.cy + b.ay * dsin((TAU * this.t) / b.periodY + b.py)) % WORLD_H + WORLD_H) % WORLD_H, WORLD_H);
    }
    // Die Gaußglocke zerfällt in einen x- und einen y-Faktor: 130 statt 4000 Exponentialfunktionen je Fleck.
    const gx = this._gx || (this._gx = this.blobs.map(() => new Float64Array(COLS)));
    const gy = this._gy || (this._gy = this.blobs.map(() => new Float64Array(ROWS)));
    this.blobs.forEach((b, k) => {
      const inv = 1 / (2 * b.r * b.r);
      for (let col = 0; col < COLS; col++) {
        const dx = torusDelta((col + 0.5) * CELL - b.x, WORLD_W);
        gx[k][col] = dexp(-dx * dx * inv);
      }
      for (let row = 0; row < ROWS; row++) {
        const dy = torusDelta((row + 0.5) * CELL - b.y, WORLD_H);
        gy[k][row] = dexp(-dy * dy * inv);
      }
    });
    const nb = this.blobs.length;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        let L = 0.08;
        for (let k = 0; k < nb; k++) L += 0.95 * gx[k][col] * gy[k][row];
        this.light[row * COLS + col] = L > 1 ? 1 : L;
      }
    }
  }

  cellIndex(x, y) {
    let col = Math.floor(x / CELL);
    let row = Math.floor(y / CELL);
    col = ((col % COLS) + COLS) % COLS;
    row = ((row % ROWS) + ROWS) % ROWS;
    return row * COLS + col;
  }

  algaeAt(x, y) {
    return this.algae[this.cellIndex(x, y)];
  }

  growAlgae(day) {
    const g = PARAMS.algaeGrowth * day;
    const a = this.algae;
    const L = this.light;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v < 1) a[i] = v + g * L[i] * (v + 0.12) * (1 - v);
      else a[i] = v - (v - 1) * 0.003;
    }
  }

  addAlgae(x, y, amount, radius = 1) {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    let total = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) total += 1 / (1 + dx * dx + dy * dy);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const c = (((col + dx) % COLS) + COLS) % COLS;
        const r = (((row + dy) % ROWS) + ROWS) % ROWS;
        const i = r * COLS + c;
        this.algae[i] = Math.min(2.5, this.algae[i] + (amount / total) / (1 + dx * dx + dy * dy));
      }
    }
  }

  // ---------- Arten ----------

  newClade({ genus, parent, founder, depth }) {
    const clade = {
      id: this.nextCladeId++,
      genus,
      epithet: null,
      name: null,
      parent,
      founder: cloneGenome(founder),
      hue: founder.hue,
      born: this.t,
      established: false,
      establishedAt: null,
      died: null,
      pop: 0,
      peak: 0,
      kills: 0,
      depth,
      childClades: 0,
    };
    this.clades.set(clade.id, clade);
    if (parent) this.clades.get(parent).childClades++;
    return clade;
  }

  establish(clade) {
    const members = this.creatures.filter((c) => c.alive && c.clade === clade.id);
    const traits = { hue: clade.hue, size: 0, sense: 0, speed: 0, turn: 0, kills: clade.kills };
    for (const c of members) {
      traits.size += c.g.size;
      traits.sense += c.g.sense;
      traits.speed += c.speedAvg;
      traits.turn += c.turnAvg;
    }
    const n = Math.max(1, members.length);
    traits.size /= n;
    traits.sense /= n;
    traits.speed = members.length ? traits.speed / n : 0.5;
    traits.turn = members.length ? traits.turn / n : 0.2;
    if (!members.length) {
      traits.size = clade.founder.size;
      traits.sense = clade.founder.sense;
    }
    clade.epithet = makeEpithet(this.rng, traits, clade.genus, this.speciesNames);
    clade.name = `${clade.genus} ${clade.epithet}`;
    this.speciesNames.add(clade.name);
    clade.established = true;
    clade.establishedAt = this.t;
  }

  // Nächster benannter Vorfahre (oder die Art selbst).
  displayClade(id) {
    let clade = this.clades.get(id);
    while (clade && !clade.established) clade = this.clades.get(clade.parent);
    return clade || null;
  }

  pruneClade(clade) {
    // Unbenannte, ausgestorbene Zweige ohne Nachfolger werden vergessen.
    while (clade && !clade.established && clade.pop === 0 && clade.childClades === 0) {
      this.clades.delete(clade.id);
      const parent = clade.parent ? this.clades.get(clade.parent) : null;
      if (parent) parent.childClades--;
      clade = parent;
    }
  }

  immigrate(count, announce = true) {
    const rng = this.rng;
    const founder = this.pickDrifter();
    const genus = makeGenus(rng, this.genusNames);
    this.genusNames.add(genus);
    const clade = this.newClade({ genus, parent: null, founder, depth: 0 });
    const x0 = rng.range(0, WORLD_W);
    const y0 = rng.range(0, WORLD_H);
    for (let i = 0; i < count; i++) {
      const g = i === 0 ? cloneGenome(founder) : mutateGenome(founder, rng);
      const x = wrapCoord(x0 + rng.gauss() * 90, WORLD_W);
      const y = wrapCoord(y0 + rng.gauss() * 90, WORLD_H);
      this.spawn(g, x, y, clade.id, 0, null, 0.5 * 12 * g.size * g.size);
    }
    this.establish(clade);
    this.lastImmigration = this.t;
    if (announce) this.log('Einwanderer treiben heran: ', { clade: clade.id }, ' gründet eine neue Gattung.');
    return clade.id;
  }

  // Das Meer spült nicht jeden Zufall an: von zwölf Zufallsgenomen gewinnt das,
  // dessen Gehirn auf zufällige Reize am ehesten gemächlich schwimmt statt um sich zu beißen.
  pickDrifter() {
    const rng = this.rng;
    const inp = new Float32Array(N_IN);
    const hid = new Float32Array(N_HID);
    const out = new Float32Array(N_OUT);
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 12; k++) {
      const g = randomGenome(rng);
      let score = 0;
      for (let trial = 0; trial < 24; trial++) {
        for (let i = 0; i < N_IN; i++) inp[i] = rng.range(-1, 1);
        inp[0] = inp[1] = inp[2] = inp[3] = rng.next();
        inp[N_IN - 1] = 1;
        think(g.w, inp, hid, out);
        const half = (out[1] + 1) / 2;
        const thrust = half * Math.sqrt(half);
        score += thrust > 0.15 && thrust < 0.65 ? 1 : 0;
        score -= out[2] > 0.5 ? 0.7 : 0;
        score -= Math.abs(out[0]) > 0.8 ? 0.3 : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return best;
  }

  // ---------- Wesen ----------

  spawn(g, x, y, cladeId, gen, parentId, energy) {
    const m = g.size * g.size;
    const c = {
      id: this.nextId++,
      g,
      x,
      y,
      a: this.rng.range(-Math.PI, Math.PI),
      energy,
      maxE: 12 * m,
      // Größenabhängige Faktoren, einmal pro Leben berechnet.
      speedF: dexp(0.35 * dlog(6 / g.size)), // kleine sind flinker
      eatF: dexp(1.7 * dlog(g.size / 6)), // Ertrag beim Grasen ∝ Größe^1,7
      ca: 1,
      sa: 0,
      age: 0,
      maxAge: Math.round(DAY * (4 + g.size * 0.45)),
      gen,
      parent: parentId,
      clade: cladeId,
      born: this.t,
      children: 0,
      kills: 0,
      mem0: 0,
      mem1: 0,
      thrust: 0,
      turn: 0,
      attacking: false,
      hurt: 0,
      bite: 0,
      speedAvg: 0.5,
      turnAvg: 0.2,
      phase: this.rng.range(0, TAU),
      alive: true,
      cause: null,
      killer: null,
      died: null,
      lastChild: null,
      input: new Float32Array(N_IN),
      hidden: new Float32Array(N_HID),
      output: new Float32Array(N_OUT),
    };
    c.energy = Math.min(c.energy, c.maxE);
    this._newborn.push(c);
    this.byId.set(c.id, c);
    const clade = this.clades.get(cladeId);
    clade.pop++;
    if (clade.pop > clade.peak) clade.peak = clade.pop;
    return c;
  }

  rebuildHash() {
    for (const b of this.buckets) b.length = 0;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const hx = Math.floor(c.x / HASH) % HCOLS;
      const hy = Math.floor(c.y / HASH) % HROWS;
      this.buckets[hy * HCOLS + hx].push(c);
    }
  }

  nearest(c) {
    const range = c.g.sense;
    const span = Math.ceil(range / HASH);
    const hx = Math.floor(c.x / HASH);
    const hy = Math.floor(c.y / HASH);
    let best = null;
    let bestD2 = range * range;
    let bdx = 0;
    let bdy = 0;
    for (let oy = -span; oy <= span; oy++) {
      const row = (((hy + oy) % HROWS) + HROWS) % HROWS;
      for (let ox = -span; ox <= span; ox++) {
        const col = (((hx + ox) % HCOLS) + HCOLS) % HCOLS;
        for (const o of this.buckets[row * HCOLS + col]) {
          if (o === c || !o.alive) continue;
          const dx = torusDelta(o.x - c.x, WORLD_W);
          const dy = torusDelta(o.y - c.y, WORLD_H);
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = o;
            bdx = dx;
            bdy = dy;
          }
        }
      }
    }
    if (!best) return null;
    return { o: best, dx: bdx, dy: bdy, d: Math.sqrt(bestD2) };
  }

  act(c, day) {
    const g = c.g;
    const s = g.size;
    const m = s * s;
    const inp = c.input;
    const probe = 10 + g.sense * 0.3;
    const a = c.a;

    inp[0] = this.algaeAt(c.x, c.y);
    const ca = dcos(a);
    const sa = dsin(a);
    // Seitliche Fühler per Additionstheorem, ±0,7 rad neben der Blickrichtung.
    inp[1] = this.algaeAt(c.x + ca * probe, c.y + sa * probe);
    inp[2] = this.algaeAt(c.x + (ca * COS7 + sa * SIN7) * probe, c.y + (sa * COS7 - ca * SIN7) * probe);
    inp[3] = this.algaeAt(c.x + (ca * COS7 - sa * SIN7) * probe, c.y + (sa * COS7 + ca * SIN7) * probe);

    const n = this.nearest(c);
    if (n) {
      inp[4] = wrapAngle(datan2(n.dy, n.dx) - a) / Math.PI;
      inp[5] = 1 - n.d / g.sense;
      inp[6] = clamp((n.o.g.size - s) / s, -1, 1);
      inp[7] = clamp(1 - hueDistance(n.o.g.hue, g.hue) / 30, -1, 1);
    } else {
      inp[4] = inp[5] = inp[6] = inp[7] = 0;
    }
    inp[8] = (c.energy / c.maxE) * 2 - 1;
    inp[9] = this.light[this.cellIndex(c.x, c.y)] * day * 2 - 1;
    inp[10] = c.mem0;
    inp[11] = c.mem1;
    inp[12] = dsin(c.age * g.freq + c.phase);
    inp[13] = 1;

    const out = c.output;
    think(g.w, inp, c.hidden, out);

    c.turn = out[0] * 0.22;
    const half = (out[1] + 1) / 2;
    c.thrust = half * Math.sqrt(half); // ^1.5, ohne Math.pow: das rechnet nicht in jeder Engine gleich
    c.attacking = out[2] > 0.5;
    c.mem0 = out[3];
    c.mem1 = out[4];
    c.speedAvg += (c.thrust - c.speedAvg) * 0.01;
    c.turnAvg += (Math.abs(out[0]) - c.turnAvg) * 0.01;

    c.a = wrapAngle(c.a + c.turn);
    const speed = c.thrust * PARAMS.maxSpeed * c.speedF;
    c.ca = dcos(c.a);
    c.sa = dsin(c.a);
    c.x = wrapCoord(c.x + c.ca * speed, WORLD_W);
    c.y = wrapCoord(c.y + c.sa * speed, WORLD_H);

    // Grasen: wer stillhält, frisst gründlicher.
    const ci = this.cellIndex(c.x, c.y);
    const bite = Math.min(this.algae[ci], this.algae[ci] * PARAMS.eatRate * 6 * c.eatF * (1 - 0.6 * c.thrust) * 1.6);
    this.algae[ci] -= bite;
    c.energy += bite * PARAMS.algaeEnergy;

    let cost =
      PARAMS.basal * m +
      PARAMS.moveCost * m * c.thrust * c.thrust +
      PARAMS.senseCost * g.sense;
    if (c.age > 0.8 * c.maxAge) cost *= 1 + ((c.age - 0.8 * c.maxAge) / (0.2 * c.maxAge)) * 2;

    if (c.attacking) {
      cost += PARAMS.attackCost * m;
      if (n && n.d < (s + n.o.g.size) * 1.1 && s > n.o.g.size * 0.75) {
        const prey = n.o;
        const dmg = Math.min(prey.energy, PARAMS.biteRate * m);
        prey.energy -= dmg;
        c.energy += dmg * PARAMS.biteEfficiency;
        prey.hurt = 10;
        c.bite = 6;
        if (prey.energy <= 0 && prey.alive) this.kill(prey, c);
      }
    }

    c.energy -= cost;
    if (c.energy > c.maxE) c.energy = c.maxE;
    c.age++;
    if (c.hurt > 0) c.hurt--;
    if (c.bite > 0) c.bite--;

    if (c.energy <= 0) this.die(c, 'hunger');
    else if (c.age > c.maxAge) this.die(c, 'age');
    else if (c.energy > PARAMS.reproduceAt * c.maxE && c.age > PARAMS.maturity) this.reproduce(c);
  }

  reproduce(c) {
    const rng = this.rng;
    const childG = mutateGenome(c.g, rng);
    let cladeId = c.clade;
    const clade = this.clades.get(c.clade);
    if (genomeDistance(childG, clade.founder) > PARAMS.speciation) {
      // Abspaltung: die Färbung springt sichtbar, damit man den neuen Zweig erkennt.
      childG.hue = wrapHue(childG.hue + (rng.chance(0.5) ? 1 : -1) * rng.range(35, 70));
      let genus = clade.genus;
      let depth = clade.depth + 1;
      if (depth >= 4) {
        genus = makeGenus(rng, this.genusNames);
        this.genusNames.add(genus);
        depth = 0;
      }
      cladeId = this.newClade({ genus, parent: clade.id, founder: childG, depth }).id;
    }
    const childEnergy = c.energy * 0.4;
    c.energy *= 0.5;
    const back = c.g.size * 2;
    const child = this.spawn(
      childG,
      wrapCoord(c.x - c.ca * back, WORLD_W),
      wrapCoord(c.y - c.sa * back, WORLD_H),
      cladeId,
      c.gen + 1,
      c.id,
      childEnergy,
    );
    c.children++;
    c.lastChild = child.id;
    this.births++;

    const childClade = this.clades.get(cladeId);
    if (!childClade.established && childClade.pop >= PARAMS.establishAt) {
      this.establish(childClade);
      const ancestor = this.displayClade(childClade.parent);
      this.log('Neue Art: ', { clade: childClade.id }, ' hat sich von ', ancestor ? { clade: ancestor.id } : 'unbekannten Vorfahren', ' abgespalten.');
    }

    if (child.gen >= this.records.nextGen) {
      const shown = this.displayClade(cladeId);
      this.log(`Generation ${child.gen} erreicht, in der Linie von `, { clade: shown.id }, '.');
      this.records.nextGen = child.gen < 50 ? child.gen + (child.gen < 25 ? 15 : 25) : child.gen * 2;
    }
    if (child.gen > this.records.maxGen) this.records.maxGen = child.gen;
  }

  kill(prey, hunter) {
    hunter.kills++;
    const hc = this.clades.get(hunter.clade);
    if (hc) hc.kills++;
    this.die(prey, 'eaten', hunter);
    if (!this.records.firstKill) {
      this.records.firstKill = true;
      const a = this.displayClade(hunter.clade);
      const b = this.displayClade(prey.clade);
      if (a.id === b.id) this.log('Erste Jagd beobachtet, und gleich Kannibalismus: ', { clade: a.id }, ' frisst die eigene Art.');
      else this.log('Erste Jagd beobachtet: ein Exemplar von ', { clade: a.id }, ' frisst eines von ', { clade: b.id }, '.');
    }
  }

  die(c, cause, killer = null) {
    c.alive = false;
    c.cause = cause;
    c.killer = killer ? killer.id : null;
    c.died = this.t;
    this.deaths[cause]++;
    const m = c.g.size * c.g.size;
    const remains = m * 0.02 + Math.max(0, c.energy) / PARAMS.algaeEnergy * 0.5;
    if (cause !== 'eaten') this.addAlgae(c.x, c.y, remains, 1);
    const clade = this.clades.get(c.clade);
    clade.pop--;
    if (clade.pop === 0) {
      clade.died = this.t;
      if (clade.established) {
        const days = Math.max(1, Math.round((this.t - clade.born) / DAY));
        this.log('', { clade: clade.id }, ` ist ausgestorben, nach ${days} ${days === 1 ? 'Tag' : 'Tagen'} und mit höchstens ${clade.peak} Tieren.`);
      } else {
        this.pruneClade(clade);
      }
    }
  }

  // ---------- Takt ----------

  step() {
    this.t++;
    const day = this.dayFactor();
    if (this.t % 10 === 0) this.updateLight();
    this.growAlgae(day);
    this.rebuildHash();

    const list = this.creatures;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.alive) this.act(c, day);
    }

    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.alive) list[w++] = c;
      else this.byId.delete(c.id);
    }
    list.length = w;
    this.flushNewborn();

    if (list.length < PARAMS.minPopulation && this.t - this.lastImmigration > 240) {
      this.immigrate(10);
      this.flushNewborn();
    }
    if (this.t % this.sampleEvery === 0) this.sample();
    if (this.t % 60 === 0) this.checkRecords();
  }

  flushNewborn() {
    for (const c of this._newborn) if (c.alive) this.creatures.push(c);
    this._newborn.length = 0;
  }

  sample() {
    const counts = new Map();
    for (const c of this.creatures) {
      const d = this.displayClade(c.clade);
      const id = d ? d.id : 0;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    let sum = 0;
    for (let i = 0; i < this.algae.length; i++) sum += this.algae[i];
    // Höchststand zählt die Art samt ihrer noch unbenannten Seitenzweige.
    for (const [id, n] of counts) {
      const clade = this.clades.get(id);
      if (clade && n > clade.peak) clade.peak = n;
    }
    this.history.push({ t: this.t, pop: this.creatures.length, algae: sum / this.algae.length, counts });
    if (this.history.length > 720) {
      this.history = this.history.filter((_, i) => i % 2 === 0);
      this.sampleEvery *= 2;
    }
  }

  checkRecords() {
    const pop = this.creatures.length;
    const r = this.records;
    if (pop > r.maxPop) {
      // Höchstens eine Meldung pro Tag, sonst überschwemmt ein Boom die Chronik.
      if (this.t > DAY * 2 && pop > 100 && pop > r.loggedPop * 1.25 && this.t - r.lastPopLog > DAY) {
        this.log(`Ein neuer Höchststand: ${pop} Tiere leben im Becken.`);
        r.loggedPop = pop;
        r.lastPopLog = this.t;
      }
      r.maxPop = pop;
    }
    let oldest = null;
    for (const c of this.creatures) if (!oldest || c.age > oldest.age) oldest = c;
    if (oldest && oldest.age / DAY >= r.oldestDays + 1) {
      r.oldestDays = Math.floor(oldest.age / DAY);
      this.log(`Altersrekord: ein Exemplar von `, { clade: this.displayClade(oldest.clade).id }, ` lebt seit ${r.oldestDays} Tagen.`, { creature: oldest.id });
    }
    // Einbruch: mehr als die Hälfte binnen eines Tages verloren.
    const back = Math.round(DAY / this.sampleEvery);
    const past = this.history[this.history.length - 1 - back];
    if (past && past.pop > 80 && pop < past.pop * 0.5 && this.t - r.lastCrash > DAY * 2) {
      r.lastCrash = this.t;
      this.log(`Ein Einbruch: binnen eines Tages schrumpft der Bestand von ${past.pop} auf ${pop} Tiere.`);
    }
  }

  log(...parts) {
    this.events.push({ t: this.t, parts: parts.filter((p) => p !== '') });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  // ---------- Auskunft für die Oberfläche ----------

  creatureNear(x, y, radius) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      const dx = torusDelta(c.x - x, WORLD_W);
      const dy = torusDelta(c.y - y, WORLD_H);
      const d = Math.hypot(dx, dy) - c.g.size;
      if (d < radius && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  livingSpecies() {
    const tally = new Map();
    for (const c of this.creatures) {
      const d = this.displayClade(c.clade);
      if (!d) continue;
      tally.set(d.id, (tally.get(d.id) || 0) + 1);
    }
    return [...tally.entries()]
      .map(([id, count]) => ({ clade: this.clades.get(id), count }))
      .sort((a, b) => b.count - a.count);
  }

  speciesStats(cladeId) {
    const members = this.creatures.filter((c) => this.displayClade(c.clade)?.id === cladeId);
    const n = members.length;
    const st = { n, size: 0, sense: 0, speed: 0, energy: 0, age: 0, gen: 0, hunters: 0 };
    for (const c of members) {
      st.size += c.g.size;
      st.sense += c.g.sense;
      st.speed += c.speedAvg;
      st.energy += c.energy / c.maxE;
      st.age += c.age;
      if (c.gen > st.gen) st.gen = c.gen;
      if (c.kills > 0) st.hunters++;
    }
    if (n) {
      st.size /= n;
      st.sense /= n;
      st.speed /= n;
      st.energy /= n;
      st.age /= n;
    }
    return st;
  }

  lineage(cladeId) {
    const chain = [];
    let clade = this.clades.get(cladeId);
    while (clade) {
      if (clade.established) chain.push(clade);
      clade = this.clades.get(clade.parent);
    }
    return chain;
  }
}

function joinClades(ids) {
  const parts = [];
  ids.forEach((id, i) => {
    if (i > 0) parts.push(i === ids.length - 1 ? ' und ' : ', ');
    parts.push({ clade: id });
  });
  return parts;
}
