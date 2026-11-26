// Zwei Ansichten der Geschichte: der Bestand je Art über die Zeit, und der Stammbaum.

import { DAY } from './world.js';
import { cladeColor } from './render.js';
import { INPUT_LABELS, OUTPUT_LABELS, N_IN, N_HID, N_OUT } from './genome.js';
import { weightIn, weightOut } from './brain.js';

const INK = '#d8e8e4';
const MUTED = 'rgba(143, 176, 176, 0.9)';
const GRID = 'rgba(143, 176, 176, 0.14)';
const MONO = '11px "JetBrains Mono", ui-monospace, monospace';

export function prepCanvas(canvas, cssHeight) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, canvas.clientWidth);
  const h = cssHeight ?? Math.max(1, canvas.clientHeight);
  if (cssHeight) canvas.style.height = `${cssHeight}px`;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceMax(v) {
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return v;
}

export function drawPopulation(canvas, world) {
  const { ctx, w, h } = prepCanvas(canvas);
  const hist = world.history;
  const pad = { l: 34, r: 8, t: 14, b: 20 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (hist.length < 2 || iw < 20) return;

  const t0 = hist[0].t;
  const t1 = Math.max(hist[hist.length - 1].t, t0 + DAY);
  let maxPop = 0;
  for (const s of hist) if (s.pop > maxPop) maxPop = s.pop;
  const yMax = niceMax(maxPop * 1.05);
  const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v) => pad.t + ih - (v / yMax) * ih;

  // Raster und Achsen.
  ctx.font = MONO;
  ctx.fillStyle = MUTED;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 2; i++) {
    const v = (yMax / 2) * i;
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(v)), pad.l - 6, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const days = (t1 - t0) / DAY;
  const step = days <= 8 ? 1 : days <= 20 ? 2 : days <= 50 ? 5 : days <= 120 ? 10 : 25;
  for (let d = Math.ceil(t0 / DAY / step) * step; d <= t1 / DAY; d += step) {
    const x = X(d * DAY);
    if (x < pad.l + 4) continue;
    ctx.fillText(`T${d + 1}`, x, h - pad.b + 5);
  }

  // Gestapelte Flächen, Arten nach Entstehung geordnet (älteste unten).
  const ids = new Set();
  for (const s of hist) for (const id of s.counts.keys()) ids.add(id);
  const order = [...ids].sort((a, b) => a - b);
  const base = new Float64Array(hist.length);
  for (const id of order) {
    const clade = world.clades.get(id);
    ctx.fillStyle = clade ? cladeColor(clade, 55, 52) : 'rgba(143,176,176,0.5)';
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const v = base[i] + (hist[i].counts.get(id) || 0);
      const x = X(hist[i].t);
      if (i === 0) ctx.moveTo(x, Y(v));
      else ctx.lineTo(x, Y(v));
    }
    for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(X(hist[i].t), Y(base[i]));
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < hist.length; i++) base[i] += hist[i].counts.get(id) || 0;
  }

  // Algendichte als feine Linie (0 … 1 über die volle Höhe).
  ctx.strokeStyle = 'rgba(95, 207, 152, 0.9)';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = 0; i < hist.length; i++) {
    const x = X(hist[i].t);
    const y = pad.t + ih - Math.min(1, hist[i].algae) * ih;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Kleine Kerben oben markieren, wann eine neue Art entstand.
  for (const clade of world.clades.values()) {
    if (!clade.established || !clade.parent || clade.born < t0) continue;
    const x = X(clade.born);
    ctx.fillStyle = cladeColor(clade, 75, 62);
    ctx.beginPath();
    ctx.moveTo(x - 3.5, pad.t - 6);
    ctx.lineTo(x + 3.5, pad.t - 6);
    ctx.lineTo(x, pad.t);
    ctx.closePath();
    ctx.fill();
  }

  // Endpunkt betonen.
  const last = hist[hist.length - 1];
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(X(last.t), Y(last.pop), 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function ticksFor(lo, hi, n = 3) {
  if (!(hi > lo)) hi = lo + 1;
  const step0 = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(10));
  if (out.at(-1) < hi) out.push(+(out.at(-1) + step).toPrecision(10));
  return out;
}

const deNum = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

// Verlauf einer Messgröße über die Zeit.
export function drawSeries(canvas, world, key) {
  const { ctx, w, h } = prepCanvas(canvas);
  const hist = world.history.filter((s) => s.m);
  const pad = { l: 40, r: 10, t: 10, b: 20 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (hist.length < 2 || iw < 20) return;
  const vals = hist.map((s) => s.m[key]);
  const ticks = ticksFor(Math.min(0, ...vals), Math.max(...vals) * 1.05 || 1);
  const lo = ticks[0];
  const hi = ticks.at(-1);
  const t0 = hist[0].t;
  const t1 = Math.max(hist.at(-1).t, t0 + DAY);
  const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;

  ctx.font = MONO;
  ctx.strokeStyle = GRID;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of ticks) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillText(deNum.format(v), pad.l - 6, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const days = (t1 - t0) / DAY;
  const step = days <= 8 ? 1 : days <= 20 ? 2 : days <= 50 ? 5 : days <= 120 ? 10 : 25;
  for (let d = Math.ceil(t0 / DAY / step) * step; d <= t1 / DAY; d += step) {
    const x = X(d * DAY);
    if (x > pad.l + 4) ctx.fillText(`T${d + 1}`, x, h - pad.b + 5);
  }

  ctx.beginPath();
  hist.forEach((s, i) => (i ? ctx.lineTo(X(s.t), Y(vals[i])) : ctx.moveTo(X(s.t), Y(vals[i]))));
  ctx.lineTo(X(hist.at(-1).t), Y(lo));
  ctx.lineTo(X(hist[0].t), Y(lo));
  ctx.closePath();
  ctx.fillStyle = 'rgba(240, 180, 94, 0.14)';
  ctx.fill();
  ctx.beginPath();
  hist.forEach((s, i) => (i ? ctx.lineTo(X(s.t), Y(vals[i])) : ctx.moveTo(X(s.t), Y(vals[i]))));
  ctx.strokeStyle = '#f0b45e';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(X(hist.at(-1).t), Y(vals.at(-1)), 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// Ordnet benannte Arten als Baum: jedes Kind direkt unter seinem Elternteil.
export function treeRows(world) {
  const est = [...world.clades.values()].filter((c) => c.established);
  const kids = new Map();
  const roots = [];
  for (const c of est) {
    const parent = world.displayClade(c.parent);
    c._treeParent = parent ? parent.id : null;
    if (parent) {
      if (!kids.has(parent.id)) kids.set(parent.id, []);
      kids.get(parent.id).push(c);
    } else roots.push(c);
  }
  const rows = [];
  const visit = (c, depth) => {
    rows.push({ clade: c, depth });
    const list = (kids.get(c.id) || []).sort((a, b) => a.born - b.born);
    for (const k of list) visit(k, depth + 1);
  };
  roots.sort((a, b) => a.born - b.born).forEach((r) => visit(r, 0));
  return rows;
}

export const TREE_ROW = 15;

export function drawTree(canvas, world, highlight) {
  const rows = treeRows(world);
  const height = Math.max(150, rows.length * TREE_ROW + 30);
  const { ctx, w } = prepCanvas(canvas, height);
  // Rechts eine eigene Spalte für die Namen; lebende Arten enden alle bei "heute".
  const labelW = Math.min(150, Math.max(90, w * 0.36));
  const pad = { l: 8, r: labelW + 10, t: 10 };
  const t1 = Math.max(world.t, DAY);
  const X = (t) => pad.l + (t / t1) * (w - pad.l - pad.r);
  const index = new Map(rows.map((r, i) => [r.clade.id, i]));
  const Y = (i) => pad.t + i * TREE_ROW + TREE_ROW / 2;

  ctx.font = MONO;
  ctx.textBaseline = 'middle';

  // Tageslinien.
  ctx.strokeStyle = GRID;
  const days = t1 / DAY;
  const step = days <= 10 ? 1 : days <= 30 ? 5 : days <= 100 ? 10 : 25;
  for (let d = step; d < days; d += step) {
    const x = Math.round(X(d * DAY)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  rows.forEach((row, i) => {
    const c = row.clade;
    const y = Y(i);
    const x0 = X(c.born);
    const x1 = X(c.died ?? world.t);
    const alive = c.died === null;
    if (c._treeParent && index.has(c._treeParent)) {
      const py = Y(index.get(c._treeParent));
      ctx.strokeStyle = 'rgba(143, 176, 176, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, py);
      ctx.lineTo(x0 + 0.5, y);
      ctx.stroke();
    }
    const strong = highlight === c.id;
    ctx.globalAlpha = alive ? 1 : 0.45;
    ctx.fillStyle = cladeColor(c, alive ? 70 : 25, alive ? 60 : 55);
    const thick = strong ? 7 : alive ? 5 : 3;
    ctx.fillRect(x0, y - thick / 2, Math.max(2, x1 - x0), thick);
    ctx.globalAlpha = 1;
    if (strong) {
      ctx.strokeStyle = '#f0b45e';
      ctx.strokeRect(x0 - 1.5, y - thick / 2 - 1.5, Math.max(2, x1 - x0) + 3, thick + 3);
    }
    if (alive || strong) {
      ctx.font = 'italic 12.5px "Newsreader", Georgia, serif';
      ctx.fillStyle = strong ? '#f0b45e' : alive ? INK : MUTED;
      ctx.textAlign = 'left';
      let label = c.name;
      while (label.length > 4 && ctx.measureText(label).width > labelW) label = label.slice(0, -2) + '…';
      ctx.fillText(label, w - labelW, y);
      if (!alive) {
        ctx.strokeStyle = 'rgba(143, 176, 176, 0.35)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x1 + 3, y);
        ctx.lineTo(w - labelW - 4, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = MONO;
    }
  });
  return rows;
}

export function drawBrain(canvas, c) {
  const { ctx, w, h } = prepCanvas(canvas);
  const g = c.g;
  const left = 118;
  const right = w - 96;
  const mid = (left + right) / 2;
  const top = 10;
  const yIn = (i) => top + (i * (h - top * 2)) / (N_IN - 1);
  const yHid = (i) => top + 14 + (i * (h - top * 2 - 28)) / (N_HID - 1);
  const yOut = (i) => top + 26 + (i * (h - top * 2 - 52)) / (N_OUT - 1);

  const edge = (x0, y0, x1, y1, weight, act) => {
    const a = Math.min(1, Math.abs(weight) / 2.5) * (0.15 + 0.85 * Math.min(1, Math.abs(act)));
    if (a < 0.04) return;
    ctx.strokeStyle = weight > 0 ? `rgba(240, 180, 94, ${a})` : `rgba(110, 170, 255, ${a})`;
    ctx.lineWidth = 0.6 + Math.min(2.2, Math.abs(weight) * 0.6);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
    ctx.stroke();
  };

  for (let i = 0; i < N_IN; i++) for (let k = 0; k < N_HID; k++) edge(left, yIn(i), mid, yHid(k), weightIn(g.w, i, k), c.input[i]);
  for (let k = 0; k < N_HID; k++) for (let o = 0; o < N_OUT; o++) edge(mid, yHid(k), right, yOut(o), weightOut(g.w, k, o), c.hidden[k]);

  const node = (x, y, v) => {
    const r = 4.5;
    ctx.fillStyle = '#0b2230';
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    const m = Math.min(1, Math.abs(v));
    ctx.fillStyle = v >= 0 ? `rgba(240, 180, 94, ${0.25 + 0.75 * m})` : `rgba(110, 170, 255, ${0.25 + 0.75 * m})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.font = '10.5px "Figtree", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  for (let i = 0; i < N_IN; i++) {
    node(left, yIn(i), c.input[i]);
    ctx.fillStyle = MUTED;
    ctx.fillText(INPUT_LABELS[i], left - 9, yIn(i));
  }
  for (let k = 0; k < N_HID; k++) node(mid, yHid(k), c.hidden[k]);
  ctx.textAlign = 'left';
  const shown = [c.output[0], c.thrust * 2 - 1, c.output[2], c.output[3], c.output[4]];
  for (let o = 0; o < N_OUT; o++) {
    node(right, yOut(o), shown[o]);
    ctx.fillStyle = o === 2 && c.attacking ? '#ff7a6b' : INK;
    ctx.fillText(OUTPUT_LABELS[o], right + 9, yOut(o));
  }
}
