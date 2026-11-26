import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lz76, pciLZ, auroc, logistic, bootstrapCI, hedgesG, eigSym } from '../src/experiments/stats.js';

test('Lempel–Ziv complexity: constant < periodic < random', () => {
  const c = lz76('0'.repeat(64)), p = lz76('01'.repeat(32));
  let r = ''; let s = 12345; for (let i = 0; i < 64; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; r += (s >> 16) & 1; }
  assert.ok(c <= p && p < lz76(r));
  assert.equal(pciLZ([[0, 0, 0]]), 0);
});
test('AUROC', () => {
  assert.equal(auroc([0.9, 0.8, 0.1, 0.2], [1, 1, 0, 0]), 1);
  assert.equal(auroc([0.5, 0.5], [1, 0]), 0.5);
});
test('logistic regression recovers effect signs', () => {
  const X = [], y = []; let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 600; i++) { const a = rnd(), b = rnd(); X.push([a, b]); y.push(rnd() < 1 / (1 + Math.exp(-(3 * a - 3 * b))) ? 1 : 0); }
  const w = logistic(X, y);
  assert.ok(w[1] > 1 && w[2] < -1);
});
test('bootstrap CI and Hedges g', () => {
  const ci = bootstrapCI([1, 2, 3, 4, 5]);
  assert.ok(ci[0] < 3 && ci[1] > 3);
  assert.ok(hedgesG([0, 1, 0, 1], [3, 4, 3, 4]) > 2);
});
test('Jacobi eigen-decomposition', () => {
  const { values } = eigSym([[2, 1], [1, 2]]);
  assert.ok(Math.abs(values[0] - 3) < 1e-9 && Math.abs(values[1] - 1) < 1e-9);
});
