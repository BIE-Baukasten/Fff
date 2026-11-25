// The body: homeostatic variables, physiology, nociception, sleep, death.
import { NEEDS, SETPOINT, NEED_WEIGHT, DEFAULTS } from './config.js';
import { T } from './world.js';
import { clamp } from './nn.js';

export class Body {
  constructor(x = 5, y = 5) {
    this.x = x; this.y = y;
    this.h = { energy: 0.75, water: 0.75, temp: 0.5, integrity: 1, rest: 0.8, social: 0.6, curiosity: 0.6 };
    this.sleeping = false;
    this.sleepTicks = 0;
    this.alive = true;
    this.causeOfDeath = null;
    this.pain = 0;          // perceived pain (after analgesia)
    this.nociception = 0;   // raw tissue-damage signal
    this.analgesia = 0;     // 0..1 reduces perceived pain
    this.nausea = [];       // pending delayed illness [{t, dmg, bushId, features}]
    this.touch = 0;
    this.age = 0;
  }

  deficit(k) { return k === 'temp' ? this.h.temp - SETPOINT.temp : SETPOINT[k] - this.h[k]; }
  /** Positive deficits (urgency in 0..1) per need. */
  urgency(k) {
    if (k === 'temp') return clamp(Math.abs(this.h.temp - SETPOINT.temp) * 2.5);
    return clamp((SETPOINT[k] - this.h[k]) / SETPOINT[k]);
  }

  /** Homeostatic drive (Keramati & Gutkin 2014): D = (Σ w|d|^n)^(1/m) */
  drive() {
    let s = 0;
    for (const k of NEEDS) {
      let d = this.deficit(k);
      if (k !== 'temp' && d < 0) d *= 0.3; // over-satiation matters little
      s += NEED_WEIGHT[k] * Math.abs(d) ** 3;
    }
    return Math.sqrt(s);
  }

  /** Apply the physiological consequences of action events, then the passive dynamics. */
  update(world, events, t) {
    if (!this.alive) return [];
    const h = this.h, out = [];
    this.age++;
    let damage = 0;
    this.touch = 0;
    for (const e of events) {
      if (e.type === 'move') h.energy -= DEFAULTS.moveCost, h.temp += 0.0002;
      else if (e.type === 'thorn') { damage += e.dmg; }
      else if (e.type === 'eat') {
        h.energy += e.energy;
        if (e.toxic) this.nausea.push({ t: t + (e.nauseaDelay ?? 6), dmg: e.harm ?? 0.1, features: e.features, bushId: e.bushId });
      } else if (e.type === 'drink') h.water += e.amount, h.temp -= 0.003;
      else if (e.type === 'damage') damage += e.dmg;
      else if (e.type === 'social') h.social += e.amount;
      else if (e.type === 'novelty') h.curiosity += e.amount;
      else if (e.type === 'warm') h.temp += e.amount;
    }
    // delayed illness from toxic berries (Garcia-type long-delay consequences)
    for (let i = this.nausea.length - 1; i >= 0; i--) {
      if (this.nausea[i].t <= t) { const n = this.nausea.splice(i, 1)[0]; damage += n.dmg; out.push({ type: 'nausea', ...n }); }
    }
    // human touch
    const onMe = world.hand.active && world.hand.x === this.x && world.hand.y === this.y;
    if (onMe && world.hand.stroking) { this.touch = 1; h.social += 0.0045; out.push({ type: 'stroke' }); }
    if (world.hand.poke && Math.abs(world.hand.x - this.x) + Math.abs(world.hand.y - this.y) <= 1) {
      out.push({ type: 'poke' }); this.touch = 0.5; if (this.sleeping) this.wake('poke');
    }
    world.hand.poke = false;

    // passive dynamics
    const dec = DEFAULTS.decay;
    const awake = !this.sleeping;
    h.energy -= dec.energy * (awake ? 1 : 0.6);
    h.water -= dec.water * (1 + Math.max(0, world.ambientTemp(this.x, this.y) - 0.55) * 2) * (awake ? 1 : 0.6);
    if (h.social > 0.42) h.social -= awake ? dec.social : dec.social * 0.3; // attachment need saturates when alone
    h.curiosity -= awake ? dec.curiosity : -dec.curiosity * 0.5; // sleep resets boredom a little
    const amb = world.ambientTemp(this.x, this.y);
    const insulation = this.sleeping && world.terrainAt(this.x, this.y) === T.CAVE ? 0.5 : 1;
    h.temp += (amb - h.temp) * 0.0035 * insulation + (h.energy > 0.15 ? 0.0001 : 0); // metabolic heat
    if (awake) h.rest -= dec.rest * (world.isNight() ? 2.6 : 0.75); // circadian sleep pressure
    else {
      const inCave = world.terrainAt(this.x, this.y) === T.CAVE;
      h.rest += 0.0022 * (inCave ? 1.4 : 1) * (world.isNight() ? 1.2 : 1);
      this.sleepTicks++;
    }
    // thermal stress and starvation damage
    const tdev = Math.abs(h.temp - 0.5);
    if (tdev > 0.22) damage += (tdev - 0.22) * 0.004;
    if (h.energy < 0.05 || h.water < 0.05) damage += 0.0006;
    // healing
    if (h.energy > 0.3 && h.water > 0.3 && damage === 0) h.integrity += awake ? 0.00025 : 0.0007;
    h.integrity -= damage;
    if (damage > 0) out.push({ type: 'hurt', dmg: damage });

    // nociception: acute damage + chronic wound signal; perceived pain is modulated by analgesia
    this.nociception = clamp(0.85 * this.nociception + damage * 6 + 0.012 * Math.max(0, 0.85 - h.integrity) * 4);
    const zoneAnalgesia = world.analgesicCells.has(world.idx(this.x, this.y)) ? 0.85 : 0;
    this.analgesia = Math.max(this.analgesia * 0.97, zoneAnalgesia);
    this.pain = this.nociception * (1 - this.analgesia);

    for (const k of NEEDS) h[k] = clamp(h[k]);

    // sleep regulation (wake-up reflexes)
    if (this.sleeping) {
      if (h.rest >= 0.97 && !world.isNight()) this.wake('rested');
      else if (this.pain > 0.35) this.wake('pain');
      else if (this.urgency('energy') > 0.75 || this.urgency('water') > 0.75) this.wake('need');
      else if (this.touch > 0 && this.sleepTicks > 20 && world.hand.stroking === false) this.wake('touch');
    }
    if (!this.sleeping && h.rest <= 0.02) { this.sleeping = true; this.sleepTicks = 0; out.push({ type: 'collapse' }); }

    // death
    if (h.energy <= 0) this.die('Verhungert');
    else if (h.water <= 0) this.die('Verdurstet');
    else if (h.integrity <= 0) this.die(tdev > 0.22 ? 'Erfroren/Überhitzt' : 'Verletzungen');
    return out;
  }
  fallAsleep() { if (!this.sleeping) { this.sleeping = true; this.sleepTicks = 0; } }
  wake(reason) { this.sleeping = false; this.wakeReason = reason; this.sleepTicks = 0; }
  die(cause) { this.alive = false; this.causeOfDeath = cause; this.sleeping = false; }

  toJSON() { return { x: this.x, y: this.y, h: this.h, sleeping: this.sleeping, sleepTicks: this.sleepTicks, alive: this.alive, causeOfDeath: this.causeOfDeath, pain: this.pain, nociception: this.nociception, analgesia: this.analgesia, nausea: this.nausea, age: this.age }; }
  static fromJSON(o) { const b = new Body(); Object.assign(b, o); b.h = { ...o.h }; return b; }
}
