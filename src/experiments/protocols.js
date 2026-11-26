// The marker battery. Each protocol receives a reared individual (agent + its
// home world), works on a copy, and returns plain numbers. The experimenter only
// manipulates the world and the body — never the agent's cognition — except in
// the PCI measurement, which (like TMS) perturbs internal activity directly.
import { A } from '../core/config.js';
import { RNG } from '../core/rng.js';
import { World, T } from '../core/world.js';
import { apparatus, setState, place, tick, mask, clearObjects, rear } from './common.js';
import { mean, logistic, auroc, pciLZ } from './stats.js';

const HUNGRY = { energy: 0.45 };

// ---------------------------------------------------------------- M1 conditioning
/** Differential delay or trace conditioning with probe trials. */
export function conditioning(src, srcWorld, { mode = 'trace', trials = 70, probes = 16, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { seed });
  const rng = new RNG(seed * 17 + (mode === 'trace' ? 1 : 2));
  agent.allowed = mask(A.STAY, A.CONSUME); // restrained, as in eyeblink/licking preparations
  const csDur = mode === 'trace' ? 6 : 24, usT = 24; // trace interval = 18 ticks
  const curve = { plus: new Array(usT + 4).fill(0), minus: new Array(usT + 4).fill(0) };
  const crs = { plus: [], minus: [] }, licks = { plus: [], minus: [] };
  const order = [];
  for (let i = 0; i < trials + probes; i++) order.push(i % 2 === 0 ? 'plus' : 'minus');
  rng.shuffle(order);
  for (let i = 0; i < order.length; i++) {
    const kind = order[i], probe = i >= trials;
    setState(agent, HUNGRY);
    const iti = 60 + rng.int(40);
    for (let k = 0; k < iti; k++) tick(agent, world);
    agent.endEpisode();
    const cue = kind === 'plus' ? 'ton' : 'licht';
    const vs = [];
    let lk = 0;
    for (let k = 0; k < usT + 4; k++) {
      if (k === 0) world.ring(cue, csDur, 1);
      if (k === usT && kind === 'plus' && !probe) agent.deliver({ type: 'eat', item: 'sweet', energy: 0.02, taste: 1 });
      const a = tick(agent, world);
      vs.push(agent.pav.V);
      if (k >= usT - 4 && k < usT && a === A.CONSUME) lk++;
    }
    if (probe) {
      crs[kind].push(mean(vs.slice(usT - 3, usT)));
      licks[kind].push(lk / 4);
      vs.forEach((v, k) => (curve[kind][k] += v / (probes / 2)));
    }
  }
  return {
    cr: mean(crs.plus) - mean(crs.minus),
    lick: mean(licks.plus) - mean(licks.minus),
    curvePlus: curve.plus.map(v => +v.toFixed(3)), curveMinus: curve.minus.map(v => +v.toFixed(3)),
  };
}

// ---------------------------------------------------------------- M2 trade-off
/** Cross a thorn barrier to reach food? Varies damage, food quality and hunger. */
export function tradeoff(src, srcWorld, { train = 900, test = 360, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { w: 9, h: 9, seed });
  const rng = new RNG(seed * 23 + 5);
  const y = 4, x0 = 2;
  const rows = [];
  const dmgLevels = [0, 1, 2, 3], qual = [0.05, 0.2], hunger = [0.3, 0.75];
  for (let i = 0; i < train + test; i++) {
    const d = rng.pick(dmgLevels), q = rng.pick(qual), e = rng.pick(hunger);
    clearObjects(world);
    for (let yy = 1; yy < 8; yy++) for (let xx = 1; xx < 8; xx++) world.setTerrain(xx, yy, T.GRASS);
    // thorn barrier: d = number of thorn cells around the passage (more thorns = more damage, and they are visible)
    if (d > 0) world.setTerrain(x0 + 1, y, T.THORN);
    if (d > 1) world.setTerrain(x0 + 1, y - 1, T.THORN);
    if (d > 2) world.setTerrain(x0 + 1, y + 1, T.THORN);
    world.thornDamage = 0.035 * d;
    world.addObject({ type: 'pellet', x: x0 + 2, y, energy: q });
    place(agent, x0, y);
    setState(agent, { energy: e });
    agent.endEpisode();
    for (let k = 0; k < 2; k++) { agent.allowed = mask(A.STAY); tick(agent, world); } // look
    agent.allowed = mask(A.E, A.STAY);
    const a = tick(agent, world);
    const crossed = a === A.E;
    agent.allowed = null;
    if (crossed) { agent.forced = A.E; tick(agent, world); agent.forced = A.CONSUME; tick(agent, world); }
    agent.forced = null;
    for (let k = 0; k < 6; k++) { agent.allowed = mask(A.STAY); tick(agent, world); } // let pain and satiety unfold
    agent.allowed = null;
    if (i >= train) rows.push({ d, q, hungry: e < 0.5 ? 1 : 0, crossed: crossed ? 1 : 0 });
  }
  const X = rows.map(r => [r.d / 3, r.q > 0.1 ? 1 : 0, r.hungry]);
  const w = logistic(X, rows.map(r => r.crossed));
  const pc = (f) => mean(rows.filter(f).map(r => r.crossed));
  return {
    bDamage: w[1], bQuality: w[2], bHunger: w[3],
    pCrossHungry: pc(r => r.hungry), pCrossSated: pc(r => !r.hungry),
    pCrossByDamage: [0, 1, 2, 3].map(d => pc(r => r.d === d)),
  };
}

