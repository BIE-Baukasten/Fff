// Analysis of the marker study, following the preregistered plan (docs/PRAEREGISTRIERUNG.md).
// Writes results/summary.json, results/web-summary.json, docs/ERGEBNISSE.md and docs/fig/*.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { mean, sd, bootstrapCI, hedgesG, pearson, eigSym } from '../src/experiments/stats.js';
import { LESIONS } from '../src/core/config.js';

const S = JSON.parse(readFileSync(process.argv[2] || 'results/study.json', 'utf8'));
const TAG = process.argv[3] || '';
const sfx = TAG ? '-' + TAG : '';
const CONDS = Object.keys(LESIONS).filter(c => S.results.some(r => r.lesion === c));
const SHORT = { full: 'voll', noGW: '−GW', noAST: '−AST', noMeta: '−Meta', noAffect: '−Affekt', noMemory: '−Gedächtnis', minimal: 'minimal' };
const by = c => S.results.filter(r => r.lesion === c);
const ok = r => r.rearedAlive && r.markers.delay && !r.markers.delay.error;
const m = (r, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), r.markers);

// ---- marker definitions: value extractor, null level, direction --------------------------------
const MARKERS = [
  { id: 'M1a', label: 'Verzögerungskonditionierung', get: r => m(r, 'delay.cr'), null: 0, unit: 'ΔV' },
  { id: 'M1b', label: 'Spurkonditionierung (18 Ticks Lücke)', get: r => m(r, 'trace.cr'), null: 0, unit: 'ΔV' },
  { id: 'M2a-d', label: 'Trade-off: Schaden hemmt Durchqueren', get: r => -m(r, 'tradeoff.bDamage'), null: 0, unit: '−β' },
  { id: 'M2a-q', label: 'Trade-off: Futterqualität fördert', get: r => m(r, 'tradeoff.bQuality'), null: 0, unit: 'β' },
  { id: 'M2b', label: 'Trade-off bedarfsabhängig (Hunger)', get: r => m(r, 'tradeoff.bHunger'), null: 0, unit: 'β' },
  { id: 'M3-int', label: 'Konfidenz sagt Fehler voraus (intern)', get: r => m(r, 'optout.aurocConf'), null: 0.5, unit: 'AUROC', internal: true },
  { id: 'M3-i', label: 'Opt-out sagt Fehler voraus (gesamt)', get: r => m(r, 'optout.aurocOverall'), null: 0.5, unit: 'AUROC' },
  { id: 'M3-ii', label: 'Opt-out innerhalb gleicher Schwierigkeit', get: r => m(r, 'optout.aurocWithin'), null: 0.5, unit: 'AUROC' },
  { id: 'M3-h', label: 'Hampton-Vorteil (frei − erzwungen)', get: r => m(r, 'optout.hampton'), null: 0, unit: 'Δ Treffer' },
  { id: 'M4', label: 'Analgesie-Präferenz nur bei Verletzung', get: r => m(r, 'analgesia.cppDiff'), null: 0, unit: 'Δ Zeitanteil' },
  { id: 'M5-perf', label: 'Wahlleistung bei hohem Kontrast', get: r => m(r, 'masking.perfHigh'), null: 0.5, unit: 'Treffer' },
  { id: 'M5-rep', label: 'Verzögerter Bericht bei hohem Kontrast', get: r => m(r, 'masking.reportHigh'), null: 0, unit: 'korr. Bericht' },
  { id: 'M5-dis', label: 'Leistung ohne Bericht (Blindsicht-Signatur)', get: r => m(r, 'masking.unreportedPerf'), null: 0, unit: 'Treffer − ½' },
  { id: 'M6', label: 'Negatives Patterning (konfigural)', get: r => m(r, 'patterning.npIndex'), null: 0, unit: 'ΔV' },
  { id: 'M7', label: 'Vigilanz (d′)', get: r => m(r, 'vigilance.dprime'), null: 0, unit: 'd′' },
  { id: 'M8', label: 'PCI-Analogon wach − Schlaf', get: r => m(r, 'pciWake.pci') - m(r, 'pciSleep.pci'), null: 0, unit: 'ΔPCI', explorative: true },
];
const FITNESS = [
  { id: 'M9-s', label: 'Überleben 30 000 Ticks (natürliche Welt)', get: r => m(r, 'fitness.survived'), unit: 'Anteil' },
  { id: 'M9-d', label: 'Mittlerer homöostatischer Antrieb D', get: r => m(r, 'fitness.meanDrive'), unit: 'D', lowerBetter: true },
  { id: 'M9-l', label: 'Lebensdauer', get: r => m(r, 'fitness.lifespan'), unit: 'Ticks' },
];

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const summary = { n: S.results.length, created: S.created, conditions: CONDS, excluded: {}, markers: [], fitness: [] };
for (const c of CONDS) summary.excluded[c] = by(c).filter(r => !ok(r)).map(r => r.seed);

