// Small, dependency-free statistics toolkit for the marker study.
import { RNG } from '../core/rng.js';

export const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
export const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };

export function bootstrapCI(a, { n = 10000, seed = 42, alpha = 0.05 } = {}) {
  const v = a.filter(Number.isFinite);
  if (v.length < 2) return [NaN, NaN];
  const r = new RNG(seed), ms = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < v.length; j++) s += v[r.int(v.length)]; ms[i] = s / v.length; }
  ms.sort();
  return [ms[Math.floor((alpha / 2) * n)], ms[Math.floor((1 - alpha / 2) * n)]];
}

/** Hedges' g (bias-corrected standardized mean difference, b − a). */
export function hedgesG(a, b) {
  a = a.filter(Number.isFinite); b = b.filter(Number.isFinite);
  if (a.length < 2 || b.length < 2) return NaN;
  const sp = Math.sqrt(((a.length - 1) * sd(a) ** 2 + (b.length - 1) * sd(b) ** 2) / (a.length + b.length - 2));
  const J = 1 - 3 / (4 * (a.length + b.length) - 9);
  return sp > 0 ? J * (mean(b) - mean(a)) / sp : 0;
}

/** Logistic regression by Newton–Raphson with a small ridge. X rows without intercept. */
export function logistic(X, y, { ridge = 1e-3, iter = 30 } = {}) {
  const n = X.length, k = X[0].length + 1;
  const Z = X.map(r => [1, ...r]);
  let w = new Array(k).fill(0);
  for (let it = 0; it < iter; it++) {
    const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      let s = 0; for (let j = 0; j < k; j++) s += w[j] * Z[i][j];
      const p = 1 / (1 + Math.exp(-s)), q = p * (1 - p);
      for (let j = 0; j < k; j++) { g[j] += (y[i] - p) * Z[i][j]; for (let l = 0; l < k; l++) H[j][l] += q * Z[i][j] * Z[i][l]; }
    }
    for (let j = 0; j < k; j++) { g[j] -= ridge * w[j]; H[j][j] += ridge; }
    const d = solve(H, g);
    if (!d) break;
    let mx = 0; for (let j = 0; j < k; j++) { w[j] += d[j]; mx = Math.max(mx, Math.abs(d[j])); }
    if (mx < 1e-7) break;
  }
  return w;
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Area under ROC: P(score of positive > score of negative). */
export function auroc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return NaN;
  let a = 0;
  for (const p of pos) for (const q of neg) a += p > q ? 1 : p === q ? 0.5 : 0;
  return a / (pos.length * neg.length);
}

/** Lempel–Ziv (1976) complexity of a binary string (Kaspar–Schuster algorithm). */
export function lz76(s) {
  const n = s.length; if (n < 2) return n;
  let c = 1, l = 1, i = 0, k = 1, kmax = 1;
  while (true) {
    if (s[i + k - 1] === s[l + k - 1]) { k++; if (l + k > n) { c++; break; } }
    else { if (k > kmax) kmax = k; i++; if (i === l) { c++; l += kmax; if (l + 1 > n) break; i = 0; k = 1; kmax = 1; } else k = 1; }
  }
  return c;
}
/** PCI-style normalised complexity of a binary matrix (rows = units, cols = time). */
export function pciLZ(mat) {
  const rows = mat.length, cols = rows ? mat[0].length : 0, L = rows * cols;
  if (!L) return 0;
  let s = '', ones = 0;
  for (let t = 0; t < cols; t++) for (let r = 0; r < rows; r++) { const b = mat[r][t] ? 1 : 0; s += b; ones += b; }
  const p = ones / L;
  if (p === 0 || p === 1) return 0;
  const H = -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  return (lz76(s) * Math.log2(L)) / (L * H);
}

export function pearson(a, b) {
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}
/** Eigen-decomposition of a symmetric matrix by Jacobi rotations. */
export function eigSym(M) {
  const n = M.length, A = M.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-14) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  const vals = A.map((r, i) => r[i]);
  const order = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
  return { values: order.map(i => vals[i]), vectors: order.map(i => V.map(r => r[i])) };
}
