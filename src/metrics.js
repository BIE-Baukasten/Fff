// Messgrößen einer Welt zu einem Zeitpunkt. Reine Beobachtung: nichts hier verändert die Welt
// oder verbraucht ihren Zufall. Gerechnet wird mit detmath, damit auch die Messreihen
// in jeder Engine bitgenau gleich ausfallen.

import { dexp, dlog } from './detmath.js';
import { genomeDistance } from './genome.js';

// Reihenfolge und Bedeutung der Spalten in jeder Messreihe (CSV).
export const METRICS = [
  ['day', 'Tag', 'Zeit in Tagen seit Beginn'],
  ['pop', 'Tiere', 'Anzahl lebender Tiere'],
  ['richness', 'Artenzahl', 'lebende benannte Arten (hängt von der Artschwelle ab)'],
  ['shannon', 'Shannon H′', 'Shannon-Index über die Arten, natürlicher Logarithmus'],
  ['effSpecies', 'effektive Arten', 'exp(H′): Zahl gleich häufiger Arten mit derselben Vielfalt'],
  ['simpson', 'Simpson 1−D', 'Wahrscheinlichkeit, dass zwei zufällige Tiere verschiedenen Arten angehören'],
  ['geneticDiv', 'genetische Vielfalt', 'mittlerer Erbgut-Abstand zweier Tiere; unabhängig von der Artdefinition'],
  ['evolvedDiv', 'evolvierte Vielfalt', 'mittlerer Erbgut-Abstand zweier Tiere derselben Gründerlinie: im Becken entstandene Vielfalt'],
  ['lineages', 'Gründerlinien', 'Zahl der überlebenden Gründerlinien (eingewanderte Arten samt Nachfahren)'],
  ['sizeMean', 'Größe ⌀', 'mittlere Körpergröße'],
  ['sizeSd', 'Größe σ', 'Standardabweichung der Körpergröße'],
  ['senseMean', 'Sicht ⌀', 'mittlere Sichtweite'],
  ['mutMean', 'Mutationsrate ⌀', 'mittlere (selbst evolvierende) Mutationsrate'],
  ['speedMean', 'Schub ⌀', 'mittlerer Schub (gleitender Mittelwert je Tier, 0…1)'],
  ['attackShare', 'Angriffslust', 'Anteil der Tiere, deren Angriffsausgang gerade aktiv ist'],
  ['hunterShare', 'Jägeranteil', 'Anteil der Tiere, die schon mindestens ein Tier erbeutet haben'],
  ['genMean', 'Generation ⌀', 'mittlere Generation der lebenden Tiere'],
  ['genMax', 'Generation max', 'höchste Generation unter den lebenden Tieren'],
  ['algae', 'Algen ⌀', 'mittlere Algendichte je Zelle (1 = gesättigt)'],
  ['births', 'Geburten Σ', 'Geburten seit Beginn'],
  ['deathsHunger', 'verhungert Σ', 'verhungerte Tiere seit Beginn'],
  ['deathsAge', 'Altersschwäche Σ', 'an Altersschwäche gestorbene Tiere seit Beginn'],
  ['deathsEaten', 'gefressen Σ', 'gefressene Tiere seit Beginn'],
  ['deathsDisturbed', 'Störung Σ', 'durch Störungen gestorbene Tiere seit Beginn'],
  ['immigrants', 'Einwanderer Σ', 'eingewanderte Tiere seit Beginn (ohne Gründer)'],
  ['speciations', 'Artbildungen Σ', 'neu benannte Arten seit Beginn'],
  ['extinctions', 'Aussterben Σ', 'ausgestorbene benannte Arten seit Beginn'],
];

export const METRIC_KEYS = METRICS.map((m) => m[0]);

const GENETIC_SAMPLE = 60;