const fullVals = mk => by('full').filter(ok).map(mk.get).filter(Number.isFinite);
for (const mk of MARKERS) {
  const row = { id: mk.id, label: mk.label, unit: mk.unit, null: mk.null, byCond: {} };
  for (const c of CONDS) {
    const v = by(c).filter(ok).map(mk.get).filter(Number.isFinite);
    const ci = bootstrapCI(v);
    const pass = v.length >= 3 && ci[0] > mk.null;
    row.byCond[c] = { n: v.length, mean: mean(v), sd: sd(v), ci, pass, g: c === 'full' ? null : hedgesG(fullVals(mk), v), values: v };
  }
  summary.markers.push(row);
}
for (const mk of FITNESS) {
  const row = { id: mk.id, label: mk.label, unit: mk.unit, byCond: {} };
  for (const c of CONDS) {
    const v = by(c).map(mk.get).filter(Number.isFinite);
    row.byCond[c] = { n: v.length, mean: mean(v), ci: bootstrapCI(v), g: c === 'full' ? null : hedgesG(by('full').map(mk.get), v) };
  }
  row.causes = Object.fromEntries(CONDS.map(c => [c, by(c).map(r => m(r, 'fitness.cause')).filter(Boolean)]));
  summary.fitness.push(row);
}

// ---- cluster test: do markers co-vary across individuals as one factor? -------------------------
const CL = ['M1a', 'M1b', 'M2a-d', 'M2b', 'M3-i', 'M4', 'M5-rep', 'M5-dis', 'M6', 'M7'];
const inds = S.results.filter(ok);
const X = inds.map(r => CL.map(id => MARKERS.find(k => k.id === id).get(r)));
const complete = X.filter(row => row.every(Number.isFinite));
const cols = CL.map((_, j) => complete.map(r => r[j]));
const R = CL.map((_, i) => CL.map((_, j) => (i === j ? 1 : pearson(cols[i], cols[j]))));
const eig = eigSym(R.map(r => r.map(v => (Number.isFinite(v) ? v : 0))));
const tot = eig.values.reduce((a, b) => a + Math.max(0, b), 0);
summary.cluster = { markers: CL, n: complete.length, R, eigenvalues: eig.values, pc1Share: eig.values[0] / tot, pc1Loadings: eig.vectors[0],
  kaiser: eig.values.filter(v => v > 1).length };
// within-condition correlation (removes the between-lesion structure)
const zw = complete.map((row, i) => row); void zw;

// ---- profile per condition: which markers pass ---------------------------------------------------
summary.profiles = Object.fromEntries(CONDS.map(c => [c, summary.markers.filter(k => !k.internal).map(k => (k.byCond[c].pass ? 1 : 0))]));

writeFileSync(`results/summary${sfx}.json`, JSON.stringify(summary, (k, v) => (k === 'values' ? undefined : v), 1));

