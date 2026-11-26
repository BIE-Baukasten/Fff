import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, seedFromText } from '../src/rng.js';
import { randomGenome, mutateGenome, genomeDistance, hueDistance, LIMITS, N_WEIGHTS, N_IN, N_HID, N_OUT } from '../src/genome.js';
import { think, weightIn, weightOut } from '../src/brain.js';
import { makeGenus, makeEpithet } from '../src/names.js';
import { World, DAY } from '../src/world.js';

test('Zufall ist reproduzierbar', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.notEqual(createRng(1).next(), createRng(2).next());
  assert.equal(seedFromText('Gezeiten'), seedFromText('Gezeiten'));
});

test('Mutationen bleiben in ihren Grenzen', () => {
  const rng = createRng(7);
  let g = randomGenome(rng);
  for (let i = 0; i < 2000; i++) g = mutateGenome(g, rng);
  assert.ok(g.size >= LIMITS.size[0] && g.size <= LIMITS.size[1]);
  assert.ok(g.sense >= LIMITS.sense[0] && g.sense <= LIMITS.sense[1]);
  assert.ok(g.mut >= LIMITS.mut[0] && g.mut <= LIMITS.mut[1]);
  assert.ok(g.hue >= 0 && g.hue < 360);
  assert.equal(g.w.length, N_WEIGHTS);
  for (const w of g.w) assert.ok(Number.isFinite(w) && Math.abs(w) <= 4);
});

test('Abstand: null zu sich selbst, wächst mit Mutation', () => {
  const rng = createRng(3);
  const g = randomGenome(rng);
  assert.equal(genomeDistance(g, g), 0);
  let h = g;
  for (let i = 0; i < 50; i++) h = mutateGenome(h, rng);
  assert.ok(genomeDistance(g, h) > genomeDistance(g, mutateGenome(g, rng)) * 0.5);
  assert.equal(hueDistance(350, 10), 20);
  assert.equal(hueDistance(10, 350), 20);
});

test('Gehirn: Gewichtsindizes stimmen mit dem Vorwärtslauf überein', () => {
  const w = new Float32Array(N_WEIGHTS);
  // Nur Eingang 3 → Neuron 5 → Ausgang 1 verdrahten.
  const k1 = 5 * N_IN + 3;
  const k2 = N_IN * N_HID + 1 * N_HID + 5;
  w[k1] = 2;
  w[k2] = 1.5;
  assert.equal(weightIn(w, 3, 5), 2);
  assert.equal(weightOut(w, 5, 1), 1.5);
  const inp = new Float32Array(N_IN);
  inp[3] = 0.5;
  const hid = new Float32Array(N_HID);
  const out = new Float32Array(N_OUT);
  think(w, inp, hid, out);
  assert.ok(Math.abs(hid[5] - Math.tanh(1)) < 1e-6);
  assert.ok(Math.abs(out[1] - Math.tanh(1.5 * Math.tanh(1))) < 1e-6);
  assert.equal(out[0], 0);
});

test('Namen sind eindeutig', () => {
  const rng = createRng(11);
  const genera = new Set();
  for (let i = 0; i < 60; i++) {
    const g = makeGenus(rng, genera);
    assert.match(g, /^[A-Z][a-z]+$/);
    assert.ok(!genera.has(g));
    genera.add(g);
  }
  const species = new Set();
  const traits = { hue: 120, size: 6, sense: 60, speed: 0.5, turn: 0.2, kills: 0 };
  for (let i = 0; i < 20; i++) {
    const e = makeEpithet(rng, traits, 'Testella', species);
    const name = `Testella ${e}`;
    assert.ok(!species.has(name), name);
    species.add(name);
  }
});

function fingerprint(w) {
  let h = w.creatures.length * 1000003 + w.t;
  for (const c of w.creatures) h = (h * 31 + Math.round(c.x * 10) + Math.round(c.y * 10) * 7) % 2147483647;
  return h;
}