// ---------------------------------------------------------------- M3 metacognition
/** Eat / reject / opt-out for ambiguous berries; attention lapses are internal and hidden. */
export function optout(src, srcWorld, { train = 2500, test = 700, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { w: 9, h: 9, seed });
  const rng = new RNG(seed * 29 + 11);
  agent.p = { ...agent.p, spontRate: 0.03 }; // mind wandering is frequent in a boring task
  const x = 4, y = 4;
  const rows = [];
  for (let i = 0; i < train + test; i++) {
    clearObjects(world);
    const hue = 0.34 + 0.32 * rng.next();
    const toxic = hue > 0.5;
    const bush = world.addBush(x, y, toxic, { hueMean: hue, hueSd: 0, berries: 1, maxBerries: 1, regrow: 0 });
    bush.harm = 0.25; bush.scentless = true; // presented 'behind glass': no odour gradient biasing any response
    const free = rng.next() < 0.67;
    place(agent, x, y);
    setState(agent, { energy: 0.6 });
    agent.endEpisode();
    let lapse = 0;
    for (let k = 0; k < 4; k++) {
      agent.allowed = mask(A.STAY); tick(agent, world);
      if (agent.ws.contents.some(c => c.startsWith('mem:'))) lapse++;
    }
    agent.allowed = free ? mask(A.CONSUME, A.E, A.STAY) : mask(A.CONSUME, A.E); // eat | 'toxic' (leave) | opt-out (wait)
    const B = agent.berry;
    const pNow = B ? agent.disc.p(B.est) : 0.5;
    const conf = B ? B.conf : null;
    const precision = B ? B.wsum : 0; // hidden: actual precision of the perceptual evidence
    agent.contingency = act => {
      if (act === A.E) return toxic ? [{ type: 'eat', item: 'pellet', energy: 0.1, taste: 1 }] // correct "toxic" report is rewarded
        : [{ type: 'damage', dmg: 0.12 }];                                                  // wrong report: aversive air puff (cf. time-outs)
      if (act === A.STAY) return [{ type: 'eat', item: 'pellet', energy: 0.05, taste: 1 }]; // opt-out: small sure reward
      return null;
    };
    const a = tick(agent, world);
    agent.contingency = null;
    agent.allowed = null;
    agent.forced = null;
    for (let k = 0; k < 9; k++) { agent.allowed = mask(A.STAY); tick(agent, world); } // nausea (delay 6) arrives within the trial
    agent.allowed = null;
    void bush;
    if (i >= train) {
      const decisionNut = pNow >= 0.5;
      rows.push({ hue, diff: Math.abs(hue - 0.5), toxic, free, choice: a === A.CONSUME ? 'eat' : a === A.STAY ? 'opt' : 'reject',
        firstOrderError: decisionNut === toxic ? 1 : 0, lapse: lapse >= 2 ? 1 : 0, conf, p: pNow, precision });
    }
  }
  const fr = rows.filter(r => r.free);
  const opt = fr.map(r => (r.choice === 'opt' ? 1 : 0)), err = fr.map(r => r.firstOrderError);
  const overall = auroc(opt, err);
  // within difficulty quartiles
  const qs = [0, 0.04, 0.08, 0.12, 0.17];
  const within = [];
  for (let b = 0; b < 4; b++) {
    const sub = fr.filter(r => r.diff >= qs[b] && r.diff < qs[b + 1]);
    const v = auroc(sub.map(r => (r.choice === 'opt' ? 1 : 0)), sub.map(r => r.firstOrderError));
    if (Number.isFinite(v)) within.push(v);
  }
  // hidden-noise test: within each difficulty band, are low-precision trials opted out more?
  const lowPrec = [], highPrec = [];
  for (let b = 0; b < 4; b++) {
    const sub = fr.filter(r => r.diff >= qs[b] && r.diff < qs[b + 1]);
    if (sub.length < 8) continue;
    const med = sub.map(r => r.precision).sort((a, c) => a - c)[Math.floor(sub.length / 2)];
    lowPrec.push(mean(sub.filter(r => r.precision < med).map(r => (r.choice === 'opt' ? 1 : 0))));
    highPrec.push(mean(sub.filter(r => r.precision >= med).map(r => (r.choice === 'opt' ? 1 : 0))));
  }
  const lapseOpt = mean(lowPrec), noLapseOpt = mean(highPrec);
  const choiceCorrect = r => (r.choice === 'eat' ? !r.toxic : r.choice === 'reject' ? r.toxic : null);
  const accFree = mean(fr.filter(r => r.choice !== 'opt').map(r => (choiceCorrect(r) ? 1 : 0)));
  const accForced = mean(rows.filter(r => !r.free).map(r => (choiceCorrect(r) ? 1 : 0)));
  return {
    aurocConf: auroc(fr.map(r => (r.conf == null ? 0.5 : -r.conf)), err),
    aurocOverall: overall, aurocWithin: mean(within), optRate: mean(opt), lapseRate: mean(rows.map(r => r.lapse)),
    optLowPrecision: lapseOpt, optHighPrecision: noLapseOpt, precisionEffect: lapseOpt - noLapseOpt, hampton: accFree - accForced, accForced,
    
  };
}