// ---- figures ---------------------------------------------------------------------------------------
mkdirSync('docs/fig', { recursive: true });
const svgOpen = (w, h, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif" font-size="12"><title>${title}</title><rect width="${w}" height="${h}" fill="#ffffff"/>`;
const COLORS = { full: '#0d7a78', noGW: '#c2410c', noAST: '#7c3aed', noMeta: '#2563eb', noAffect: '#b0394a', noMemory: '#8a6d1d', minimal: '#6b7280' };

// Fig 1: marker × condition matrix (effect relative to null, colour = pass)
{
  const mk = summary.markers, LW = 300, W = LW + CONDS.length * 82, H = 60 + mk.length * 26;
  let s = svgOpen(W, H, 'Marker × Architektur');
  CONDS.forEach((c, j) => { s += `<text x="${LW + j * 82 + 41}" y="34" text-anchor="middle" font-weight="600">${SHORT[c]}</text>`; });
  mk.forEach((k, i) => {
    const y = 48 + i * 26;
    s += `<text x="8" y="${y + 16}" fill="#1b2520">${k.id} ${k.label.length > 40 ? k.label.slice(0, 39) + '…' : k.label}</text>`;
    CONDS.forEach((c, j) => {
      const r = k.byCond[c];
      const fill = r.n === 0 ? '#eeeeee' : r.pass ? '#cfe9e5' : '#f6dadd';
      s += `<rect x="${LW + j * 82 + 3}" y="${y}" width="76" height="22" rx="4" fill="${fill}"/>`;
      s += `<text x="${LW + j * 82 + 41}" y="${y + 15}" text-anchor="middle" fill="#1b2520">${fmt(r.mean)}</text>`;
    });
  });
  writeFileSync(`docs/fig/${TAG ? TAG + '-' : ''}marker-matrix.svg`, s + '</svg>');
}
// Fig 2: conditioning curves (full vs noGW), trace and delay
function curveFig(file, title, series) {
  const W = 660, H = 230, L = 46, B = 34, T = 28, PR = 150;
  const all = series.flatMap(sr => sr.y);
  const ymax = Math.max(0.1, ...all), ymin = Math.min(0, ...all), n = series[0].y.length;
  const X = i => L + (i / (n - 1)) * (W - L - PR), Y = v => H - B - ((v - ymin) / (ymax - ymin)) * (H - B - T);
  let s = svgOpen(W, H, title) + `<text x="${L}" y="18" font-weight="600">${title}</text>`;
  for (let k = 0; k <= 4; k++) { const v = ymin + (k / 4) * (ymax - ymin); s += `<line x1="${L}" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="#555">${v.toFixed(2)}</text>`; }
  s += `<text x="${(W - PR + L) / 2}" y="${H - 6}" text-anchor="middle" fill="#555">Ticks nach CS-Beginn (US bei 24)</text>`;
  for (const sr of series) s += `<polyline fill="none" stroke="${sr.color}" stroke-width="2" ${sr.dash ? 'stroke-dasharray="5 4"' : ''} points="${sr.y.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  series.forEach((sr, i) => { s += `<rect x="${W - PR + 14}" y="${T + 4 + i * 16}" width="12" height="3" fill="${sr.color}"/><text x="${W - PR + 32}" y="${T + 9 + i * 16}">${sr.label}</text>`; });
  writeFileSync(`docs/fig/${TAG ? TAG + '-' : ''}` + file, s + '</svg>');
}
const avgCurve = (c, proto, key) => { const rs = by(c).filter(ok).map(r => m(r, `${proto}.${key}`)).filter(Boolean); return rs[0].map((_, i) => mean(rs.map(x => x[i]))); };
if (CONDS.includes('noGW') && CONDS.includes('full')) for (const proto of ['trace', 'delay']) {
  curveFig(`${proto}-curves.svg`, proto === 'trace' ? 'Spurkonditionierung: konditionierte Erwartung V' : 'Verzögerungskonditionierung: konditionierte Erwartung V', [
    { label: 'voll, CS+', y: avgCurve('full', proto, 'curvePlus'), color: COLORS.full },
    { label: 'voll, CS−', y: avgCurve('full', proto, 'curveMinus'), color: COLORS.full, dash: true },
    { label: '−GW, CS+', y: avgCurve('noGW', proto, 'curvePlus'), color: COLORS.noGW },
    { label: '−GW, CS−', y: avgCurve('noGW', proto, 'curveMinus'), color: COLORS.noGW, dash: true },
  ]);
}
// Fig 3: masking — performance and corrected report vs contrast
{
  const W = 520, H = 250, L = 46, B = 36, T = 28;
  const cs = S.results.find(r => m(r, 'masking.contrasts'))?.markers.masking.contrasts || [];
  const X = c => L + c * (W - L - 16), Y = v => H - B - v * (H - B - T);
  let s = svgOpen(W, H, 'Maskierte Reize') + `<text x="${L}" y="18" font-weight="600">Maskierte Reize: Wahlleistung (durchgezogen) vs. Bericht (gestrichelt)</text>`;
  for (let k = 0; k <= 4; k++) s += `<line x1="${L}" x2="${W - 16}" y1="${Y(k / 4)}" y2="${Y(k / 4)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${Y(k / 4) + 4}" text-anchor="end" fill="#555">${(k / 4).toFixed(2)}</text>`;
  cs.forEach(c => { s += `<text x="${X(c)}" y="${H - 18}" text-anchor="middle" fill="#555">${c}</text>`; });
  s += `<text x="${(W + L) / 2}" y="${H - 3}" text-anchor="middle" fill="#555">Reizkontrast</text>`;
  ['full', 'noGW'].filter(c => CONDS.includes(c)).forEach((c, i) => {
    const acc = cs.map((_, k) => mean(by(c).filter(ok).map(r => r.markers.masking.acc[k])));
    const rep = cs.map((_, k) => mean(by(c).filter(ok).map(r => r.markers.masking.rep[k])));
    s += `<polyline fill="none" stroke="${COLORS[c]}" stroke-width="2" points="${acc.map((v, k) => `${X(cs[k])},${Y(v)}`).join(' ')}"/>`;
    s += `<polyline fill="none" stroke="${COLORS[c]}" stroke-width="2" stroke-dasharray="5 4" points="${rep.map((v, k) => `${X(cs[k])},${Y(Math.max(0, v))}`).join(' ')}"/>`;
    s += `<rect x="${W - 120}" y="${T + 4 + i * 16}" width="12" height="3" fill="${COLORS[c]}"/><text x="${W - 102}" y="${T + 9 + i * 16}">${SHORT[c]}</text>`;
  });
  writeFileSync(`docs/fig/${TAG ? TAG + '-' : ''}masking.svg`, s + '</svg>');
}
// Fig 4: hunger effect in trade-off per condition (P(cross) hungry vs sated)
{
  const W = 520, H = 230, L = 46, B = 44, T = 28, bw = (W - L - 10) / CONDS.length;
  const Y = v => H - B - v * (H - B - T);
  let s = svgOpen(W, H, 'Trade-off') + `<text x="${L}" y="18" font-weight="600">Dornen durchqueren für Futter: hungrig (dunkel) vs. satt (hell)</text>`;
  for (let k = 0; k <= 4; k++) s += `<line x1="${L}" x2="${W - 10}" y1="${Y(k / 4)}" y2="${Y(k / 4)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${Y(k / 4) + 4}" text-anchor="end" fill="#555">${(k / 4).toFixed(2)}</text>`;
  CONDS.forEach((c, j) => {
    const h = mean(by(c).filter(ok).map(r => m(r, 'tradeoff.pCrossHungry'))), sa = mean(by(c).filter(ok).map(r => m(r, 'tradeoff.pCrossSated')));
    const x = L + j * bw + 6;
    if (Number.isFinite(h)) s += `<rect x="${x}" y="${Y(h)}" width="${bw / 2 - 6}" height="${Y(0) - Y(h)}" fill="${COLORS[c]}"/>`;
    if (Number.isFinite(sa)) s += `<rect x="${x + bw / 2 - 4}" y="${Y(sa)}" width="${bw / 2 - 6}" height="${Y(0) - Y(sa)}" fill="${COLORS[c]}" opacity="0.4"/>`;
    s += `<text x="${x + bw / 2 - 5}" y="${H - B + 16}" text-anchor="middle" fill="#333">${SHORT[c]}</text>`;
  });
  writeFileSync(`docs/fig/${TAG ? TAG + '-' : ''}tradeoff.svg`, s + '</svg>');
}

// ---- markdown report tables -------------------------------------------------------------------------
let md = `# Ergebnisse der Markerstudie (automatisch erzeugt)\n\nErzeugt aus \`results/study.json\` (${S.created}). N = ${S.results.length} Individuen, ${CONDS.length} Bedingungen. `;
md += `Ausgeschlossen (bei der Aufzucht gestorben): ${CONDS.map(c => `${SHORT[c]}: ${summary.excluded[c].length}`).join(', ')}.\n\n`;
md += `Zelle: Mittelwert [95-%-Bootstrap-KI]; **fett** = bestanden (KI schließt Nullniveau aus); g = Hedges g gegenüber »voll«.\n\n`;
md += `| Marker | Null | ${CONDS.map(c => SHORT[c]).join(' | ')} |\n|---|---|${CONDS.map(() => '---').join('|')}|\n`;
for (const k of summary.markers) {
  md += `| ${k.id} ${k.label}${k.internal ? ' *(intern)*' : ''} | ${k.null} | ${CONDS.map(c => { const r = k.byCond[c]; const t = `${fmt(r.mean)} [${fmt(r.ci[0])}, ${fmt(r.ci[1])}]${r.g != null ? ` g=${fmt(r.g, 1)}` : ''}`; return r.pass ? `**${t}**` : t; }).join(' | ')} |\n`;
}
md += `\n## Fitness in der natürlichen Welt (M9)\n\n| Kennzahl | ${CONDS.map(c => SHORT[c]).join(' | ')} |\n|---|${CONDS.map(() => '---').join('|')}|\n`;
for (const k of summary.fitness) md += `| ${k.label} | ${CONDS.map(c => { const r = k.byCond[c]; return `${fmt(r.mean, k.id === 'M9-l' ? 0 : 2)} [${fmt(r.ci[0], k.id === 'M9-l' ? 0 : 2)}, ${fmt(r.ci[1], k.id === 'M9-l' ? 0 : 2)}]`; }).join(' | ')} |\n`;
md += `\nTodesursachen: ${CONDS.map(c => `${SHORT[c]}: ${summary.fitness[0].causes[c].join(', ') || '–'}`).join('; ')}\n`;
md += `\n## Cluster-Test\n\nKorrelationsmatrix der ${CL.length} Marker-Kennzahlen über ${complete.length} Individuen. Erster Hauptfaktor erklärt **${(summary.cluster.pc1Share * 100).toFixed(1)} %** der Varianz; Eigenwerte > 1: **${summary.cluster.kaiser}**.\n\n`;
md += `Eigenwerte: ${eig.values.map(v => v.toFixed(2)).join(', ')}\n\nLadungen PC1: ${CL.map((id, i) => `${id} ${fmt(eig.vectors[0][i])}`).join(', ')}\n\n`;
md += `| | ${CL.join(' | ')} |\n|---|${CL.map(() => '---').join('|')}|\n`;
R.forEach((row, i) => { md += `| ${CL[i]} | ${row.map(v => fmt(v)).join(' | ')} |\n`; });
md += `\n## Abbildungen\n\n![Marker-Matrix](fig/marker-matrix.svg)\n\n![Spurkonditionierung](fig/trace-curves.svg)\n\n![Verzögerungskonditionierung](fig/delay-curves.svg)\n\n![Maskierung](fig/masking.svg)\n\n![Trade-off](fig/tradeoff.svg)\n`;
writeFileSync(`docs/ERGEBNISSE${sfx}.md`, md.replace(/\(fig\//g, `(fig/${TAG ? TAG + '-' : ''}`));

// ---- compact version for the web page -----------------------------------------------------------------
const web = {
  n: S.results.length, conditions: CONDS, short: SHORT, labels: Object.fromEntries(CONDS.map(c => [c, LESIONS[c].label])),
  markers: summary.markers.filter(k => !k.internal && !k.explorative).map(k => ({ id: k.id, label: k.label, byCond: Object.fromEntries(CONDS.map(c => [c, { n: k.byCond[c].n, pass: k.byCond[c].pass, text: `${SHORT[c]}: ${fmt(k.byCond[c].mean)} [${fmt(k.byCond[c].ci[0])}, ${fmt(k.byCond[c].ci[1])}]` }])) })),
  pc1Share: summary.cluster.pc1Share,
};
if (!TAG) writeFileSync('results/web-summary.json', JSON.stringify(web));
console.log(md.split('\n## Fitness')[0]);
console.log('PC1 share', summary.cluster.pc1Share.toFixed(3), 'kaiser', summary.cluster.kaiser);