test('Gleiche Saat ergibt die gleiche Geschichte', () => {
  const a = new World(99);
  const b = new World(99);
  for (let i = 0; i < 1500; i++) {
    a.step();
    b.step();
  }
  assert.equal(fingerprint(a), fingerprint(b));
  assert.deepEqual(
    a.events.map((e) => e.t),
    b.events.map((e) => e.t),
  );
});

test('Eine Welt bleibt über zwölf Tage belebt und numerisch gesund', () => {
  const w = new World(2026);
  for (let i = 0; i < DAY * 12; i++) w.step();
  assert.ok(w.creatures.length > 0, 'ausgestorben');
  for (const c of w.creatures) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.energy));
    assert.ok(c.x >= 0 && c.x < 1600 && c.y >= 0 && c.y < 1000);
    assert.ok(c.energy > 0 && c.energy <= c.maxE + 1e-9);
    assert.ok(w.clades.has(c.clade), 'Wesen ohne Art');
    assert.ok(w.displayClade(c.clade), 'Art ohne benannten Vorfahren');
  }
  for (const a of w.algae) assert.ok(Number.isFinite(a) && a >= 0);
  // Bestandszählung der Arten stimmt mit den lebenden Wesen überein.
  const counted = new Map();
  for (const c of w.creatures) counted.set(c.clade, (counted.get(c.clade) || 0) + 1);
  for (const [id, clade] of w.clades) assert.equal(clade.pop, counted.get(id) || 0, `Art ${id}`);
  assert.ok(w.history.length > 10);
  assert.ok(w.births > 0);
});

test('Chronik verweist nur auf bekannte Arten', () => {
  const w = new World(5);
  for (let i = 0; i < DAY * 8; i++) w.step();
  for (const e of w.events) {
    for (const p of e.parts) {
      if (typeof p === 'object' && p.clade) {
        const clade = w.clades.get(p.clade);
        assert.ok(clade && clade.established && clade.name, `Ereignis bei t=${e.t} nennt unbekannte Art`);
      }
    }
  }
});