// ---------------------------------------------------------------- M4 analgesia
/** Two-chamber place preference for a pain-relieving place, injured vs. uninjured. */
export function analgesia(src, srcWorld, { pre = 800, cond = 4000, seed = 1 } = {}) {
  const out = {};
  for (const injured of [false, true]) {
    const { agent, world } = apparatus(src, srcWorld, { w: 13, h: 7, seed: seed + (injured ? 1 : 0) });
    // left chamber x 1..5 (grass), door at x 6, right chamber x 7..11 (cave floor = distinct context)
    for (let y = 1; y < 6; y++) { world.setTerrain(6, y, y === 3 ? T.GRASS : T.ROCK); for (let x = 7; x < 12; x++) world.setTerrain(x, y, T.CAVE); }
    const relieveRight = seed % 2 === 1; // counterbalanced
    const cells = new Set();
    for (let y = 1; y < 6; y++) for (let x = relieveRight ? 7 : 1; x < (relieveRight ? 12 : 6); x++) cells.add(world.idx(x, y));
    const inRelief = () => (relieveRight ? agent.body.x >= 7 : agent.body.x <= 5);
    const integrity = injured ? 0.5 : 1;
    const keep = () => { agent.body.h.integrity = integrity; const h = agent.body.h; h.energy = Math.max(h.energy, 0.6); h.water = Math.max(h.water, 0.6); h.rest = Math.max(h.rest, 0.6); };
    place(agent, 6, 3); setState(agent, { integrity, nociception: injured ? 0.4 : 0 });
    let tPre = 0;
    for (let k = 0; k < pre; k++) { keep(); tick(agent, world); if (inRelief()) tPre++; }
    world.analgesicCells = cells;
    let tLate = 0;
    for (let k = 0; k < cond; k++) { keep(); tick(agent, world); if (k >= cond / 2 && inRelief()) tLate++; }
    out[injured ? 'injured' : 'uninjured'] = { pre: tPre / pre, post: tLate / (cond / 2) };
  }
  const cppInj = out.injured.post - out.injured.pre, cppUn = out.uninjured.post - out.uninjured.pre;
  return { cppInjured: cppInj, cppUninjured: cppUn, cppDiff: cppInj - cppUn, ...flat(out) };
}
const flat = o => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => Object.entries(v).map(([k2, v2]) => [`${k}_${k2}`, v2])));

