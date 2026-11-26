// Versuchsläufer: führt einen Versuch aus experiments/*.json mit vielen Saaten parallel aus
// und schreibt Messreihen, Statistik und Diagramme nach results/<name>/.
//
//   node tools/experiment.mjs experiments/praedation.json
//   node tools/experiment.mjs experiments/praedation.json --replicates 4 --days 20   (schneller Probelauf)
//
// Versuchsdatei (alle Felder außer name, factor, responses haben Standardwerte):
// {
//   "name": "praedation",
//   "title": "Erhöhen Räuber die Vielfalt?",
//   "hypothesis": "…",
//   "days": 40, "measureFrom": 25, "replicates": 12, "seedBase": 1000,
//   "base": { "immigrationUntil": 10 },
//   "factor": { "param": "predation", "levels": [false, true], "labels": ["ohne", "mit"] },
//   "primary": "geneticDiv",
//   "responses": ["geneticDiv", "richness", "pop"],
//   "contrast": "hump"            (optional, nur bei ≥ 3 Stufen: vorab festgelegter Höckertest)
// }

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

if (!isMainThread) {
  // ---------- Arbeiter: genau ein Lauf ----------
  const { World, DAY } = await import('../src/world.js');
  const { seed, params, days, sampleDays } = workerData;
  const w = new World(seed, { params, sampleEvery: Math.round(sampleDays * DAY), historyLimit: 1e9 });
  const end = days * DAY;
  while (w.t < end) w.step();
  parentPort.postMessage({ series: w.history.map((h) => h.m) });
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Aufruf: node tools/experiment.mjs experiments/<versuch>.json [--replicates N] [--days D] [--jobs J] [--out DIR]');
    process.exit(2);
  }
  const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const exp = JSON.parse(readFileSync(file, 'utf8'));
  const { PARAMS } = await import('../src/world.js');
  const { METRICS, toCsv } = await import('../src/metrics.js');
  const S = await import('./stats.mjs');

  const cfg = {
    title: exp.name,
    hypothesis: '',
    days: 40,
    measureFrom: 25,
    replicates: 12,
    seedBase: 1000,
    sampleDays: 0.5,
    base: {},
    primary: exp.responses?.[0],
    ...exp,
  };
  cfg.replicates = Number(opt('replicates', cfg.replicates));
  cfg.days = Number(opt('days', cfg.days));
  if (cfg.measureFrom >= cfg.days) cfg.measureFrom = Math.floor(cfg.days / 2);
  const jobs = Number(opt('jobs', Math.max(1, cpus().length)));
  const outDir = resolve(opt('out', join(root, 'results', cfg.name)));
  const { param, levels } = cfg.factor;
  const labels = cfg.factor.labels || levels.map(String);
  if (!(param in PARAMS)) throw new Error(`Unbekannter Faktor-Parameter: ${param}`);
  for (const r of cfg.responses) if (!METRICS.some((m) => m[0] === r)) throw new Error(`Unbekannte Messgröße: ${r}`);

  // Aufgaben: jede Saat auf jeder Stufe (gepaarter Plan).
  const tasks = [];
  for (let rep = 0; rep < cfg.replicates; rep++) {
    levels.forEach((level, li) => {
      tasks.push({ rep, li, seed: cfg.seedBase + rep, params: { ...cfg.base, [param]: level }, days: cfg.days, sampleDays: cfg.sampleDays });
    });
  }

  console.log(`${cfg.title}: ${levels.length} Stufen × ${cfg.replicates} Saaten = ${tasks.length} Läufe à ${cfg.days} Tage, ${jobs} parallel`);
  const t0 = Date.now();
  const results = new Array(tasks.length);
  let next = 0;
  let done = 0;
  await new Promise((resolveAll, reject) => {
    const launch = () => {
      if (next >= tasks.length) return;
      const i = next++;
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: tasks[i] });
      wk.once('message', (msg) => {
        results[i] = msg.series;
        done++;
        process.stdout.write(`\r  ${done}/${tasks.length} Läufe fertig (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        if (done === tasks.length) resolveAll();
        else launch();
      });
      wk.once('error', reject);
    };
    for (let j = 0; j < Math.min(jobs, tasks.length); j++) launch();
  });
  console.log('');

  // ---------- Auswertung ----------
  const windowMean = (series, key) => S.mean(series.filter((m) => m.day >= cfg.measureFrom - 1e-9).map((m) => m[key]));
  const runs = tasks.map((t, i) => {
    const series = results[i];
    const last = series[series.length - 1];
    const row = { level: labels[t.li], levelIndex: t.li, seed: t.seed, extinct: last.pop === 0 ? 1 : 0 };
    for (const r of cfg.responses) row[r] = windowMean(series, r);
    row.immigrants = last.immigrants;
    return row;
  });
  // blocks[rep][level] = Antwort
  const blocks = (r) => Array.from({ length: cfg.replicates }, (_, rep) => levels.map((_, li) => runs.find((x) => x.seed === cfg.seedBase + rep && x.levelIndex === li)[r]));

  const analyses = cfg.responses.map((r) => {
    const b = blocks(r);
    const perLevel = levels.map((_, li) => {
      const xs = b.map((row) => row[li]);
      return { label: labels[li], mean: S.mean(xs), sd: S.sd(xs), ci: S.bootstrapCI(xs, { seed: 100 + li }), xs };
    });
    const a = { response: r, perLevel };
    if (levels.length === 2) {
      const diffs = b.map((row) => row[1] - row[0]);
      a.kind = 'paired';
      a.diff = S.mean(diffs);
      a.diffCI = S.bootstrapCI(diffs, { seed: 21 });
      a.p = S.signFlipTest(diffs);
      a.dz = S.cohensDz(diffs);
      a.wins = diffs.filter((d) => d > 0).length;
    } else {
      a.kind = 'trend';
      const tt = S.trendTest(b);
      a.rho = tt.rho;
      a.p = tt.p;
      if (cfg.contrast === 'hump') a.hump = S.humpTest(b);
    }
    return a;
  });

  // Holm-Korrektur über alle Antwortgrößen (die primäre ist vorab benannt, die übrigen explorativ).
  const ps = analyses.map((a, i) => ({ i, p: a.hump ? Math.min(a.p, a.hump.p) : a.p })).sort((x, y) => x.p - y.p);
  ps.forEach((e, rank) => {
    const adj = Math.min(1, e.p * (ps.length - rank));
    analyses[e.i].pHolm = Math.max(adj, rank ? analyses[ps[rank - 1].i].pHolm : 0);
  });

  // ---------- Ausgabe ----------
  mkdirSync(outDir, { recursive: true });
  const runKeys = ['level', 'seed', 'extinct', 'immigrants', ...cfg.responses];
  writeFileSync(join(outDir, 'runs.csv'), [runKeys.join(','), ...runs.map((r) => runKeys.map((k) => fmt(r[k])).join(','))].join('\n') + '\n');
  let ts = '';
  tasks.forEach((t, i) => {
    const csv = toCsv(results[i], { level: labels[t.li], seed: t.seed });
    ts += i === 0 ? csv : csv.slice(csv.indexOf('\n') + 1);
  });
  writeFileSync(join(outDir, 'timeseries.csv'), ts);

  let commit = 'unbekannt';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
    if (execSync('git status --porcelain src', { cwd: root }).toString().trim()) commit += ' (mit lokalen Änderungen in src/)';
  } catch {
    /* kein Git */
  }
  const manifest = {
    experiment: cfg,
    file: basename(file),
    commit,
    node: process.version,
    date: new Date().toISOString(),
    seconds: Math.round((Date.now() - t0) / 1000),
    paramsPerLevel: levels.map((l) => ({ ...PARAMS, ...cfg.base, [param]: l })),
    seeds: Array.from({ length: cfg.replicates }, (_, k) => cfg.seedBase + k),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  for (const a of analyses) writeFileSync(join(outDir, `${a.response}.svg`), dotPlot(a, METRICS, cfg));
  writeFileSync(join(outDir, `verlauf-${cfg.primary}.svg`), timePlot(tasks, results, labels, cfg.primary, METRICS, cfg));
  writeFileSync(join(outDir, 'bericht.md'), report(cfg, analyses, runs, manifest, METRICS));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ name: cfg.name, title: cfg.title, analyses: analyses.map(({ perLevel, ...rest }) => ({ ...rest, perLevel: perLevel.map(({ xs, ...p }) => p) })) }, null, 2) + '\n');

  console.log(`Ergebnisse in ${outDir}`);
  for (const a of analyses) console.log('  ' + oneLine(a, METRICS));
}

// ---------- Helfer ----------

function fmt(v, digits = 4) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return 'NaN';
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(digits);
}

function pfmt(p) {
  if (!Number.isFinite(p)) return '–';
  return p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ',');
}

function de(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–';
}

function label(r, METRICS) {
  return METRICS.find((m) => m[0] === r)?.[1] ?? r;
}

function oneLine(a, METRICS) {
  const lv = a.perLevel.map((p) => `${p.label} ${de(p.mean)}`).join(' | ');
  const test = a.kind === 'paired' ? `Δ ${de(a.diff)}, p ${pfmt(a.p)}` : `ρ ${de(a.rho)}, p ${pfmt(a.p)}${a.hump ? `, Höcker p ${pfmt(a.hump.p)}` : ''}`;
  return `${label(a.response, METRICS)}: ${lv}  →  ${test}  (Holm ${pfmt(a.pHolm)})`;
}

function report(cfg, analyses, runs, manifest, METRICS) {
  const L = [];
  L.push(`# ${cfg.title}`, '');
  if (cfg.hypothesis) L.push(`**Hypothese.** ${cfg.hypothesis}`, '');
  if (cfg.background) L.push(cfg.background, '');
  L.push('## Versuchsaufbau', '');
  L.push(`| | |`, `| --- | --- |`);
  L.push(`| Faktor | \`${cfg.factor.param}\` mit den Stufen ${cfg.factor.levels.map((l, i) => `${(cfg.factor.labels || [])[i] ?? l} (\`${JSON.stringify(l)}\`)`).join(', ')} |`);
  L.push(`| Wiederholungen | ${cfg.replicates} Saaten (${manifest.seeds[0]} bis ${manifest.seeds.at(-1)}), jede auf jeder Stufe (gepaart) |`);
  L.push(`| Dauer | ${cfg.days} Tage, gemessen wird der Mittelwert über Tag ${cfg.measureFrom} bis ${cfg.days} |`);
  L.push(`| Weitere Einstellungen | ${Object.keys(cfg.base).length ? Object.entries(cfg.base).map(([k, v]) => `\`${k}\` = ${JSON.stringify(v)}`).join(', ') : 'Standardwerte'} |`);
  L.push(`| Primäre Messgröße | ${label(cfg.primary, METRICS)} (vorab festgelegt), alle übrigen explorativ |`);
  L.push(`| Code-Stand | \`${manifest.commit}\`, Node ${manifest.node}, Rechenzeit ${manifest.seconds} s |`);
  const extinct = runs.filter((r) => r.extinct).length;
  if (extinct) L.push(`| Ausgestorben | ${extinct} von ${runs.length} Läufen endeten ohne Tiere (gehen mit 0 in die Mittelwerte ein) |`);
  L.push('');
  L.push('## Ergebnisse', '');
  L.push(
    analyses[0].kind === 'paired'
      ? 'Mittelwerte mit 95-%-Bootstrap-Intervall. Δ ist die mittlere gepaarte Differenz (zweite minus erste Stufe), getestet mit einem exakten Vorzeichen-Permutationstest; d_z ist die Effektstärke der Differenzen. Die p-Werte sind zusätzlich nach Holm über alle Messgrößen korrigiert.'
      : 'Mittelwerte mit 95-%-Bootstrap-Intervall. ρ ist Spearmans Rangkorrelation zwischen Stufe und Messwert; ihr p-Wert stammt aus einer Permutation der Stufen innerhalb jeder Saat. Der Höckertest vergleicht je Saat die inneren Stufen mit den beiden äußeren. Die p-Werte sind zusätzlich nach Holm über alle Messgrößen korrigiert.',
    '',
  );
  const head = ['Messgröße', ...analyses[0].perLevel.map((p) => p.label), analyses[0].kind === 'paired' ? 'Δ [95 %]' : 'ρ', 'p', 'p (Holm)'];
  if (analyses[0].kind === 'paired') head.splice(head.length - 2, 0, 'd_z');
  if (cfg.contrast === 'hump') head.splice(head.length - 2, 0, 'Höcker [95 %]', 'p Höcker');
  L.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  for (const a of analyses) {
    const cells = [`${a.response === cfg.primary ? '**' : ''}${label(a.response, METRICS)}${a.response === cfg.primary ? '**' : ''}`];
    for (const p of a.perLevel) cells.push(`${de(p.mean)} [${de(p.ci[0])}; ${de(p.ci[1])}]`);
    if (a.kind === 'paired') cells.push(`${de(a.diff)} [${de(a.diffCI[0])}; ${de(a.diffCI[1])}]`, de(a.dz));
    else cells.push(de(a.rho));
    if (a.hump) cells.push(`${de(a.hump.contrast)} [${de(a.hump.ci[0])}; ${de(a.hump.ci[1])}]`, pfmt(a.hump.p));
    cells.push(pfmt(a.p), pfmt(a.pHolm));
    L.push(`| ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push(`![${label(cfg.primary, METRICS)} je Stufe](${cfg.primary}.svg)`, '');
  L.push(`![Verlauf: ${label(cfg.primary, METRICS)}](verlauf-${cfg.primary}.svg)`, '');
  L.push('## Dateien', '');
  L.push('- `runs.csv`: ein Lauf pro Zeile, mit den Fenster-Mittelwerten aller Messgrößen');
  L.push('- `timeseries.csv`: alle Messungen aller Läufe (alle halbe Tage)');
  L.push('- `manifest.json`: vollständige Parameter je Stufe, Saaten, Code-Stand');
  L.push('- `<messgröße>.svg`: Einzelwerte je Saat, Mittelwert und 95-%-Intervall', '');
  L.push(`Neu erzeugen: \`node tools/experiment.mjs experiments/${manifest.file}\``, '');
  return L.join('\n');
}

// ---------- Diagramme (SVG, hell, für GitHub und Berichte) ----------

const PAL = ['#3b6fb6', '#d9822b', '#2f9e6e', '#b8466b', '#7a5bc7', '#8c8c3a'];

function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) hi = lo + 1;
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toPrecision(10));
  return ticks;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function dotPlot(a, METRICS, cfg) {
  const W = 560;
  const H = 300;
  const pad = { l: 64, r: 20, t: 40, b: 46 };
  const all = a.perLevel.flatMap((p) => [...p.xs, p.ci[0], p.ci[1]]).filter(Number.isFinite);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const m = (hi - lo) * 0.08 || 1;
  lo -= m;
  hi += m;
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks.at(-1));
  const k = a.perLevel.length;
  const X = (i) => pad.l + ((i + 0.5) / k) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif" font-size="12">`);
  o.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  o.push(`<text x="${pad.l}" y="22" font-size="14" font-weight="600" fill="#1d2330">${esc(label(a.response, METRICS))}</text>`);
  const test = a.kind === 'paired' ? `Δ = ${de(a.diff)}, p = ${pfmt(a.p)}` : `ρ = ${de(a.rho)}, p = ${pfmt(a.p)}${a.hump ? ` · Höcker p = ${pfmt(a.hump.p)}` : ''}`;
  o.push(`<text x="${W - pad.r}" y="22" text-anchor="end" fill="#555c6b">${esc(test)}</text>`);
  for (const t of ticks) {
    o.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="#e3e6ec"/>`);
    o.push(`<text x="${pad.l - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" fill="#555c6b">${de(t, t % 1 ? 2 : 0)}</text>`);
  }
  // Linien je Saat verbinden die Stufen (gepaarter Plan).
  const reps = a.perLevel[0].xs.length;
  for (let r = 0; r < reps; r++) {
    const pts = a.perLevel.map((p, i) => `${X(i).toFixed(1)},${Y(p.xs[r]).toFixed(1)}`).join(' ');
    o.push(`<polyline points="${pts}" fill="none" stroke="#9aa3b5" stroke-opacity="0.35"/>`);
  }
  a.perLevel.forEach((p, i) => {
    const c = PAL[i % PAL.length];
    p.xs.forEach((v, r) => o.push(`<circle cx="${(X(i) + ((r % 5) - 2) * 3).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="${c}" fill-opacity="0.45"/>`));
    o.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${Y(p.ci[0]).toFixed(1)}" y2="${Y(p.ci[1]).toFixed(1)}" stroke="#1d2330" stroke-width="2"/>`);
    o.push(`<rect x="${X(i) - 14}" y="${(Y(p.mean) - 2).toFixed(1)}" width="28" height="4" fill="#1d2330"/>`);
    o.push(`<text x="${X(i)}" y="${H - pad.b + 20}" text-anchor="middle" fill="#1d2330">${esc(p.label)}</text>`);
  });
  o.push(`<text x="${pad.l}" y="${H - 8}" fill="#7b8293" font-size="11">Punkte: einzelne Saaten (Mittel Tag ${cfg.measureFrom}–${cfg.days}); Balken: Mittelwert mit 95-%-Intervall</text>`);
  o.push('</svg>');
  return o.join('\n') + '\n';
}

