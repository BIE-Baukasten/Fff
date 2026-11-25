// ANIMA — the organism. One call to step() is one cognitive cycle:
// perceive → feel (homeostatic reward) → propose contents → workspace competition
// → attention schema → metacognition → Pavlovian prediction → language → memory
// → learn → act → physiology.
import { RNG } from './rng.js';
import { MLP, clamp } from './nn.js';
import { DEFAULTS, componentsFor, NEEDS, CHANNELS, CUES, ACTIONS, A, DIRS, LESIONS } from './config.js';
import { Body } from './body.js';
import { T } from './world.js';
import { Workspace } from './workspace.js';
import { AttentionSchema } from './attention.js';
import { Discriminator, Metacognition } from './metacog.js';
import { Pavlov } from './pavlov.js';
import { EpisodicMemory, CognitiveMap } from './memory.js';
import { WorldModel } from './worldmodel.js';
import { Lexicon } from './lexicon.js';
import { codeFor, CODE_DIM } from './codes.js';

export const N_IN = 30 + 4 + 2 + 4 + 8 + 4 + CODE_DIM + 1 + 5 + 1;
const NA = ACTIONS.length;

const NEED_OF = k => {
  if (k === 'obj:berry' || k === 'obj:futter' || k === 'sense:food' || k === 'goal:food') return 'energy';
  if (k === 'sense:water' || k === 'goal:water' || k === 'obj:wasser') return 'water';
  if (k === 'sense:shelter' || k === 'goal:shelter') return 'shelter';
  if (k === 'pain' || k === 'sense:thorn') return 'integrity';
  if (k === 'obj:toy' || k === 'sense:toy' || k === 'goal:explore') return 'curiosity';
  if (k === 'touch' || k === 'sense:user' || k.startsWith('word:')) return 'social';
  if (k.startsWith('need:')) return k.slice(5) === 'temp' ? 'shelter' : k.slice(5);
  return null;
};

export class Agent {
  constructor({ seed = 1, lesion = 'full', world, params = {}, name = 'Anima', start } = {}) {
    this.seed = seed; this.lesion = lesion; this.name = name;
    this.p = { ...DEFAULTS, ...params };
    this.c = componentsFor(lesion);
    this.rng = new RNG(seed * 101 + 3);
    const s = start || findStart(world, this.rng);
    this.body = new Body(s[0], s[1]);
    this.ws = new Workspace(this.c.gw, this.p);
    this.ast = new AttentionSchema(this.c.ast);
    this.disc = new Discriminator();
    this.meta = new Metacognition(this.c.meta);
    this.pav = new Pavlov(this.p);
    this.mem = new EpisodicMemory(this.c.memory);
    this.map = new CognitiveMap(this.c.memory, world.width, world.height);
    this.wm = new WorldModel(30, NA);
    this.lex = new Lexicon(seed);
    this.q = new MLP([N_IN, this.p.hidden, NA], seed, { lr: this.p.lrQ });
    this.qT = this.q.clone();
    this.replay = []; this.rIdx = 0; this.trainSteps = 0;
    this.t = 0;
    this.prev = null;
    this.lastAction = A.STAY; this.lastEvents = []; this.bodyEvents = [];
    this.prevDrive = this.body.drive();
    this.external = [];
    this.us = 0;
    this.affect = { valence: 0, arousal: 0, mood: 0, r: 0, ema: 0 };
    this.fam = { obj: {}, toy: {}, cue: {} };
    this.pending = [];
    this.berry = null;       // current perceptual evidence about the berry here
    this.nextBias = new Map();
    this.actBias = new Float64Array(NA);
    this.recalled = null; this.spont = null;
    this.plan = null;
    this.learning = true; this.allowed = null; this.forced = null;
    this.lastCallT = -999; this.lastUtterance = null;
    this.heardNow = [];
    this.stats = { ticks: 0, eatenGood: 0, eatenToxic: 0, drinks: 0, calls: 0, babbles: 0, words: 0, hurt: 0, sleepTicks: 0, homeoErr: 0, plays: 0 };
    this.log = [];
    this.concern = null;
  }