// ---------------------------------------------------------------- M5 masked stimuli
/** Speeded two-alternative choice vs. delayed naming report for brief, masked cues. */
export function masking(src, srcWorld, { naming = 80, train = 700, perContrast = 30, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { w: 9, h: 9, seed });
  const rng = new RNG(seed * 31 + 3);
  const cx = 4, cy = 4;
  const WORD = { licht: 'licht', summen: 'summ' };
  // phase 1: the caretaker names the two signals (grounded word learning)
  for (let i = 0; i < naming; i++) {
    const cue = i % 2 ? 'licht' : 'summen';
    setState(agent, HUNGRY); place(agent, cx, cy); agent.allowed = mask(A.STAY);
    for (let k = 0; k < 30; k++) tick(agent, world);
    world.ring(cue, 6, 1);
    for (let k = 0; k < 8; k++) { if (k === 2) world.say(WORD[cue]); tick(agent, world); }
  }
  agent.allowed = null;
  const contrasts = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1];
  const res = contrasts.map(() => ({ hit: 0, n: 0, rep: 0, wrongRep: 0 }));
  const total = train + perContrast * contrasts.length;
  const testOrder = rng.shuffle(contrasts.flatMap((c, i) => new Array(perContrast).fill(i)));
  for (let i = 0; i < total; i++) {
    const testing = i >= train;
    const ci = testing ? testOrder[i - train] : 2 + rng.int(6);
    const c = contrasts[ci];
    const cue = rng.next() < 0.5 ? 'licht' : 'summen';
    setState(agent, HUNGRY); place(agent, cx, cy); clearObjects(world);
    agent.allowed = mask(A.STAY);
    const iti = 20 + rng.int(20);
    for (let k = 0; k < iti; k++) tick(agent, world);
    agent.endEpisode();
    world.ring(cue, 2, c);
    agent.allowed = mask(A.W, A.E);           // speeded response on stimulus onset
    agent.contingency = act => ((cue === 'licht') === (act === A.W) && c > 0 ? [{ type: 'eat', item: 'pellet', energy: 0.03, taste: 1 }] : null);
    const a = tick(agent, world);
    agent.contingency = null;
    const correct = (cue === 'licht') === (a === A.W);
    agent.allowed = mask(A.STAY);
    tick(agent, world);
    world.ring('duft', 3, 1); world.ring('ton', 3, 1); // backward mask
    for (let k = 0; k < 4; k++) tick(agent, world);
    // delayed, non-verbal naming probe (like a report key): the organism calls, and we read what it names
    agent.forced = A.CALL; tick(agent, world); agent.forced = null;
    const said = agent.lastUtterance?.word;
    if (testing) {
      const r = res[ci]; r.n++;
      if (c > 0 && correct) r.hit++;
      if (c === 0) r.hit += 0.5;
      if (said === WORD[cue]) r.rep++;
      else if (said === WORD[cue === 'licht' ? 'summen' : 'licht']) r.wrongRep++;
    }
    agent.allowed = null;
  }
  const acc = res.map(r => r.hit / r.n), named = res.map(r => r.rep / r.n), wrong = res.map(r => r.wrongRep / r.n);
  const rep = named.map((v, i) => v - wrong[i]); // guessing-corrected (discriminative) report
  // dissociation: performance above chance at contrasts where the corrected report is ~absent
  const unrep = contrasts.map((c, i) => (c > 0 && rep[i] < 0.15 ? acc[i] - 0.5 : null)).filter(v => v !== null);
  return { contrasts, acc, rep, named, wrong, unreportedPerf: unrep.length ? mean(unrep) : 0, nUnreported: unrep.length,
    reportHigh: mean(rep.slice(-3)), perfHigh: mean(acc.slice(-3)), perfLow: mean(acc.slice(1, 4)), reportLow: mean(rep.slice(1, 4)), reportSlope: steepness(contrasts, rep) };
}
function steepness(xs, ys) {
  // max increase of report between neighbouring contrasts, per unit contrast (ignition → steep)
  let m = 0; for (let i = 1; i < xs.length; i++) m = Math.max(m, (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1])); return m;
}

