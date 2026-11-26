// Erzeugt aus results/*/ eine Berichtsseite (dist/versuche.html) mit allen Versuchen.
//   node tools/report-page.mjs
// Zahlen und Diagramme kommen direkt aus runs.csv und summary.json; Deutungen stehen unten im Text.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mean, bootstrapCI, signFlipTest } from './stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = (name, file) => join(root, 'results', name, file);

// Liest eine CSV-Zeile mit Feldern in Anführungszeichen (RFC 4180).
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function runs(name) {
  const [head, ...rows] = readFileSync(R(name, 'runs.csv'), 'utf8').trim().split('\n');
  const keys = splitCsv(head);
  return rows.map((r) => {
    const cells = splitCsv(r);
    if (cells.length !== keys.length) throw new Error(`results/${name}/runs.csv: Zeile hat ${cells.length} statt ${keys.length} Felder`);
    return Object.fromEntries(cells.map((v, i) => [keys[i], i < 1 ? v : Number(v)]));
  });
}
const summary = (name) => JSON.parse(readFileSync(R(name, 'summary.json'), 'utf8'));
const manifest = (name) => JSON.parse(readFileSync(R(name, 'manifest.json'), 'utf8'));

const de = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',').replace('-', '−') : '–');
const pde = (p) => (p < 0.001 ? '< 0,001' : de(p, 3));
const pEq = (p) => (p < 0.001 ? 'p < 0,001' : `p = ${de(p, 3)}`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Punktdiagramm: Einzelsaaten (gepaart verbunden), Mittelwert und 95-%-Intervall je Stufe.
function dotPlot(name, key, { height = 230 } = {}) {
  const rs = runs(name);
  const levels = [...new Set(rs.map((r) => r.level))];
  const seeds = [...new Set(rs.map((r) => r.seed))];
  const val = (lvl, seed) => rs.find((r) => r.level === lvl && r.seed === seed)?.[key];
  const per = levels.map((l, i) => {
    const xs = seeds.map((s) => val(l, s)).filter(Number.isFinite);
    return { l, xs, m: mean(xs), ci: bootstrapCI(xs, { seed: 100 + i }) };
  });
  const all = per.flatMap((p) => [...p.xs, ...p.ci]);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const padv = (hi - lo) * 0.08 || 1;
  lo -= padv;
  hi += padv;
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((s) => (hi - lo) / s <= 5);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(+v.toFixed(6));
  const W = 640;
  const H = height;
  const pad = { l: 46, r: 14, t: 12, b: 34 };
  const X = (i) => pad.l + ((i + 0.5) / levels.length) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const o = [`<div class="plotwrap"><svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(key)} je Stufe">`];
  for (const t of ticks) {
    o.push(`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>`);
    o.push(`<text class="tick" x="${pad.l - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${de(t, step < 1 ? (step < 0.25 ? 1 : 2) : 0)}</text>`);
  }
  for (const s of seeds) {
    const pts = levels.map((l, i) => [X(i), Y(val(l, s))]).filter((p) => Number.isFinite(p[1]));
    o.push(`<polyline class="pair" points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`);
  }
  per.forEach((p, i) => {
    p.xs.forEach((v, k) => o.push(`<circle class="dot s${i % 5}" cx="${(X(i) + ((k % 7) - 3) * 2.6).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3"/>`));
    o.push(`<line class="ci" x1="${X(i)}" x2="${X(i)}" y1="${Y(p.ci[0]).toFixed(1)}" y2="${Y(p.ci[1]).toFixed(1)}"/>`);
    o.push(`<rect class="mean" x="${X(i) - 15}" y="${(Y(p.m) - 2).toFixed(1)}" width="30" height="4" rx="1"/>`);
    o.push(`<text class="lvl" x="${X(i)}" y="${H - 10}" text-anchor="middle">${esc(p.l)}</text>`);
  });
  o.push('</svg></div>');
  return o.join('');
}

function row(name, key) {
  return summary(name).analyses.find((a) => a.response === key);
}

// Gepoolte Auswertung der beiden Räuber-Versuche.
function pooled(key) {
  const d = [];
  const base = [];
  for (const name of ['praedation', 'praedation-replikation']) {
    const rs = runs(name);
    for (const s of new Set(rs.map((r) => r.seed))) {
      const a = rs.find((r) => r.seed === s && r.level === 'mit Räubern')[key];
      const b = rs.find((r) => r.seed === s && r.level === 'ohne Räuber')[key];
      d.push(a - b);
      base.push(b);
    }
  }
  return { n: d.length, diff: mean(d), rel: mean(d) / mean(base), ci: bootstrapCI(d, { seed: 21 }), p: signFlipTest(d), up: d.filter((x) => x > 0).length };
}

for (const n of ['artschwelle', 'praedation', 'praedation-replikation', 'stoerung', 'produktivitaet']) {
  if (!existsSync(R(n, 'runs.csv'))) throw new Error(`Ergebnisse fehlen: results/${n}`);
}

const rep = row('praedation-replikation', 'evolvedDiv');
const first = row('praedation', 'evolvedDiv');
const pool = pooled('evolvedDiv');
const poolSize = pooled('sizeMean');
const poolAlgae = pooled('algae');
const st = row('stoerung', 'evolvedDiv');
const stSize = row('stoerung', 'sizeMean');
const stEff = row('stoerung', 'effSpecies');
const pr = row('produktivitaet', 'evolvedDiv');
const prHunt = row('produktivitaet', 'hunterShare');
const art = summary('artschwelle').analyses;
const totalRuns = ['artschwelle', 'praedation', 'praedation-replikation', 'stoerung', 'produktivitaet'].reduce((s, n) => s + runs(n).length, 0);
const commit = manifest('praedation-replikation').commit;

const levelsRow = (a, d = 2) => a.perLevel.map((p) => `<td>${de(p.mean, d)}</td>`).join('');

const html = `<title>Gezeitenbecken-Versuche</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&display=swap">
<style>
/* Layout: ein Laborbericht in einer Spalte; jedes Experiment ein Abschnitt mit Urteil, Diagramm und Zahlen. */
:root {
  --paper: #f5f8f7;
  --sheet: #ffffff;
  --ink: #13232a;
  --muted: #5a6e73;
  --rule: #d9e3e1;
  --tide: #1f6f8b;
  --amber: #b9741a;
  --yes: #2d7a4c;
  --no: #8a5a3c;
  --ctl: #1f6f8b;
  --s0: #1f6f8b; --s1: #b9741a; --s2: #2d8a6e; --s3: #a3476b; --s4: #6a55b5;
  --display: "Newsreader", Georgia, serif;
  --body: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #071219; --sheet: #0c1d26; --ink: #dbe8e4; --muted: #8fabad; --rule: #1d3a47;
    --tide: #6cc3e0; --amber: #f0b45e; --yes: #6fcf97; --no: #e0a37a; --ctl: #6cc3e0;
    --s0: #6cc3e0; --s1: #f0b45e; --s2: #5fcf98; --s3: #e58bb0; --s4: #a99bf0;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper: #071219; --sheet: #0c1d26; --ink: #dbe8e4; --muted: #8fabad; --rule: #1d3a47;
  --tide: #6cc3e0; --amber: #f0b45e; --yes: #6fcf97; --no: #e0a37a; --ctl: #6cc3e0;
  --s0: #6cc3e0; --s1: #f0b45e; --s2: #5fcf98; --s3: #e58bb0; --s4: #a99bf0;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 var(--body); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 760px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 40px 72px; display: flex; flex-direction: column; gap: 40px; }
header { display: flex; flex-direction: column; gap: 12px; }
.eyebrow { font: 500 12px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 0; font: italic 500 clamp(34px, 6vw, 48px)/1.05 var(--display); letter-spacing: -0.01em; text-wrap: balance; }
h2 { margin: 0; font: 500 26px/1.2 var(--display); text-wrap: balance; }
h3 { margin: 0; font: 600 13px var(--body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
p { margin: 0; max-width: 65ch; }
.lede { font-size: 18px; color: var(--ink); }
.muted { color: var(--muted); }
em.sp { font-family: var(--display); }
section { display: flex; flex-direction: column; gap: 16px; }
section.exp { padding-top: 28px; border-top: 1px solid var(--rule); }
.verdict { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; font: 600 13px var(--body); padding: 4px 12px; border-radius: 999px; border: 1px solid currentColor; }
.verdict::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.yes { color: var(--yes); } .no { color: var(--no); } .ctl { color: var(--ctl); }
.summary { background: var(--sheet); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
.summary table { width: 100%; }
.tbl { overflow-x: auto; }
table { border-collapse: collapse; font-size: 14px; min-width: 100%; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font: 600 12px var(--body); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.data td:not(:first-child), .data th:not(:first-child) { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.data tr.primary td { font-weight: 600; }
figure { margin: 0; display: flex; flex-direction: column; gap: 6px; }
figcaption { font-size: 13px; color: var(--muted); }
.plotwrap { overflow-x: auto; border-radius: 12px; }
.plot { width: 100%; min-width: 540px; height: auto; display: block; background: var(--sheet); border: 1px solid var(--rule); border-radius: 12px; }
.plot .grid { stroke: var(--rule); stroke-width: 1; }
.plot .tick, .plot .lvl { fill: var(--muted); font: 12px var(--mono); }
.plot .lvl { fill: var(--ink); font-family: var(--body); font-size: 13px; }
.plot .pair { fill: none; stroke: var(--muted); stroke-opacity: 0.25; stroke-width: 1; }
.plot .dot { fill-opacity: 0.55; }
.plot .s0 { fill: var(--s0); } .plot .s1 { fill: var(--s1); } .plot .s2 { fill: var(--s2); } .plot .s3 { fill: var(--s3); } .plot .s4 { fill: var(--s4); }
.plot .ci { stroke: var(--ink); stroke-width: 2; }
.plot .mean { fill: var(--ink); }
.keyfig { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.keyfig div { background: var(--sheet); border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.keyfig b { font: 500 22px var(--mono); font-variant-numeric: tabular-nums; }
.keyfig span { font-size: 13px; color: var(--muted); }
ul { margin: 0; padding-left: 20px; max-width: 65ch; display: flex; flex-direction: column; gap: 6px; }
.note { font-size: 14px; color: var(--muted); }
code { font: 13px var(--mono); }
footer { font-size: 13px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--rule); padding-top: 24px; }
@media (max-width: 560px) { .keyfig { grid-template-columns: minmax(0, 1fr); } h2 { font-size: 23px; } }
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Gezeitenbecken · ${totalRuns} Läufe à 60 Tage</div>
  <h1>Was im Becken geschieht, wenn man es befragt</h1>
  <p class="lede">Vier Versuche und eine Replikation mit der Künstliches-Leben-Simulation Gezeitenbecken. Gemessen wird vor allem die <strong>evolvierte Vielfalt</strong>: der mittlere Erbgut-Abstand zwischen Tieren, die vom selben Gründer abstammen, also die Vielfalt, die im Becken durch Mutation entstanden ist.</p>
  <p class="note">Die Ergebnisse gelten für dieses Modell: eine kleine Welt, ungeschlechtliche Vermehrung, eine einzige Nahrungsquelle, 30 bis 45 Generationen. Für echte Ökosysteme sind sie Hypothesen, keine Belege.</p>
</header>

<section>
  <h3>Auf einen Blick</h3>
  <div class="summary tbl"><table>
    <thead><tr><th>Versuch</th><th>Frage</th><th>Ergebnis</th></tr></thead>
    <tbody>
      <tr><td>Artschwelle</td><td>Hängt die Artenzahl von der Definition ab?</td><td><span class="ctl">Kontrolle bestanden</span>: Artenzahl ×${de(art[0].perLevel[0].mean / art[0].perLevel.at(-1).mean, 1)}, Dynamik identisch</td></tr>
      <tr><td>Räuber</td><td>Erhöhen Räuber die Vielfalt?</td><td><span class="yes">Ja, repliziert</span>: +${de(pool.diff)} (${pEq(pool.p)}, ${pool.n} Paare)</td></tr>
      <tr><td>Störung</td><td>Vielfalt am größten bei mittlerer Störung?</td><td><span class="no">Nein</span>: kein Höcker (p = ${pde(st.hump.p)})</td></tr>
      <tr><td>Produktivität</td><td>Vielfalt am größten bei mittlerer Produktivität?</td><td><span class="no">Nein</span>: stattdessen stetiger Anstieg (ρ = ${de(pr.rho)})</td></tr>
    </tbody>
  </table></div>
</section>

<section class="exp">
  <span class="verdict yes">Hypothese gestützt, in Replikation bestätigt</span>
  <h2>Räuber erhöhen die Vielfalt und lösen eine trophische Kaskade aus</h2>
  <p>Ein Schalter macht den Angriffsausgang der Gehirne wirkungslos. Alles andere bleibt gleich. Erst 12 Saaten (+${de(first.diff)}, p = ${pde(first.p)}), dann eine vorab festgelegte Replikation mit 24 neuen Saaten (+${de(rep.diff)}, p = ${pde(rep.p)}).</p>
  <div class="keyfig">
    <div><b>+${de(pool.diff)}</b><span>evolvierte Vielfalt mit Räubern, ${pool.up} von ${pool.n} Saaten höher</span></div>
    <div><b>+${de(poolSize.diff)}</b><span>mittlere Körpergröße: Größe schützt vor Angriffen</span></div>
    <div><b>+${de(poolAlgae.rel * 100, 0)} %</b><span>mehr Algen bleiben übrig, weil Räuber die Grasenden kurz halten</span></div>
  </div>
  <figure>
    ${dotPlot('praedation-replikation', 'evolvedDiv')}
    <figcaption>Replikation, evolvierte Vielfalt im Mittel der Tage 40 bis 60. Punkte: einzelne Saaten, Linien verbinden dieselbe Saat; Balken: Mittelwert mit 95-%-Intervall.</figcaption>
  </figure>
  <p>Die Algen-Wirkung ist das Muster einer <strong>trophischen Kaskade</strong>: Die oberste Ebene der Nahrungskette entlastet die unterste. Keine Regel im Modell schreibt das vor; es entsteht. Welcher Mechanismus die höhere Vielfalt erzeugt, bleibt offen.</p>
  <p class="note">Gepoolt über beide Versuche, Vorzeichen-Permutationstest: Vielfalt ${de(pool.diff)} [${de(pool.ci[0])}; ${de(pool.ci[1])}], ${pEq(pool.p)}; Größe ${de(poolSize.diff)} [${de(poolSize.ci[0])}; ${de(poolSize.ci[1])}], ${pEq(poolSize.p)}; Algen ${pEq(poolAlgae.p)}. Holm-korrigiert über alle acht Messgrößen ist der Vielfaltseffekt der Replikation allein nicht signifikant (p = ${pde(rep.pHolm)}).</p>
</section>

<section class="exp">
  <span class="verdict no">Hypothese nicht gestützt</span>
  <h2>Störung: kein Höcker, aber kleinere Tiere</h2>
  <p>Ein Sturm tötet jedes Tier mit 50 % Wahrscheinlichkeit, unabhängig von seinem Zustand. Die <em>Intermediate Disturbance Hypothesis</em> sagt bei mittlerer Häufigkeit die größte Vielfalt voraus. Der vorab festgelegte Höckertest findet das nicht (p = ${pde(st.hump.p)}).</p>
  <figure>
    ${dotPlot('stoerung', 'sizeMean')}
    <figcaption>Mittlere Körpergröße je Störungshäufigkeit (ρ = ${de(stSize.rho)}, p < 0,001). Wo der Tod zufällig und häufig kommt, gewinnt, wer sich früh teilt.</figcaption>
  </figure>
  <div class="tbl"><table class="data">
    <thead><tr><th>Messgröße</th>${st.perLevel.map((p) => `<th>${esc(p.label)}</th>`).join('')}</tr></thead>
    <tbody>
      <tr class="primary"><td>evolvierte Vielfalt</td>${levelsRow(st)}</tr>
      <tr><td>effektive Arten</td>${levelsRow(stEff, 1)}</tr>
      <tr><td>Größe ⌀</td>${levelsRow(stSize)}</tr>
    </tbody>
  </table></div>
  <p>Die gezählten Arten steigen mit der Störung stark, die Vielfalt nicht. Störung verdoppelt die Geburten, und mehr Geburten erzeugen mehr Linien, die die Artschwelle überschreiten.</p>
</section>

<section class="exp">
  <span class="verdict no">Hypothese nicht gestützt</span>
  <h2>Produktivität: mehr Futter, mehr Vielfalt, mehr Jäger</h2>
  <p>Statt eines Höckers steigt die evolvierte Vielfalt stetig mit der Algenwachstumsrate (ρ = ${de(pr.rho)}, p (Holm) = ${pde(pr.pHolm)}). Größere Populationen halten mehr Variation; ob die Produktivität nur über die Bestandsgröße wirkt, trennt dieser Versuch nicht.</p>
  <figure>
    ${dotPlot('produktivitaet', 'evolvedDiv')}
    <figcaption>Evolvierte Vielfalt je Algenwachstumsrate.</figcaption>
  </figure>
  <p>Der Anteil der Tiere, die schon gejagt haben, steigt von ${de(prHunt.perLevel[0].mean * 100, 0)} % auf ${de(prHunt.perLevel.at(-1).mean * 100, 0)} %: Produktivere Systeme tragen mehr Räuber.</p>
</section>

<section class="exp">
  <span class="verdict ctl">Kontrollversuch bestanden</span>
  <h2>Gezählte Arten täuschen</h2>
  <p>Die Artschwelle legt fest, ab wann eine Linie als neue Art zählt. Sie ist reine Beobachtung. Auf allen vier Stufen laufen die Welten bitgenau gleich; nur die Zählung ändert sich.</p>
  <div class="tbl"><table class="data">
    <thead><tr><th>Artschwelle</th>${art[0].perLevel.map((p) => `<th>${esc(p.label)}</th>`).join('')}</tr></thead>
    <tbody>
      ${art.map((a) => `<tr${a.response === 'richness' ? ' class="primary"' : ''}><td>${{ richness: 'Artenzahl', effSpecies: 'effektive Arten', evolvedDiv: 'evolvierte Vielfalt', geneticDiv: 'genetische Vielfalt', pop: 'Tiere' }[a.response]}</td>${levelsRow(a, a.response === 'pop' ? 0 : 2)}</tr>`).join('')}
    </tbody>
  </table></div>
  <p>In allen drei ökologischen Versuchen liefen Artenzahl und evolvierte Vielfalt auseinander: Mit Räubern gab es weniger gezählte Arten, aber mehr Vielfalt. Wer mehr Tiere und mehr Geburten hat, zählt mehr Arten. Die Feldökologie kennt das Problem und vergleicht Artenzahlen deshalb nur bei gleicher Stichprobengröße.</p>
</section>

<footer>
  <p>Methode: gepaarte Saaten (jede Saat auf jeder Stufe), Einwanderung nur bis Tag 10, Auswertung über die Tage 40 bis 60, Bootstrap-Intervalle, exakte Vorzeichen- und Blockpermutationstests, Holm-Korrektur. Modell nach ODD-Protokoll in <code>MODELL.md</code>, Auswertung in <code>EXPERIMENTE.md</code>, Rohdaten in <code>results/</code>.</p>
  <p>Code-Stand <code>${esc(commit)}</code>. Jede Zahl ist mit <code>node tools/experiment.mjs experiments/&lt;versuch&gt;.json</code> bitgenau reproduzierbar; diese Seite entsteht mit <code>node tools/report-page.mjs</code>.</p>
</footer>
</div>
`;

writeFileSync(join(root, 'dist', 'versuche.html'), html);
console.log(`dist/versuche.html geschrieben (${(html.length / 1024).toFixed(1)} KB, ${totalRuns} Läufe)`);
