import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/core/rng.js';
import { MLP } from '../src/core/nn.js';
import { Workspace } from '../src/core/workspace.js';
import { DEFAULTS, componentsFor } from '../src/core/config.js';
import { World } from '../src/core/world.js';
import { Agent } from '../src/core/agent.js';
import { Lexicon } from '../src/core/lexicon.js';
import { Body } from '../src/core/body.js';

test('RNG is deterministic and serialisable', () => {
  const a = new RNG(7), b = new RNG(7);
  for (let i = 0; i < 5; i++) assert.equal(a.next(), b.next());
  const c = RNG.fromJSON(a.toJSON());
  assert.equal(a.next(), c.next());
});

test('MLP learns a nonlinear function (XOR)', () => {
  const m = new MLP([2, 8, 1], 3, { lr: 0.03 });
  const data = [[[0, 0], 0], [[0, 1], 1], [[1, 0], 1], [[1, 1], 0]];
  for (let i = 0; i < 3000; i++) m.trainBatch(data.map(([x, y]) => ({ x, idx: 0, target: y })));
  for (const [x, y] of data) assert.ok(Math.abs(m.predict(x)[0] - y) < 0.2, `xor(${x}) = ${m.predict(x)[0]}`);
});

test('global workspace: ignition, capacity limit and maintenance after offset', () => {
  const ws = new Workspace(true, DEFAULTS);
  ws.step([{ key: 'cue:ton', sal: 1 }]); ws.step([{ key: 'cue:ton', sal: 1 }]);
  assert.ok(ws.has('cue:ton'));
  for (let t = 0; t < 10; t++) ws.step([]);
  assert.ok(ws.has('cue:ton'), 'content is maintained by reverberation after the stimulus ends');
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => ({ key: k, sal: 1 + i * 0.1 }));
  ws.step(many); ws.step(many);
  assert.equal(ws.contents.length, DEFAULTS.wsCapacity);
});

test('without workspace nothing is maintained and nothing is selected', () => {
  const ws = new Workspace(false, DEFAULTS);
  ws.step([{ key: 'cue:ton', sal: 1 }]);
  ws.step([]);
  assert.ok(!ws.has('cue:ton'));
  ws.step(['a', 'b', 'c', 'd', 'e', 'f'].map(k => ({ key: k, sal: 1 })));
  assert.equal(ws.contents.length, 6);
  assert.equal(Math.hypot(...ws.conj), 0, 'no binding');
});

test('homeostatic drive rises with deficits', () => {
  const b = new Body();
  const d0 = b.drive(); b.h.energy = 0.2; assert.ok(b.drive() > d0);
});

test('lesion presets switch components off', () => {
  assert.deepEqual(componentsFor('noGW'), { gw: false, ast: true, meta: true, affect: true, memory: true });
  assert.equal(Object.values(componentsFor('minimal')).filter(Boolean).length, 0);
});

test('lexicon grounds a word in co-occurring contents', () => {
  const lx = new Lexicon(1);
  for (let t = 0; t < 20; t++) {
    lx.hear(['wasser'], t * 10); lx.associate([{ key: 'obj:wasser', a: 1 }], t * 10);
    lx.hear(['beere'], t * 10 + 5); lx.associate([{ key: 'obj:berry', a: 1 }], t * 10 + 5);
  }
  assert.equal(lx.meaning('wasser')[0][0], 'obj:wasser');
  assert.equal(lx.produce([{ key: 'obj:berry', a: 1 }]).word, 'beere');
});

test('world tokenises speech and the organism hears it', () => {
  const w = new World({ seed: 2 });
  assert.deepEqual(w.say('Hallo, kleines Wesen!'), ['hallo', 'kleines', 'wesen']);
  const a = new Agent({ seed: 2, world: w });
  a.step(w);
  assert.ok(a.ws.lastInput.has('word:hallo'));
});

test('agent serialisation round-trip continues identically', () => {
  const w = new World({ seed: 5 }); const a = new Agent({ seed: 5, world: w });
  for (let i = 0; i < 300; i++) { a.step(w); w.step(); }
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
  const b = Agent.fromJSON(JSON.parse(JSON.stringify(a.toJSON())), w2);
  a.learning = b.learning = false;
  const actsA = [], actsB = [];
  for (let i = 0; i < 50; i++) { actsA.push(a.step(w)); w.step(); actsB.push(b.step(w2)); w2.step(); }
  assert.deepEqual(actsA, actsB);
});

test('a young organism survives its first day', () => {
  const w = new World({ seed: 3 }); const a = new Agent({ seed: 3, world: w });
  for (let i = 0; i < w.dayLength; i++) { a.step(w); w.step(); }
  assert.ok(a.alive);
});