  // ------------------------------------------------------------------ helpers
  get alive() { return this.body.alive; }
  U(k) {
    if (k === 'shelter') {
      const b = this.body;
      return Math.max(b.urgency('temp'), b.urgency('rest') * (this.worldNight ? 1 : 0.4), this.worldNight ? 0.55 : 0); // nocturnal homing
    }
    return this.body.urgency(k);
  }
  rebaseline() { this.prevDrive = this.body.drive(); this.us = 0; }
  deliver(ev) { this.external.push(ev); }
  endEpisode() { if (this.replay.length) { const last = this.replay[(this.rIdx - 1 + this.replay.length) % this.replay.length]; if (last) last.done = true; } this.prev = null; this.pav.reset(); }
  note(text) { this.log.push({ t: this.t, text }); if (this.log.length > 80) this.log.shift(); }

  // ------------------------------------------------------------------ the cycle
  step(world) {
    if (!this.body.alive) return null;
    this.t++; this.stats.ticks++;
    this.worldNight = world.isNight();
    const b = this.body, p = this.p, c = this.c;
    const sleeping = b.sleeping;

    // 1. FEEL: homeostatic reward for what just happened
    const D = b.drive();
    let r;
    if (c.affect) r = p.rewardScale * (this.prevDrive - D) - p.painWeight * b.pain * 0.06;
    else r = this.fixedHedonics();
    r += this.palatability || 0; this.palatability = 0;
    this.prevDrive = D;
    this.affect.r = r;
    this.affect.ema = 0.85 * this.affect.ema + 0.15 * r;
    this.stats.homeoErr += D;

    // 2. PERCEIVE
    const sense = world.sense(b.x, b.y);
    const surprise = this.wm.step(sense, this.lastAction, this.learning);
    const here = world.objectsAt(b.x, b.y);
    const bush = here.find(o => o.type === 'bush' && o.berries > 0);
    const pellet = here.find(o => o.type === 'pellet');
    const toy = here.find(o => o.type === 'toy');
    const bowl = here.find(o => o.type === 'bowl');
    const terr = world.terrainAt(b.x, b.y);
    this.perceiveBerry(world, bush);
    const heard = world.heard.splice(0); this.heardNow = heard;
    const freshWords = heard.length ? this.lex.hear(heard, this.t) : [];
    const internal = [];
    if (freshWords.length) internal.push({ type: 'novelty', amount: 0.04 * freshWords.length });
    if (heard.length) {
      internal.push({ type: 'social', amount: 0.012 });
      if (this.t - this.lastCallT < 20) { internal.push({ type: 'social', amount: 0.05 }); this.note('Du hast mir geantwortet.'); }
    }
    for (const o of world.objects) {
      if (Math.abs(o.x - b.x) <= 3 && Math.abs(o.y - b.y) <= 3 && !this.fam.obj[o.id]) {
        this.fam.obj[o.id] = 1; if (this.t > 1 && o.type !== 'bush') internal.push({ type: 'novelty', amount: 0.06 });
      }
    }
    if (this.map.observe(world, b.x, b.y, this.t)) internal.push({ type: 'novelty', amount: 0.015 });
    if (!this.c.memory && this.rng.chance(0.02)) internal.push({ type: 'novelty', amount: 0.01 }); // amnesic: everything stays a bit new

    // 3. PROPOSE CONTENTS (specialist processors)
    const cands = [];
    const att = sleeping ? 0.15 : 1;
    const add = (key, sal, kind, label, data) => { if (sal > 0.03) cands.push({ key, sal, kind, label, data }); };
    for (const k of NEEDS) {
      const u = b.urgency(k);
      if (u > 0.12) add('need:' + k, c.affect ? 0.15 + 0.95 * u ** 1.3 : 0.45 * u, 'need', k);
    }
    if (b.pain > 0.04) add('pain', c.affect ? 0.35 + 1.3 * b.pain : 0.3 + 0.5 * b.pain, 'pain');
    CHANNELS.forEach((ch, i) => {
      if (ch === 'user' && !world.hand.active && world.voice < 0.1) return;
      let m = sense[i * 5]; for (let d = 1; d <= 4; d++) m = Math.max(m, sense[i * 5] + sense[i * 5 + d]);
      if (m < 0.12) return;
      const rel = c.affect ? 0.25 + (ch === 'thorn' ? 0.5 : this.U(ch === 'food' ? 'energy' : ch === 'water' ? 'water' : ch === 'shelter' ? 'shelter' : ch === 'toy' ? 'curiosity' : 'social')) : 0.55;
      add('sense:' + ch, att * (0.12 + 0.7 * m * rel), 'sense', ch);
    });
    if (bush) add('obj:berry', att * (0.55 + (c.affect ? 0.45 * b.urgency('energy') : 0.2)), 'object', 'berry', this.berry);
    if (pellet) add('obj:futter', att * 0.8, 'object', 'futter');
    if (toy) add('obj:toy', att * (0.4 + 0.5 * this.toyNovelty(toy.id)), 'object', 'toy');
    if (terr === T.POND || bowl) add('obj:wasser', att * (0.3 + (c.affect ? 0.5 * b.urgency('water') : 0.2)), 'object', 'wasser');
    for (const cu of CUES) {
      const lv = world.cueLevel(cu);
      if (lv <= 0) continue;
      const fam = this.fam.cue[cu] || 0;
      const nov = 1 / (1 + 0.04 * fam);
      const val = Math.min(0.8, Math.abs(this.pav.strengthOf(codeFor('cue:' + cu))) * 1.5);
      add('cue:' + cu, (sleeping ? 0.5 : 1) * lv * (0.35 + 0.45 * nov + val), 'cue', cu);
      this.fam.cue[cu] = fam + 0.1;
    }
    for (const w of heard) add('word:' + w, 0.75, 'word', w);
    if (b.touch > 0) add('touch', 0.85, 'touch');
    if (surprise > 4 && !sleeping) add('surprise', Math.min(0.9, 0.1 * surprise), 'surprise');
    if (this.lastAction !== null) add('act:' + this.actName(), 0.28, 'act', this.actName());
    if (this.recalled) add('mem:' + this.recalled.ep.id, (0.15 + 0.9 * this.recalled.score) * att * 1.3, 'memory', null, this.recalled.ep);
    if (this.spont) add('mem:' + this.spont.id, sleeping ? 0.95 : 0.8, 'memory', 'spontan', this.spont);
    // planning from the cognitive map
    this.plan = sleeping ? null : this.makePlan(world, sense);
    if (this.plan) add('goal:' + this.plan.kind, 0.2 + 0.75 * this.plan.u * Math.min(1, this.plan.value), 'goal', this.plan.kind, this.plan);
    // metacognitive feeling of uncertainty
    if (this.berry && this.berry.conf !== null && this.berry.conf < 0.7) add('unsicher', 0.7 * (1 - this.berry.conf), 'meta');

    // 4. CONCERN (what matters most now) + ATTENTION SCHEMA top-down control
    let concern = null, cs = 0;
    for (const cd of cands) {
      const n = NEED_OF(cd.key);
      const s = cd.sal * (n ? this.U(n) + 0.05 : cd.kind === 'cue' ? 0.3 : 0);
      if (s > cs) { cs = s; concern = cd.key; }
    }
    this.concern = concern;
    const bias = new Map(this.nextBias);
    for (const [k, v] of this.ast.biases(concern, Math.max(0.3, cs))) bias.set(k, (bias.get(k) || 0) + v);
    this.nextBias = new Map();

    // 5. GLOBAL WORKSPACE
    this.ws.step(cands, bias);
    this.ast.observe(this.ws, concern);
    const rep = this.ws.reportable();

    // 6. METACOGNITION about the berry judgement
    if (this.berry) {
      const piNow = this.ast.precision(this.ws, 'obj:berry');
      this.berry.piAcc = 0.6 * (this.berry.piAcc ?? 0) + (piNow ?? 0);
      this.berry.pi = piNow === null ? null : clamp(1 - Math.exp(-1.2 * this.berry.piAcc));
      this.berry.p = this.disc.p(this.berry.est);
      this.berry.conf = this.meta.confidence(this.berry.p, this.berry.pi);
    }

    // 7. PAVLOVIAN PREDICTION
    const V = this.pav.step(this.ws, this.us, this.learning);
    this.us = 0;

    // 8. LANGUAGE: associate words with what is in mind; understand known words
    this.lex.associate(rep, this.t);
    this.actBias.fill(0);
    for (const w of heard) {
      for (const [k, s] of this.lex.meaning(w, 3)) {
        if (k.startsWith('act:')) { const ai = this.actIndex(k.slice(4)); if (ai >= 0) this.actBias[ai] += 3 * s; }
        else this.nextBias.set(k, (this.nextBias.get(k) || 0) + 0.8 * s);
      }
    }

    // 9. MEMORY: recall for next cycle, spontaneous thought, map
    this.recalled = sleeping || this.t % 4 ? null : this.mem.recall(this.ws.contents, this.t);
    const rate = sleeping ? 0.05 : this.p.spontRate * this.ast.spontaneousGate(concern);
    this.spont = this.mem.spontaneous(this.rng, rate);
    if (this.t % 50 === 0) this.mem.decay();

    // 10. STATE VECTOR + LEARNING
    const x = this.stateVector(world, sense, V);
    if (this.prev && this.learning) this.pushTransition(this.prev.x, this.prev.a, r, x);
    if (this.learning && this.replay.length > 200 && this.t % p.trainEvery === 0) this.train(sleeping ? 2 : 1);

    // 11. ACT
    let a;
    if (sleeping) a = A.SLEEP;
    else if (this.forced !== null) a = this.forced;
    else a = this.choose(x, sense, V, { bush, pellet, toy, bowl, terr, world });
    if (this.prevTrans) { this.prevTrans.a2 = a; this.prevTrans = null; }
    this.prev = { x, a };
    this.lastAction = a;
    const events = world.applyAction(b, a);
    if (a === A.SLEEP && !sleeping) { b.fallAsleep(); this.note('Ich schlafe ein.'); }
    if (a === A.CALL) this.vocalize(world, rep);
    for (const e of events) this.onActionEvent(e);
    const bodyEv = b.update(world, events.concat(internal, this.external.splice(0)), this.t);
    for (const e of bodyEv) this.onBodyEvent(e);
    this.checkPendingBerries();
    this.lastEvents = events; this.bodyEvents = bodyEv;

    // 12. AFFECT read-out (what the organism's state amounts to, for observers)
    const af = this.affect;
    af.valence = Math.tanh(2.5 * af.ema);
    af.arousal = clamp(0.6 * this.prevDrive + 0.8 * b.pain + 0.08 * Math.min(4, surprise) + 0.3 * Math.min(1, Math.abs(r)) + (b.touch ? 0.1 : 0) - (sleeping ? 0.3 : 0));
    af.mood = 0.998 * af.mood + 0.002 * af.valence;
    this.encodeEpisode(events, bodyEv, heard);
    if (sleeping) this.stats.sleepTicks++;
    return a;
  }