export function measure(w) {
  const cs = w.creatures;
  const n = cs.length;
  const out = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
  out.day = w.t / 600;
  out.pop = n;

  const counts = new Map();
  const roots = new Set();
  let size = 0;
  let size2 = 0;
  let sense = 0;
  let mut = 0;
  let speed = 0;
  let attack = 0;
  let hunters = 0;
  let gen = 0;
  let genMax = 0;
  for (const c of cs) {
    const d = w.displayClade(c.clade);
    const id = d ? d.id : 0;
    counts.set(id, (counts.get(id) || 0) + 1);
    roots.add(rootOf(w, c));
    size += c.g.size;
    size2 += c.g.size * c.g.size;
    sense += c.g.sense;
    mut += c.g.mut;
    speed += c.speedAvg;
    if (c.attacking) attack++;
    if (c.kills > 0) hunters++;
    gen += c.gen;
    if (c.gen > genMax) genMax = c.gen;
  }

  if (n > 0) {
    out.richness = counts.size;
    let H = 0;
    let D = 0;
    for (const k of counts.values()) {
      const p = k / n;
      H -= p * dlog(p);
      D += p * p;
    }
    out.shannon = H;
    out.effSpecies = dexp(H);
    out.simpson = 1 - D;
    out.sizeMean = size / n;
    out.sizeSd = Math.sqrt(Math.max(0, size2 / n - out.sizeMean * out.sizeMean));
    out.senseMean = sense / n;
    out.mutMean = mut / n;
    out.speedMean = speed / n;
    out.attackShare = attack / n;
    out.hunterShare = hunters / n;
    out.genMean = gen / n;
    out.genMax = genMax;
    const gd = geneticDiversity(cs, (c) => rootOf(w, c));
    out.geneticDiv = gd.all;
    out.evolvedDiv = gd.within;
    out.lineages = roots.size;
  }

  let a = 0;
  for (let i = 0; i < w.algae.length; i++) a += w.algae[i];
  out.algae = a / w.algae.length;

  const k = w.counters;
  out.births = k.births;
  out.deathsHunger = k.hunger;
  out.deathsAge = k.age;
  out.deathsEaten = k.eaten;
  out.deathsDisturbed = k.disturbed;
  out.immigrants = k.immigrants;
  out.speciations = k.speciations;
  out.extinctions = k.extinctions;
  return out;
}

function rootOf(w, c) {
  return w.clades.get(c.clade)?.root ?? 0;
}

// Mittlerer paarweiser Erbgut-Abstand über eine gleichmäßig verteilte Stichprobe
// (jedes k-te Tier, ohne Zufall): über alle Paare und nur über Paare derselben Gründerlinie.
export function geneticDiversity(cs, lineageOf = () => 0) {
  const n = cs.length;
  if (n < 2) return { all: 0, within: 0 };
  const stride = Math.max(1, Math.ceil(n / GENETIC_SAMPLE));
  const sample = [];
  for (let i = 0; i < n; i += stride) sample.push({ g: cs[i].g, root: lineageOf(cs[i]) });
  let sum = 0;
  let pairs = 0;
  let wSum = 0;
  let wPairs = 0;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const d = genomeDistance(sample[i].g, sample[j].g);
      sum += d;
      pairs++;
      if (sample[i].root === sample[j].root) {
        wSum += d;
        wPairs++;
      }
    }
  }
  return { all: pairs ? sum / pairs : 0, within: wPairs ? wSum / wPairs : 0 };
}

export function toCsv(rows, extra = {}) {
  const extraKeys = Object.keys(extra);
  const head = [...extraKeys, ...METRIC_KEYS].join(',');
  const lines = rows.map((r) => [...extraKeys.map((k) => csvField(extra[k])), ...METRIC_KEYS.map((k) => fmt(r[k]))].join(','));
  return [head, ...lines].join('\n') + '\n';
}

// Felder mit Komma, Anführungszeichen oder Zeilenumbruch in Anführungszeichen setzen (RFC 4180).
export function csvField(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(6);
}
