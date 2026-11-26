import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, sd, bootstrapCI, signFlipTest, spearman, trendTest, humpTest, cohensDz } from '../tools/stats.mjs';

test('Mittelwert und Standardabweichung', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138089935) < 1e-8);
});

test('Vorzeichentest: exakte Werte', () => {
  // Alle vier Differenzen positiv: nur "alle +" und "alle −" sind so extrem → 2/16.
  assert.equal(signFlipTest([1, 2, 3, 4]), 2 / 16);
  // Symmetrische Daten: Mittel 0, jede Umordnung ist mindestens so extrem.
  assert.equal(signFlipTest([1, -1, 2, -2]), 1);
  // Große Stichprobe mit klarem Effekt: sehr kleiner p-Wert (zufällige Vorzeichen).
  const big = Array.from({ length: 30 }, (_, i) => 1 + (i % 3) * 0.1);
  assert.ok(signFlipTest(big) < 0.001);
});

test('Bootstrap-Intervall umschließt den Mittelwert und ist reproduzierbar', () => {
  const xs = [3.1, 2.9, 3.4, 3.0, 2.7, 3.3, 3.2, 2.8];
  const [lo, hi] = bootstrapCI(xs);
  assert.ok(lo < mean(xs) && mean(xs) < hi);
  assert.ok(hi - lo < 0.6);
  assert.deepEqual(bootstrapCI(xs), [lo, hi]);
});

test('Spearman, Trend- und Höckertest', () => {
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
  // Zwölf Saaten mit steigendem Trend plus Rauschen.
  const blocks = Array.from({ length: 12 }, (_, s) => [0, 1, 2, 3, 4].map((l) => l + ((s * 7 + l * 3) % 5) * 0.2));
  const tr = trendTest(blocks, { reps: 2000 });
  assert.ok(tr.rho > 0.8 && tr.p < 0.01, JSON.stringify(tr));
  // Höcker: innen hoch, außen niedrig.
  const hump = Array.from({ length: 12 }, (_, s) => [1, 3, 4, 3, 1].map((v, l) => v + ((s + l) % 3) * 0.1));
  const h = humpTest(hump);
  assert.ok(h.contrast > 1.5 && h.p < 0.001);
  // Kein Höcker bei flachen Daten.
  const flat = Array.from({ length: 12 }, (_, s) => [2, 2, 2, 2, 2].map((v, l) => v + (((s * 3 + l * 5) % 7) - 3) * 0.1));
  assert.ok(humpTest(flat).p > 0.05);
});

test('Effektstärke d_z', () => {
  assert.ok(Math.abs(cohensDz([1, 2, 3]) - 2) < 1e-12);
});