  // ------------------------------------------------------------------ perception
  perceiveBerry(world, bush) {
    if (!bush) { this.berry = null; return; }
    const f = world.berryFeatures(bush);
    const share = this.ws.share('obj:berry');
    const sd = this.berrySd(share);
    const hs = clamp(f.hue + this.rng.normal(0, sd));
    let B = this.berry;
    if (!B || B.offer !== f) B = this.berry = { offer: f, bushId: bush.id, wsum: 0, hsum: 0, piAcc: 0, pi: null, p: 0.5, conf: null, looks: 0 };
    const w = 1 / (sd * sd);
    B.wsum = 0.6 * B.wsum + w; B.hsum = 0.6 * B.hsum + w * hs; B.looks++;
    B.sd = sd;
    B.est = { hue: B.hsum / B.wsum, spots: f.spots, size: f.size };
  }
  /** Perceptual noise: attention sharpens, fatigue blurs. */
  berrySd(share) { return 0.025 + 0.22 * (1 - Math.min(1, share * 1.6)) ** 2 + 0.06 * this.body.urgency('rest'); }
  toyNovelty(id) { return 1 / (1 + 0.25 * (this.fam.toy[id] || 0)); }

  makePlan(world, sense) {
    if (!this.c.memory) return null;
    const opts = [['food', this.U('energy'), 0], ['water', this.U('water'), 1], ['shelter', this.U('shelter'), 2], ['explore', 0.6 * this.U('curiosity'), -1]];
    opts.sort((x, y) => y[1] - x[1]);
    for (const [kind, u, ch] of opts.slice(0, 2)) {
      if (u < 0.2) continue;
      if (ch >= 0 && sense[ch * 5] > 0.5) continue; // already sensed nearby: taxis suffices
      const pl = this.map.plan(this.body.x, this.body.y, kind, this.t);
      if (pl && pl.dir >= 0) return { kind, u, ...pl };
    }
    return null;
  }