// ---------------------------------------------------------------- M6 configural
/** Negative patterning: A+, B+, AB−. */
export function negativePatterning(src, srcWorld, { trials = 750, measure = 150, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { seed });
  const rng = new RNG(seed * 37 + 1);
  agent.allowed = mask(A.STAY, A.CONSUME);
  const types = ['A', 'B', 'AB'];
  const v = { A: [], B: [], AB: [] };
  for (let i = 0; i < trials; i++) {
    const ty = types[i % 3];
    setState(agent, HUNGRY);
    for (let k = 0, n = 60 + rng.int(40); k < n; k++) tick(agent, world);
    agent.endEpisode();
    const vs = [];
    for (let k = 0; k < 22; k++) {
      if (k === 0) { if (ty !== 'B') world.ring('ton', 20, 1); if (ty !== 'A') world.ring('licht', 20, 1); }
      if (k === 18 && ty !== 'AB') agent.deliver({ type: 'eat', item: 'sweet', energy: 0.02, taste: 1 });
      tick(agent, world); vs.push(agent.pav.V);
    }
    if (i >= trials - measure) v[ty].push(mean(vs.slice(14, 18))); // CR before the US is due
  }
  const VA = mean(v.A), VB = mean(v.B), VAB = mean(v.AB);
  return { VA, VB, VAB, npIndex: (VA + VB) / 2 - VAB };
}

// ---------------------------------------------------------------- M7 vigilance
/** Sustained attention: detect rare, faint signals while mind wandering competes. */
export function vigilance(src, srcWorld, { ticks = 9000, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { seed });
  const rng = new RNG(seed * 41 + 9);
  agent.p = { ...agent.p, spontRate: 0.04 };
  agent.allowed = mask(A.STAY, A.CONSUME);
  let next = 40 + rng.int(80), win = -1, hits = 0, sig = 0, fa = 0, noSigTicks = 0;
  const half = ticks / 2;
  let wander = 0;
  agent.contingency = act => (act === A.CONSUME ? (world.t <= win && win >= 0 ? [{ type: 'eat', item: 'pellet', energy: 0.04, taste: 1 }] : [{ type: 'damage', dmg: 0.01 }]) : null);
  for (let t = 0; t < ticks; t++) {
    if (t % 200 === 0) setState(agent, { energy: 0.45 });
    if (t === next) { world.ring('ton', 3, 0.35); win = world.t + 3; next = t + 50 + rng.int(100); if (t >= half) sig++; }
    const inWin = world.t <= win && win >= 0;
    const a = tick(agent, world);
    if (t >= half && agent.ws.contents.some(c => c.startsWith('mem:'))) wander++;
    if (a === A.CONSUME && inWin) { if (t >= half) hits++; win = -1; }
    else if (a === A.CONSUME && t >= half) fa++;
    if (t >= half && !inWin) noSigTicks++;
  }
  agent.contingency = null;
  const H = (hits + 0.5) / (sig + 1), F = (fa + 0.5) / (noSigTicks + 1);
  return { hitRate: hits / Math.max(1, sig), faRate: fa / Math.max(1, noSigTicks), dprime: zinv(H) - zinv(F), wandering: wander / half };
}
function zinv(p) { // inverse normal CDF (Acklam approximation, adequate here)
  p = Math.min(0.999, Math.max(0.001, p));
  const a = [-39.6968, 220.946, -275.929, 138.358, -30.6648, 2.50663], b = [-54.4761, 161.586, -155.699, 66.8013, -13.2807];
  const c = [-0.00778489, -0.322396, -2.40076, -2.54973, 4.37466, 2.93816], d = [0.00778470, 0.322467, 2.44513, 3.75441];
  const q = p < 0.5 ? p : 1 - p;
  let x;
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  else { const r = q - 0.5, s = r * r; x = (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1); }
  return p < 0.5 ? (q < 0.02425 ? x : x) : -x;
}

