// Shared infrastructure: rearing, apparatus construction, trial helpers.
import { World, T } from '../core/world.js';
import { Agent } from '../core/agent.js';
import { CognitiveMap } from '../core/memory.js';
import { SETPOINT } from '../core/config.js';

export const REAR_TICKS = 12000;

/** Standardised rearing in the home world under lab conditions (clamped ambient temperature). */
export function rear(seed, lesion, ticks = REAR_TICKS, { lab = true } = {}) {
  const world = new World({ seed });
  if (lab) world.fixedAmbient = 0.5;
  const agent = new Agent({ seed, lesion, world });
  for (let i = 0; i < ticks && agent.alive; i++) { agent.step(world); world.step(); }
  return { agent, world };
}

/** Move a (copy of an) individual into an empty experimental box. */
export function apparatus(src, srcWorld, { w = 11, h = 11, seed = 1 } = {}) {
  const world = new World({ seed: seed + 999, width: w, height: h, layout: 'box' });
  world.moths = false; world.fixedAmbient = 0.5; world.fixedLight = 0.8;
  const agent = src.clone(srcWorld);
  agent.map = new CognitiveMap(agent.c.memory, w, h); // spatial memory is context specific
  agent.body.x = Math.floor(w / 2); agent.body.y = Math.floor(h / 2);
  agent.body.sleeping = false;
  agent.endEpisode();
  return { agent, world };
}

/** Hold the motivational state constant between trials (like a deprivation schedule). */
export function setState(agent, levels = {}) {
  const h = agent.body.h;
  for (const k of Object.keys(SETPOINT)) h[k] = levels[k] ?? (k === 'temp' ? 0.5 : SETPOINT[k]);
  agent.body.nausea = []; agent.body.nociception = levels.nociception ?? 0; agent.body.pain = 0;
  agent.body.sleeping = false;
  agent.rebaseline();
}

export function place(agent, x, y) { agent.body.x = x; agent.body.y = y; }

export function tick(agent, world) { const a = agent.step(world); world.step(); return a; }

export function mask(...actions) { const m = new Array(8).fill(false); for (const a of actions) m[a] = true; return m; }

export function clearObjects(world, pred = () => true) { for (const o of world.objects.slice()) if (pred(o)) world.removeObject(o); }

export { T };