  stateVector(world, sense, V) {
    const x = new Float64Array(N_IN); let i = 0;
    const b = this.body;
    for (let c = 0; c < 6; c++) { x[i++] = sense[c * 5] * 2 - 0.5; for (let d = 1; d <= 4; d++) x[i++] = clamp(sense[c * 5 + d] * 6, -1, 1); }
    const B = this.berry;
    x[i++] = B ? 1 : 0; x[i++] = B ? (B.est.hue - 0.5) * 3 : 0; x[i++] = B ? B.est.spots - 0.5 : 0; x[i++] = B ? B.est.size - 1 : 0;
    x[i++] = B ? (B.p - 0.5) * 2 : 0; x[i++] = B && B.conf !== null ? (B.conf - 0.5) * 2 : 0;
    // attention acts as gain (precision) on exteroceptive signals
    for (const cu of CUES) x[i++] = world.cueLevel(cu) * (0.35 + 0.65 * Math.min(1, 1.6 * this.ws.share('cue:' + cu)));
    for (const k of NEEDS) x[i++] = b.urgency(k) * 2 - 0.5;
    x[i++] = b.pain * 2;
    x[i++] = b.sleeping ? 1 : 0; x[i++] = world.light() - 0.5; x[i++] = world.terrainAt(b.x, b.y) === T.CAVE ? 1 : 0; x[i++] = world.terrainAt(b.x, b.y) === T.POND ? 1 : 0;
    for (let d = 0; d < CODE_DIM; d++) x[i++] = Math.tanh(this.ws.g[d] * 0.6);
    x[i++] = Math.tanh(V);
    const pl = this.plan && (!this.c.gw || this.ws.has('goal:' + this.plan.kind)) ? this.plan : null;
    for (let d = 0; d < 4; d++) x[i++] = pl && pl.dir === d ? 1 : 0;
    x[i++] = pl ? pl.u : 0;
    x[i++] = 1;
    return x;
  }

