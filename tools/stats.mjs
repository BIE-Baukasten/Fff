// Kleine, voraussetzungsarme Statistik für Simulationsversuche.
// Alles mit festem Zufallsstrom, damit ein Bericht reproduzierbar ist.
//
// Versuchsplan: gepaarte Saaten ("common random numbers"). Jede Saat läuft auf jeder
// Stufe des Faktors; Unterschiede werden innerhalb einer Saat gebildet. Das nimmt die
// Streuung zwischen Welten heraus und macht Tests deutlich schärfer.

import { createRng } from '../src/rng.js';

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// 95-%-Konfidenzintervall des Mittelwerts per Bootstrap (Perzentilmethode).
export function bootstrapCI(xs, { reps = 4000, seed = 7, level = 0.95 } = {}) {
  if (xs.length < 2) return [NaN, NaN];
  const rng = createRng(seed);
  const ms = new Float64Array(reps);
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[rng.int(xs.length)];
    ms[r] = s / xs.length;
  }
  const sorted = Array.from(ms).sort((a, b) => a - b);
  return [quantile(sorted, (1 - level) / 2), quantile(sorted, 1 - (1 - level) / 2)];
}

// Vorzeichen-Permutationstest für gepaarte Differenzen (H0: Mittelwert 0), zweiseitig.
// Bis 16 Paare exakt (alle 2^n Vorzeichen), darüber 20 000 Zufallsvorzeichen.
export function signFlipTest(diffs, { reps = 20000, seed = 11 } = {}) {
  const n = diffs.length;
  if (n === 0) return NaN;
  const obs = Math.abs(mean(diffs));
  let extreme = 0;
  let total = 0;
  const tol = 1e-12 * Math.max(1, obs);
  if (n <= 16) {
    for (let mask = 0; mask < 1 << n; mask++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += mask & (1 << i) ? -diffs[i] : diffs[i];
      if (Math.abs(s / n) >= obs - tol) extreme++;
      total++;
    }
    return extreme / total;
  }
  const rng = createRng(seed);
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rng.next() < 0.5 ? -diffs[i] : diffs[i];
    if (Math.abs(s / n) >= obs - tol) extreme++;
  }
  return (extreme + 1) / (reps + 1);
}

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a, b) {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

export function spearman(x, y) {
  return pearson(ranks(x), ranks(y));
}

// Trendtest über geordnete Stufen: Spearman-ρ zwischen Stufenindex und Antwort,
// p-Wert durch Vertauschen der Stufen innerhalb jeder Saat (Blockpermutation).
// blocks: Array von Saaten, jede ein Array der Antworten je Stufe (gleiche Reihenfolge).
export function trendTest(blocks, { reps = 10000, seed = 13 } = {}) {
  const k = blocks[0].length;
  const flat = (bs) => {
    const xs = [];
    const ys = [];
    for (const b of bs) b.forEach((v, lvl) => (xs.push(lvl), ys.push(v)));
    return [xs, ys];
  };
  const [xs, ys] = flat(blocks);
  const rho = spearman(xs, ys);
  const rng = createRng(seed);
  let extreme = 0;
  for (let r = 0; r < reps; r++) {
    const shuffled = blocks.map((b) => {
      const c = b.slice();
      for (let i = k - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    });
    const [, ys2] = flat(shuffled);
    if (Math.abs(spearman(xs, ys2)) >= Math.abs(rho) - 1e-12) extreme++;
  }
  return { rho, p: (extreme + 1) / (reps + 1) };
}

// Höcker-Kontrast (vorab festgelegt, nicht nach Ansicht der Daten):
// Mittel der inneren Stufen minus Mittel der beiden äußeren, je Saat; dann Vorzeichentest.
export function humpTest(blocks) {
  const k = blocks[0].length;
  const contrasts = blocks.map((b) => mean(b.slice(1, k - 1)) - (b[0] + b[k - 1]) / 2);
  return { contrast: mean(contrasts), ci: bootstrapCI(contrasts), p: signFlipTest(contrasts), contrasts };
}

// Effektstärke für gepaarte Daten: mittlere Differenz / SD der Differenzen (Cohens d_z).
export function cohensDz(diffs) {
  const s = sd(diffs);
  return s > 0 ? mean(diffs) / s : NaN;
}