test('Deterministische Mathematik stimmt mit Math überein', async () => {
  const { dexp, dlog, dsin, dcos, dtanh, datan2 } = await import('../src/detmath.js');
  const rng = createRng(123);
  const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} ≠ ${b}`);
  for (let i = 0; i < 4000; i++) {
    const x = rng.range(-40, 40);
    close(dexp(x), Math.exp(x), 4e-15, `exp(${x})`);
    const y = Math.exp(rng.range(-60, 60));
    close(dlog(y), Math.log(y), 4e-15, `log(${y})`);
    const a = rng.range(-1300, 1300);
    close(dsin(a), Math.sin(a), 2e-13, `sin(${a})`);
    close(dcos(a), Math.cos(a), 2e-13, `cos(${a})`);
    const t = rng.range(-8, 8);
    close(dtanh(t), Math.tanh(t), 4e-15, `tanh(${t})`);
    const u = rng.range(-5, 5);
    const v = rng.range(-5, 5);
    close(datan2(u, v), Math.atan2(u, v), 4e-15, `atan2(${u}, ${v})`);
  }
  assert.equal(dlog(1), 0);
  assert.equal(dexp(0), 1);
  assert.equal(datan2(0, 0), 0);
  assert.equal(dtanh(50), 1);
});

test('Uhr: Start um 8 Uhr an Tag 1, Tageswechsel um Mitternacht', () => {
  const w = new World(1);
  assert.deepEqual(w.clock(0), { day: 1, hour: 8, minute: 0 });
  assert.deepEqual(w.clock(DAY * (16 / 24)), { day: 2, hour: 0, minute: 0 });
  assert.deepEqual(w.clock(DAY * (16 / 24) - 1).day, 1);
  assert.deepEqual(w.clock(DAY), { day: 2, hour: 8, minute: 0 });
  // Mittag ist am hellsten.
  const noon = DAY * (4 / 24);
  assert.ok(w.dayFactor(noon) > 0.999);
});

test('Eingriffe wirken und stehen in der Chronik', () => {
  const w = new World(8);
  for (let i = 0; i < 300; i++) w.step();
  w.intervene('bloom');
  assert.ok(w.algae.every((a) => a >= 0.7));
  w.intervene('murk');
  assert.equal(w.murk(), 1);
  const before = w.creatures.map((c) => [c.x, c.y]);
  w.intervene('current');
  assert.ok(w.creatures.some((c, i) => c.x !== before[i][0]));
  for (const c of w.creatures) assert.ok(c.x >= 0 && c.x < 1600 && c.y >= 0 && c.y < 1000);
  for (let i = 0; i < DAY + 5; i++) w.step();
  assert.equal(w.murk(), 0);
  assert.equal(w.events.filter((e) => String(e.parts[0]).startsWith('Eingriff')).length, 3);
  assert.throws(() => w.intervene('meteor'));
});

function trajectory(params, days = 6, seed = 31) {
  const w = new World(seed, { params });
  for (let i = 0; i < DAY * days; i++) w.step();
  return { w, fp: fingerprint(w) };
}

test('Beobachtung verändert die Dynamik nicht: Artschwelle und Namen sind rein beschreibend', () => {
  const a = trajectory({ speciation: 1.8, establishAt: 5 });
  const b = trajectory({ speciation: 3.5, establishAt: 20 });
  assert.equal(a.fp, b.fp);
  assert.equal(a.w.counters.births, b.w.counters.births);
  // Die Zählung der Arten hängt dagegen sehr wohl von der Schwelle ab.
  assert.ok(a.w.clades.size >= b.w.clades.size);
});

test('Parameter: Räuber, Einwanderung und Störung lassen sich schalten', () => {
  const noPred = trajectory({ predation: false }).w;
  assert.equal(noPred.counters.eaten, 0);
  assert.ok(noPred.creatures.every((c) => !c.attacking));

  const noImm = trajectory({ immigration: false, minPopulation: 1000 }).w;
  assert.equal(noImm.counters.immigrants, 0);

  const storm = trajectory({ disturbEvery: 2, disturbStrength: 0.5 }).w;
  assert.ok(storm.counters.disturbed > 0);
  assert.throws(() => new World(1, { params: { gibtsNicht: 1 } }), /Unbekannter Parameter/);
});

test('Messwerte sind vollständig und plausibel', async () => {
  const { measure, METRIC_KEYS, toCsv } = await import('../src/metrics.js');
  const { w } = trajectory({}, 4);
  const m = measure(w);
  for (const k of METRIC_KEYS) assert.ok(Number.isFinite(m[k]), k);
  assert.equal(m.pop, w.creatures.length);
  assert.ok(m.simpson >= 0 && m.simpson < 1);
  assert.ok(m.effSpecies >= 1 - 1e-9 && m.effSpecies <= m.richness + 1e-9);
  assert.ok(m.geneticDiv > 0 && m.evolvedDiv > 0 && m.evolvedDiv <= m.geneticDiv * 1.5);
  assert.ok(m.lineages >= 1 && m.lineages <= m.richness);
  assert.ok(m.attackShare >= 0 && m.attackShare <= 1);
  const csv = toCsv([m], { seed: 31 });
  assert.equal(csv.split('\n')[0].split(',').length, METRIC_KEYS.length + 1);
  assert.ok(w.history.at(-1).m.pop >= 0);
});

test('CSV: Felder mit Komma werden in Anführungszeichen gesetzt', async () => {
  const { csvField, toCsv } = await import('../src/metrics.js');
  assert.equal(csvField('0,0040'), '"0,0040"');
  assert.equal(csvField('a"b'), '"a""b"');
  assert.equal(csvField('x,"y"'), '"x,""y"""');
  assert.equal(csvField(12), '12');
  const line = toCsv([{}], { level: '2,5' }).split('\n')[1];
  assert.ok(line.startsWith('"2,5",'));
});