function timePlot(tasks, results, labels, key, METRICS, cfg) {
  const W = 560;
  const H = 280;
  const pad = { l: 64, r: 20, t: 58, b: 40 };
  const byLevel = labels.map(() => new Map());
  tasks.forEach((t, i) => {
    for (const m of results[i]) {
      const d = Math.round(m.day * 2) / 2;
      const map = byLevel[t.li];
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(m[key]);
    }
  });
  const lines = byLevel.map((map) => [...map.entries()].sort((a, b) => a[0] - b[0]).map(([d, xs]) => [d, xs.reduce((a, b) => a + b, 0) / xs.length]));
  const vals = lines.flat().map((p) => p[1]);
  const ticks = niceTicks(0, Math.max(...vals) * 1.05);
  const hi = ticks.at(-1);
  const X = (d) => pad.l + (d / cfg.days) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif" font-size="12">`);
  o.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  o.push(`<text x="${pad.l}" y="22" font-size="14" font-weight="600" fill="#1d2330">${esc(label(key, METRICS))} im Verlauf (Mittel über Saaten)</text>`);
  for (const t of ticks) {
    o.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="#e3e6ec"/>`);
    o.push(`<text x="${pad.l - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" fill="#555c6b">${de(t, t % 1 ? 2 : 0)}</text>`);
  }
  for (const d of niceTicks(0, cfg.days, 5)) o.push(`<text x="${X(d).toFixed(1)}" y="${H - pad.b + 18}" text-anchor="middle" fill="#555c6b">Tag ${d}</text>`);
  o.push(`<rect x="${X(cfg.measureFrom).toFixed(1)}" y="${pad.t}" width="${(X(cfg.days) - X(cfg.measureFrom)).toFixed(1)}" height="${H - pad.t - pad.b}" fill="#3b6fb6" fill-opacity="0.06"/>`);
  lines.forEach((pts, i) => {
    const c = PAL[i % PAL.length];
    o.push(`<polyline points="${pts.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2"/>`);
    o.push(`<rect x="${pad.l + i * 96}" y="36" width="12" height="3" fill="${c}"/><text x="${pad.l + 16 + i * 96}" y="41" fill="#1d2330">${esc(labels[i])}</text>`);
  });
  o.push(`<text x="${W - pad.r}" y="${H - 8}" text-anchor="end" fill="#7b8293" font-size="11">schattiert: Auswertungsfenster</text>`);
  o.push('</svg>');
  return o.join('\n') + '\n';
}

// Erst ganz am Ende starten, wenn alle Konstanten dieser Datei bereitstehen.
if (isMainThread) await main();