  // ------------------------------------------------------------------ action
  innate(sense, V, o) {
    const b = this.body, c = this.c, bias = new Float64Array(NA);
    const U = k => (c.affect ? this.U(k) : 0.35);
    const taxis = [[0, U('energy')], [1, U('water')], [2, c.affect ? this.U('shelter') : 0.2], [4, 0.7 * U('curiosity')], [5, U('social')]];
    for (const [ch, u] of taxis) {
      if (u < 0.05) continue;
      let m = 0; for (let d = 1; d <= 4; d++) m = Math.max(m, Math.abs(sense[ch * 5 + d]));
      if (m < 0.004) continue;
      for (let d = 0; d < 4; d++) bias[d] += 2.4 * u * sense[ch * 5 + 1 + d] / m;
    }
    for (let d = 0; d < 4; d++) if (sense[3 * 5] + sense[3 * 5 + 1 + d] > 0.55) bias[d] -= 2.5; // thorn avoidance reflex
    if (o.bush && this.berry) bias[A.CONSUME] += 3 * (U('energy') + 0.1) * (3 * this.berry.p - 1.2 + U('energy') ** 2) - (this.berry.looks < 3 ? 2 : 0); // inspect before eating
    if (o.pellet) bias[A.CONSUME] += 3 * (U('energy') + 0.15);
    if (o.terr === T.POND || o.bowl) bias[A.CONSUME] += 3.5 * U('water');
    if (o.toy) bias[A.CONSUME] += 1.8 * U('curiosity');
    const night = this.worldNight ? 2 : 0.6, cave = o.terr === T.CAVE ? 1.8 : 1;
    const homing = this.worldNight && o.terr !== T.CAVE && this.plan && this.plan.kind === 'shelter' ? 0.3 : 1;
    bias[A.SLEEP] += ((c.affect ? 6 * b.urgency('rest') ** 1.5 : 0.25) * night * cave + (this.worldNight ? 1.6 * cave : 0)) * homing - 1.2; // + circadian
    const userNear = sense[5 * 5] > 0.3;
    const distress = Math.max(b.urgency('energy'), b.urgency('water'), b.pain * 1.5);
    bias[A.CALL] += (c.affect ? (userNear ? 2.6 : 0.6) * b.urgency('social') + (distress > 0.7 ? 1.2 : 0) : 0.3) - (userNear ? 1.3 : 2.3);
    bias[A.STAY] += 0.15;
    if (V > 0.15) bias[A.CONSUME] += 1.5 * Math.min(2, V); // anticipatory licking (conditioned response)
    const pl = this.plan;
    if (pl && pl.dir >= 0 && (!c.gw || this.ws.has('goal:' + pl.kind))) bias[pl.dir] += 2.0 * pl.u + 0.4;
    return bias;
  }