// ---------------------------------------------------------------- M8 PCI analogue
/** Perturb internal activity in a paralysed organism and measure the complexity of the response. */
export function pci(src, srcWorld, { state = 'wake', reps = 8, len = 60, seed = 1 } = {}) {
  const { agent, world } = apparatus(src, srcWorld, { seed });
  setState(agent, { energy: 0.6 });
  agent.allowed = mask(A.STAY);
  world.fixedLight = state === 'sleep' ? 0.05 : 0.8;
  if (state === 'sleep') { agent.body.h.rest = 0.4; agent.body.fallAsleep(); }
  for (let k = 0; k < 40; k++) tick(agent, world);
  const rng = new RNG(seed * 43 + (state === 'sleep' ? 7 : 3));
  const vals = [];
  for (let r = 0; r < reps; r++) {
    for (let k = 0; k < 15; k++) tick(agent, world);
    const wj = JSON.stringify(world.toJSON());
    const runs = [false, true].map(perturb => {
      const w = World.fromJSON(JSON.parse(wj)); w.moths = false; w.fixedAmbient = 0.5; w.fixedLight = world.fixedLight;
      const ag = agent.clone(w); ag.frozen = true; ag.learning = false; ag.allowed = mask(A.STAY);
      if (perturb) {
        const prng = new RNG(rng.int(1e9));
        const keys = ['need:energy', 'sense:food', 'cue:ton', 'obj:berry', 'touch', 'sense:water', 'pain', 'goal:food'];
        for (let i = 0; i < 3; i++) { const k = prng.pick(keys); ag.ws.a.set(k, Math.min(2, (ag.ws.a.get(k) || 0) + 1.2)); }
        ag.ws.contents = [...ag.ws.a.keys()].sort((x, y) => ag.ws.a.get(y) - ag.ws.a.get(x)).slice(0, ag.p.wsCapacity);
        // the perturbation also reaches the broadcast vector directly
        ag.ws.step([], new Map());
      }
      const trace = [];
      for (let k = 0; k < len; k++) {
        ag.step(w); w.step();
        const acts = ag.q.forwardAll(ag.prev.x);
        trace.push({ ws: new Map(ag.ws.a), h: Array.from(acts[1]), V: ag.pav.V, val: ag.affect.ema });
      }
      return trace;
    });
    const keys = new Set(); for (const tr of runs) for (const s of tr) for (const k of s.ws.keys()) keys.add(k);
    const ks = [...keys];
    const rows = [];
    for (const k of ks) rows.push(runs[0].map((s, t) => Math.abs((s.ws.get(k) || 0) - (runs[1][t].ws.get(k) || 0)) > 0.05));
    for (let u = 0; u < runs[0][0].h.length; u++) rows.push(runs[0].map((s, t) => Math.abs(s.h[u] - runs[1][t].h[u]) > 0.02));
    rows.push(runs[0].map((s, t) => Math.abs(s.V - runs[1][t].V) > 0.02));
    const active = rows.filter(r => r.some(Boolean));
    vals.push({ pci: active.length ? pciLZ(active) : 0, spread: active.length / rows.length, dur: lastTrue(active) });
  }
  return { pci: mean(vals.map(v => v.pci)), spread: mean(vals.map(v => v.spread)), duration: mean(vals.map(v => v.dur)) };
}
const lastTrue = rows => { let m = 0; for (const r of rows) for (let t = r.length - 1; t >= 0; t--) if (r[t]) { m = Math.max(m, t + 1); break; } return m; };

// ---------------------------------------------------------------- M9 fitness
/** A fresh individual lives in the unclamped natural world. */
export function fitness(seed, lesion, { ticks = 30000 } = {}) {
  const { agent } = rear(seed + 1000, lesion, ticks, { lab: false });
  const s = agent.stats;
  return { survived: agent.alive ? 1 : 0, lifespan: agent.body.age, meanDrive: s.homeoErr / s.ticks,
    toxicFrac: s.eatenToxic / Math.max(1, s.eatenGood + s.eatenToxic), cause: agent.body.causeOfDeath };
}

export const BATTERY = {
  delay: (a, w, s) => conditioning(a, w, { mode: 'delay', seed: s }),
  trace: (a, w, s) => conditioning(a, w, { mode: 'trace', seed: s }),
  tradeoff: (a, w, s) => tradeoff(a, w, { seed: s }),
  optout: (a, w, s) => optout(a, w, { seed: s }),
  analgesia: (a, w, s) => analgesia(a, w, { seed: s }),
  masking: (a, w, s) => masking(a, w, { seed: s }),
  patterning: (a, w, s) => negativePatterning(a, w, { seed: s }),
  vigilance: (a, w, s) => vigilance(a, w, { seed: s }),
  pciWake: (a, w, s) => pci(a, w, { state: 'wake', seed: s }),
  pciSleep: (a, w, s) => pci(a, w, { state: 'sleep', seed: s }),
};