  choose(x, sense, V, o) {
    const q = this.q.predict(x);
    const inn = this.innate(sense, V, o);
    const logits = new Float64Array(NA);
    let mx = -Infinity;
    for (let a = 0; a < NA; a++) {
      logits[a] = this.p.betaQ * q[a] + inn[a] + this.actBias[a];
      if (this.allowed && !this.allowed[a]) logits[a] = -Infinity;
      if (logits[a] > mx) mx = logits[a];
    }
    const pr = Array.from(logits, l => Math.exp(l - mx));
    this.lastQ = q; this.lastInnate = inn; this.lastProbs = pr;
    return this.rng.categorical(pr);
  }

  pushTransition(x, a, r, x2) {
    const tr = { x, a, r, x2, a2: null, done: false };
    if (this.replay.length < this.p.replaySize) this.replay.push(tr); else this.replay[this.rIdx] = tr;
    this.rIdx = (this.rIdx + 1) % this.p.replaySize;
    this.prevTrans = tr;
  }
  train(nBatches = 1) {
    for (let k = 0; k < nBatches; k++) {
      const batch = [];
      for (let i = 0; i < this.p.batch; i++) {
        const tr = this.replay[this.rng.int(this.replay.length)];
        if (tr.a2 === null && !tr.done) continue;
        const target = tr.done ? tr.r : tr.r + this.p.gammaQ * this.qT.predict(tr.x2)[tr.a2];
        batch.push({ x: tr.x, idx: tr.a, target });
      }
      if (batch.length) this.q.trainBatch(batch);
      if (++this.trainSteps % this.p.targetEvery === 0) this.qT.copyFrom(this.q);
    }
  }

  vocalize(world, rep) {
    const contents = rep.filter(r => !r.key.startsWith('act:'));
    const u = this.lex.produce(contents.length ? contents : rep);
    this.lastCallT = this.t; this.stats.calls++;
    if (u.babble) this.stats.babbles++; else this.stats.words++;
    this.lastUtterance = { t: this.t, ...u };
    world.utterances.push({ t: world.t, text: u.word, babble: !!u.babble, key: u.key });
  }

  actName() {
    const a = this.lastAction;
    if (a <= 3) return 'gehen';
    if (a === A.CONSUME) {
      const e = this.lastEvents.find(e => e.type === 'eat' || e.type === 'drink' || e.type === 'play');
      return e ? ({ eat: 'essen', drink: 'trinken', play: 'spielen' })[e.type] : 'nehmen';
    }
    return ACTIONS[a];
  }
  actIndex(name) {
    if (name === 'gehen') return -1;
    if (['essen', 'trinken', 'spielen', 'nehmen'].includes(name)) return A.CONSUME;
    return ACTIONS.indexOf(name);
  }

  // ------------------------------------------------------------------ consequences
  onActionEvent(e) {
    const c = this.c, b = this.body;
    if (e.type === 'eat') {
      const hedon = c.affect ? e.taste * (0.4 + b.urgency('energy')) : e.taste;
      this.us += hedon;
      if (e.item === 'berry') {
        const B = this.berry;
        this.palatability = 1.6 * ((B ? B.p : 0.5) - 0.5); // learned taste (conditioned aversion)
        this.pending.push({ t: this.t, est: B ? B.est : e.features, p: B ? B.p : 0.5, pi: B ? B.pi : null, bushId: e.bushId });
        if (e.toxic) this.stats.eatenToxic++; else this.stats.eatenGood++;
      }
    } else if (e.type === 'drink') { this.us += 0.3 * (c.affect ? b.urgency('water') + 0.2 : 1); this.stats.drinks++; }
    else if (e.type === 'play') {
      this.fam.toy[e.toyId] = (this.fam.toy[e.toyId] || 0) + 1; this.stats.plays++;
      this.external.push({ type: 'novelty', amount: 0.07 * this.toyNovelty(e.toyId) + 0.01 });
      this.us += 0.3 * this.toyNovelty(e.toyId);
    } else if (e.type === 'thorn') this.us -= 0.5;
  }
  onBodyEvent(e) {
    if (e.type === 'nausea') {
      const i = this.pending.findLastIndex(pd => pd.bushId === e.bushId);
      const pd = i >= 0 ? this.pending.splice(i, 1)[0] : { est: e.features, p: 0.5, pi: null, bushId: e.bushId };
      this.disc.learn(pd.est, true); this.meta.learn(pd.p, pd.pi, pd.p < 0.5);
      this.map.learnBush(e.bushId, -1);
      this.us -= 1.2; this.note('Mir ist übel – diese Beere war giftig.');
    } else if (e.type === 'hurt') { this.us -= 6 * e.dmg; this.stats.hurt++; }
    else if (e.type === 'stroke') this.us += 0.05;
    else if (e.type === 'poke') this.us -= 0.1;
    else if (e.type === 'collapse') this.note('Ich bin vor Erschöpfung eingeschlafen.');
  }
  checkPendingBerries() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i];
      if (this.t - pd.t > 25) {
        this.pending.splice(i, 1);
        this.disc.learn(pd.est, false); this.meta.learn(pd.p, pd.pi, pd.p >= 0.5);
        this.map.learnBush(pd.bushId, 1);
      }
    }
  }
  fixedHedonics() {
    // reward without homeostatic affect: fixed values of events, blind to need state
    let r = 0;
    for (const e of this.lastEvents) {
      if (e.type === 'eat') r += 0.8; else if (e.type === 'drink') r += 0.25; else if (e.type === 'play') r += 0.3;
    }
    for (const e of this.bodyEvents) {
      if (e.type === 'hurt') r -= 8 * e.dmg; else if (e.type === 'stroke') r += 0.03; else if (e.type === 'nausea') r -= 1.0;
    }
    return r;
  }

  encodeEpisode(events, bodyEv, heard) {
    const all = events.concat(bodyEv);
    const ev = all.find(e => ['eat', 'nausea', 'hurt', 'play', 'stroke', 'poke', 'collapse'].includes(e.type))
      || (heard.length ? { type: 'word', words: heard } : null)
      || (all.find(e => e.type === 'drink') && this.stats.drinks % 6 === 1 ? { type: 'drink' } : null)
      || (this.ws.ignitions.some(k => k.startsWith('obj:') || k.startsWith('cue:')) ? { type: 'notice' } : null);
    if (!ev) return;
    const keys = this.ws.contents.filter(k => !k.startsWith('mem:'));
    const labels = keys.map(k => this.ws.info.get(k)?.label ?? k);
    const val = ev.type === 'nausea' || ev.type === 'hurt' ? -0.8 : ev.type === 'eat' && !ev.toxic ? 0.5 : ev.type === 'stroke' ? 0.4 : this.affect.valence;
    const e = this.mem.encode(this.t, this.body.x, this.body.y, keys, labels, val, this.affect.arousal, { type: ev.type, item: ev.item, words: ev.words });
    if (e && ['nausea', 'hurt', 'play', 'word'].includes(ev.type) && this.t - (this._lastNote || 0) > 20) this._lastNote = this.t;
  }

  // ------------------------------------------------------------------ introspection
  snapshot(world) {
    const b = this.body;
    const contents = this.ws.reportable().map(r => ({ key: r.key, a: r.a, kind: r.info?.kind, label: r.info?.label }));
    const pre = [...this.ws.a.entries()].filter(([k]) => !this.ws.has(k)).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, a]) => ({ key: k, a }));
    return {
      t: this.t, name: this.name, lesion: this.lesion, alive: b.alive, cause: b.causeOfDeath, age: b.age,
      x: b.x, y: b.y, sleeping: b.sleeping, h: { ...b.h }, pain: b.pain, drive: this.prevDrive,
      affect: { ...this.affect }, contents, preconscious: pre, ignitions: this.ws.ignitions.slice(),
      ast: this.ast.report(), concern: this.concern,
      berry: this.berry ? { p: this.berry.p, conf: this.berry.conf, pi: this.berry.pi, hue: this.berry.est.hue } : null,
      V: this.pav.V, plan: this.plan ? { kind: this.plan.kind, dist: this.plan.dist } : null,
      utterance: this.lastUtterance, stats: { ...this.stats }, action: ACTIONS[this.lastAction],
      probs: this.lastProbs ? normalise(this.lastProbs) : null,
    };
  }

  // ------------------------------------------------------------------ persistence
  toJSON() {
    return {
      v: 1, seed: this.seed, lesion: this.lesion, name: this.name, p: this.p, t: this.t,
      rng: this.rng.toJSON(), body: this.body.toJSON(), ws: this.ws.toJSON(), ast: this.ast.toJSON(),
      disc: this.disc.toJSON(), meta: this.meta.toJSON(), pav: this.pav.toJSON(), mem: this.mem.toJSON(), map: this.map.toJSON(),
      wm: this.wm.toJSON(), lex: this.lex.toJSON(), q: this.q.toJSON(), affect: this.affect, fam: this.fam, stats: this.stats, log: this.log,
      trainSteps: this.trainSteps,
    };
  }
  static fromJSON(o, world) {
    const a = new Agent({ seed: o.seed, lesion: o.lesion, world, params: o.p, name: o.name, start: [o.body.x, o.body.y] });
    a.t = o.t; a.rng = RNG.fromJSON(o.rng); a.body = Body.fromJSON(o.body); a.ws.load(o.ws); a.ast.load(o.ast);
    a.disc.load(o.disc); a.meta.load(o.meta); a.pav.load(o.pav); a.mem.load(o.mem); a.map.load(o.map); a.wm.load(o.wm); a.lex.load(o.lex);
    a.q = MLP.fromJSON(o.q); a.qT = a.q.clone(); a.affect = o.affect; a.fam = o.fam; a.stats = o.stats; a.log = o.log || []; a.trainSteps = o.trainSteps || 0;
    a.prevDrive = a.body.drive();
    return a;
  }
  /** Deep copy (used for experiments on a copy of a living individual, and for PCI). */
  clone(world) {
    const c = Agent.fromJSON(JSON.parse(JSON.stringify(this.toJSON())), world);
    c.replay = this.replay.map(t => ({ ...t })); c.rIdx = this.rIdx;
    return c;
  }
}

function normalise(p) { const s = p.reduce((a, b) => a + b, 0); return p.map(v => v / s); }
function findStart(world, rng) {
  for (let i = 0; i < 1000; i++) {
    const x = 1 + rng.int(world.width - 2), y = 1 + rng.int(world.height - 2);
    if (world.terrainAt(x, y) === T.GRASS && !world.objectsAt(x, y).length) return [x, y];
  }
  return [1, 1];
}
export { LESIONS };
